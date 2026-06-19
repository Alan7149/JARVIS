"""JARVIS GitLab integration — recent activity, merge requests, projects.

The user's Personal Access Token is stored locally (user_settings.json) and
never leaves this machine. The backend proxies the GitLab API so the token
stays server-side and there are no CORS issues.
"""
import logging
from datetime import datetime

from fastapi import APIRouter

from core.settings_store import get, patch

router = APIRouter()
logger = logging.getLogger("jarvis.gitlab")


def _cfg() -> tuple[str, str]:
    host = (get("gitlab_host", "https://gitlab.com") or "https://gitlab.com").rstrip("/")
    return host, get("gitlab_token", "") or ""


async def _gl(path: str, params: dict | None = None):
    host, token = _cfg()
    if not token:
        return None
    import httpx
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{host}/api/v4{path}", headers={"PRIVATE-TOKEN": token}, params=params or {})
    return r


@router.get("/gitlab/status")
async def gitlab_status():
    host, token = _cfg()
    if not token:
        return {"configured": False, "host": host}
    try:
        r = await _gl("/user")
        if r is None or r.status_code != 200:
            return {"configured": False, "host": host, "error": f"Auth failed ({r.status_code if r else '—'})"}
        u = r.json()
        return {"configured": True, "host": host,
                "user": {"name": u.get("name"), "username": u.get("username"),
                         "avatar": u.get("avatar_url"), "url": u.get("web_url")}}
    except Exception as e:
        return {"configured": False, "host": host, "error": str(e)}


@router.post("/gitlab/config")
async def gitlab_config(payload: dict):
    p = {}
    if "host" in payload:
        p["gitlab_host"] = (payload.get("host") or "https://gitlab.com").strip().rstrip("/")
    if "token" in payload:
        p["gitlab_token"] = (payload.get("token") or "").strip()
    patch(p)
    return await gitlab_status()


def _fmt_event(e: dict) -> dict:
    action = e.get("action_name", "")
    target = e.get("target_title", "") or ""
    push = e.get("push_data") or {}
    kind = "other"
    detail = target
    if push:
        kind = "push"
        ref = push.get("ref", "")
        cc = push.get("commit_count", 0)
        detail = f"{cc} commit{'s' if cc != 1 else ''} to {ref}" + (f" — {push.get('commit_title','')}" if push.get("commit_title") else "")
    elif "merge" in action.lower() or e.get("target_type") == "MergeRequest":
        kind = "merge"
    elif e.get("target_type") == "Issue":
        kind = "issue"
    return {
        "kind": kind, "action": action, "detail": detail,
        "project_id": e.get("project_id"),
        "author": (e.get("author") or {}).get("name", ""),
        "created_at": e.get("created_at"),
    }


@router.get("/gitlab/activity")
async def gitlab_activity(per_page: int = 30):
    r = await _gl("/events", {"per_page": per_page})
    if r is None:
        return {"error": "GitLab not configured", "events": []}
    if r.status_code != 200:
        return {"error": f"GitLab error {r.status_code}", "events": []}
    return {"events": [_fmt_event(e) for e in r.json()]}


@router.get("/gitlab/merge-requests")
async def gitlab_mrs(state: str = "opened", per_page: int = 20):
    r = await _gl("/merge_requests", {"scope": "all", "state": state, "order_by": "updated_at", "per_page": per_page})
    if r is None or r.status_code != 200:
        return {"merge_requests": [], "error": None if r is None else f"GitLab error {r.status_code}"}
    out = []
    for m in r.json():
        out.append({
            "id": m.get("iid"), "title": m.get("title"), "state": m.get("state"),
            "source": m.get("source_branch"), "target": m.get("target_branch"),
            "author": (m.get("author") or {}).get("name", ""),
            "web_url": m.get("web_url"), "updated_at": m.get("updated_at"),
            "draft": m.get("draft", False), "project": m.get("references", {}).get("full", ""),
        })
    return {"merge_requests": out}


@router.get("/gitlab/projects")
async def gitlab_projects(per_page: int = 20):
    r = await _gl("/projects", {"membership": "true", "order_by": "last_activity_at",
                                "per_page": per_page, "simple": "true"})
    if r is None or r.status_code != 200:
        return {"projects": [], "error": None if r is None else f"GitLab error {r.status_code}"}
    out = []
    for p in r.json():
        out.append({
            "id": p.get("id"), "name": p.get("name"), "path": p.get("path_with_namespace"),
            "url": p.get("web_url"), "last_activity": p.get("last_activity_at"),
            "stars": p.get("star_count", 0),
        })
    return {"projects": out}


@router.get("/gitlab/commits")
async def gitlab_commits(project_id: int, per_page: int = 15):
    r = await _gl(f"/projects/{project_id}/repository/commits", {"per_page": per_page})
    if r is None or r.status_code != 200:
        return {"commits": []}
    return {"commits": [{
        "id": c.get("short_id"), "title": c.get("title"), "author": c.get("author_name"),
        "created_at": c.get("created_at"), "url": c.get("web_url"),
    } for c in r.json()]}
