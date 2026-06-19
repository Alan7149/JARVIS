"""Code Intelligence API — review, explain, improve, security, performance.

All AI-backed endpoints now route through tools.llm_provider.llm_complete,
which prefers Claude (ANTHROPIC_API_KEY) and falls back to Groq. Each response
carries `provider`/`model` so the UI can show what answered.
"""
import json
import logging
import re as _re
from pathlib import Path
from fastapi import APIRouter

from tools.llm_provider import llm_complete, active_provider

router = APIRouter()
logger = logging.getLogger("jarvis.code_intel")


def _extract_json(text: str) -> dict | None:
    """Best-effort parse of a JSON object from an LLM reply.

    Models sometimes wrap JSON in ```json fences or add prose around it, so we
    strip fences first, then fall back to grabbing the outermost {...} block.
    Returns None if nothing parses.
    """
    if not text:
        return None
    cleaned = _re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=_re.MULTILINE)
    try:
        return json.loads(cleaned)
    except Exception:
        pass
    m = _re.search(r"\{.*\}", cleaned, _re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            return None
    return None

CODE_EXTENSIONS = {'.py','.js','.ts','.jsx','.tsx','.go','.rs','.java','.cpp','.c','.cs','.rb','.php','.swift','.kt'}

PROMPTS = {
    'review': """You are a senior engineer doing a code review. Analyze this code for:
1. BUGS & ERRORS — logic errors, null checks, edge cases
2. CODE QUALITY — readability, naming, structure
3. BEST PRACTICES — patterns, anti-patterns, conventions
4. MAINTAINABILITY — coupling, complexity, documentation

Format:
SEVERITY: [CRITICAL/WARNING/INFO/CLEAN]
ISSUES:
[numbered list of specific issues with line references]
SUMMARY: [one sentence]""",

    'explain': """You are a senior engineer explaining code to a junior developer.
Explain this code:
1. What it does overall (1-2 sentences)
2. How it works step by step
3. Key concepts used
4. Any gotchas or important notes

Be clear and educational. Use simple language.""",

    'improve': """You are a senior engineer refactoring code. Provide:
1. REFACTORED VERSION — improved, cleaner code
2. WHAT CHANGED — bullet points of improvements
3. WHY IT'S BETTER — specific benefits (readability, performance, maintainability)
4. FURTHER IMPROVEMENTS — additional suggestions

Provide the actual improved code, not just suggestions.""",

    'security': """You are a security engineer auditing this code. Check for:
1. INJECTION VULNERABILITIES — SQL, command, XSS injection
2. AUTHENTICATION/AUTHORIZATION — missing checks, privilege escalation
3. DATA EXPOSURE — secrets, PII, sensitive data in logs/responses
4. INPUT VALIDATION — missing validation, type coercion issues
5. DEPENDENCY RISKS — known vulnerable patterns

SEVERITY: [CRITICAL/HIGH/MEDIUM/LOW/SAFE]
For each issue: line reference + exploit scenario + fix""",

    'performance': """You are a performance engineer analyzing this code. Identify:
1. ALGORITHMIC COMPLEXITY — O(n²) loops, redundant operations
2. MEMORY ISSUES — leaks, unnecessary allocations, large objects in scope
3. I/O BOTTLENECKS — synchronous calls, missing caching, N+1 queries
4. OPTIMIZED VERSION — rewrite the hot path with improvements
5. ESTIMATED IMPROVEMENT — rough % gain

Provide concrete, measurable improvements.""",
}


async def _analyze(code: str, mode: str, filename: str = "code") -> dict:
    lang = Path(filename).suffix.lstrip('.') or 'code'
    prompt = f"File: {filename}\nLanguage: {lang}\n\n```{lang}\n{code[:12000]}\n```\n\n{PROMPTS[mode]}"
    out = await llm_complete(
        system="You are an expert code analyst. Be specific, actionable, and reference line numbers where possible.",
        user=prompt,
        max_tokens=1800,
    )
    if "error" in out:
        return out
    review = out["text"]
    # Detect severity
    severity = "INFO"
    for s in ["CRITICAL", "HIGH", "WARNING", "SAFE", "CLEAN"]:
        if s in review.upper():
            severity = s; break
    return {
        "review": review, "severity": severity, "mode": mode, "file": filename,
        "provider": out["provider"], "model": out["model"],
    }


@router.post("/code-review/analyze")
async def analyze_code(payload: dict):
    """Analyze pasted code."""
    code = payload.get("code", "")
    mode = payload.get("mode", "review")
    filename = payload.get("filename", "pasted_code.py")
    if not code.strip():
        return {"error": "No code provided"}
    if mode not in PROMPTS:
        mode = "review"
    return await _analyze(code, mode, filename)


@router.post("/code-review/file")
async def analyze_file(payload: dict):
    """Analyze a file or directory."""
    path_str = payload.get("path", "")
    mode = payload.get("mode", "review")
    path = Path(path_str)

    if not path.exists():
        return {"error": f"Path not found: {path_str}"}

    if path.is_file():
        if path.suffix.lower() not in CODE_EXTENSIONS:
            return {"error": f"Unsupported file type: {path.suffix}"}
        code = path.read_text(encoding="utf-8", errors="ignore")[:8000]
        return await _analyze(code, mode, path.name)

    # Directory — review all code files
    results = []
    for f in path.rglob("*"):
        if f.suffix.lower() in CODE_EXTENSIONS and not any(p.startswith('.') for p in f.parts):
            try:
                code = f.read_text(encoding="utf-8", errors="ignore")[:4000]
                r = await _analyze(code, mode, f.name)
                results.append(r)
                if len(results) >= 5:  # Limit to 5 files for now
                    break
            except Exception:
                pass

    if not results:
        return {"error": "No code files found in directory"}

    # Combine results
    combined = "\n\n" + "="*50 + "\n\n".join(
        f"FILE: {r['file']}\nSEVERITY: {r.get('severity','?')}\n{r.get('review','')}"
        for r in results
    )
    worst = max(results, key=lambda r: ["CLEAN","INFO","LOW","MEDIUM","WARNING","HIGH","CRITICAL"].index(r.get("severity","INFO")) if r.get("severity","INFO") in ["CLEAN","INFO","LOW","MEDIUM","WARNING","HIGH","CRITICAL"] else 0)
    return {"review": combined, "severity": worst.get("severity","INFO"), "files_reviewed": len(results)}


@router.post("/code-review/watch")
async def watch_directory(payload: dict):
    """Start watching a directory for file changes."""
    from monitoring.code_reviewer import start_watching
    directory = payload.get("directory", "")
    return start_watching(directory)


@router.post("/code-review/stop")
async def stop_watching():
    """Stop the file watcher."""
    from monitoring.code_reviewer import stop_watching
    stop_watching()
    return {"stopped": True}


@router.get("/code-review/status")
async def review_status():
    from monitoring.code_reviewer import REVIEW_STATE
    return dict(REVIEW_STATE)


# ── New 13 Features ───────────────────────────────────────────────────────────

@router.post("/code/complexity")
async def complexity_heatmap(payload: dict):
    from tools.code_analysis import analyze_complexity
    code = payload.get("code", ""); lang = payload.get("language", "python")
    if not code: return {"error": "No code"}
    return analyze_complexity(code, lang)


@router.post("/code/dead-code")
async def dead_code(payload: dict):
    from tools.code_analysis import find_dead_code
    directory = payload.get("directory", "")
    if not directory: return {"error": "No directory"}
    import asyncio
    return await asyncio.get_event_loop().run_in_executor(None, find_dead_code, directory)


@router.post("/code/duplicates")
async def duplicates(payload: dict):
    from tools.code_analysis import find_duplicates
    directory = payload.get("directory", ""); min_lines = payload.get("min_lines", 6)
    if not directory: return {"error": "No directory"}
    import asyncio
    return await asyncio.get_event_loop().run_in_executor(None, find_duplicates, directory, min_lines)


@router.post("/code/architecture")
async def architecture(payload: dict):
    from tools.code_analysis import generate_architecture_diagram
    directory = payload.get("directory", "")
    if not directory: return {"error": "No directory"}
    import asyncio
    return await asyncio.get_event_loop().run_in_executor(None, generate_architecture_diagram, directory)


@router.post("/code/git-diff")
async def git_diff(payload: dict):
    from tools.code_analysis import get_git_diff, parse_diff_hunks
    repo = payload.get("repo", ""); commits = payload.get("commits", 1)
    if not repo: return {"error": "No repo path"}
    result = get_git_diff(repo, commits)
    if "diff" in result:
        result["hunks"] = parse_diff_hunks(result["diff"])
    return result


@router.post("/code/smells")
async def code_smells(payload: dict):
    from tools.code_analysis import detect_code_smells
    code = payload.get("code", ""); filename = payload.get("filename", "code.py")
    if not code: return {"error": "No code"}
    return detect_code_smells(code, filename)


@router.post("/code/docs-writer")
async def docs_writer(payload: dict):
    code = payload.get("code", ""); lang = payload.get("language", "python")
    if not code: return {"error": "No code"}
    style = "JSDoc" if lang in ("js","ts","jsx","tsx") else "docstrings" if lang == "python" else "comments"
    out = await llm_complete(
        system=f"Add comprehensive {style} documentation to this code. Include: purpose, parameters with types, return values, exceptions, examples. Return ONLY the COMPLETE code with docs added — no prose, no fences.",
        user=f"```{lang}\n{code[:12000]}\n```",
        max_tokens=2500,
    )
    if "error" in out: return out
    documented = _re.sub(r"^```(?:\w+)?\s*|\s*```$", "", out["text"].strip(), flags=_re.MULTILINE)
    # Deterministic before/after diff so the user sees exactly what would change.
    from tools.code_analysis import build_diff_hunks
    diff = build_diff_hunks(code, documented, payload.get("filename", f"code.{lang}"))
    return {
        "documented_code": documented, "language": lang,
        "diff": diff, "improved_code": documented,
        "provider": out["provider"], "model": out["model"],
    }


@router.post("/code/patterns")
async def code_patterns(payload: dict):
    code = payload.get("code", ""); directory = payload.get("directory", "")
    if not code and not directory: return {"error": "No code or directory"}
    if directory:
        files = list(Path(directory).rglob("*.py"))[:5]
        code = "\n\n".join(f.read_text(errors="ignore")[:2000] for f in files)
    out = await llm_complete(
        system="You are a design patterns expert. Identify patterns in code.",
        user=f"Identify all design patterns (GoF + architectural) in this code:\n\n{code[:8000]}\n\nFor each: pattern name, where it's used, why it's used, if it's appropriate.",
        max_tokens=1200,
    )
    if "error" in out: return out
    return {"patterns": out["text"], "provider": out["provider"], "model": out["model"]}


@router.post("/code/comments-check")
async def comments_check(payload: dict):
    code = payload.get("code", "")
    if not code: return {"error": "No code"}
    out = await llm_complete(
        system="You are a code reviewer focused on documentation quality.",
        user=f"Review all comments and documentation in this code:\n```\n{code[:8000]}\n```\n\nFind: 1) Outdated comments (code changed but comment didn't), 2) Missing docs on public functions, 3) Misleading comments, 4) TODO/FIXME debt, 5) Unnecessary comments. Rate each issue CRITICAL/WARNING/INFO.",
        max_tokens=1000,
    )
    if "error" in out: return out
    return {"review": out["text"], "provider": out["provider"], "model": out["model"]}


@router.post("/code/explain-level")
async def explain_level(payload: dict):
    code = payload.get("code", ""); level = payload.get("level", "junior")
    if not code: return {"error": "No code"}
    personas = {
        "5yo": "Explain like the person is 5 years old. Use toy/game analogies. Extremely simple language.",
        "junior": "Explain to a junior developer with 6 months experience. Cover what it does, how, and key concepts.",
        "senior": "Deep technical explanation for a senior engineer. Cover: edge cases, performance, design decisions, trade-offs, alternatives considered.",
        "non-technical": "Explain to a non-technical stakeholder. No jargon. Focus on what it does for the business/user."
    }
    out = await llm_complete(
        system=f"You explain code clearly. {personas.get(level, personas['junior'])}",
        user=f"Explain this code:\n```\n{code[:8000]}\n```",
        max_tokens=1200,
    )
    if "error" in out: return out
    return {"explanation": out["text"], "level": level, "provider": out["provider"], "model": out["model"]}


@router.post("/code/time-complexity")
async def time_complexity(payload: dict):
    code = payload.get("code", "")
    if not code: return {"error": "No code"}
    out = await llm_complete(
        system="You are a computer science professor specializing in algorithm analysis.",
        user=f"Analyze the time and space complexity of this code:\n```\n{code[:8000]}\n```\n\nFor each function/algorithm:\n1. TIME COMPLEXITY: O(?) with full explanation why\n2. SPACE COMPLEXITY: O(?) \n3. BEST/WORST/AVERAGE case\n4. BOTTLENECK: which line/loop causes it\n5. OPTIMIZATION: how to improve if possible\n6. VISUALIZATION: ASCII chart or step-by-step trace showing how work grows with input n",
        max_tokens=1400,
    )
    if "error" in out: return out
    return {"analysis": out["text"], "provider": out["provider"], "model": out["model"]}


@router.post("/code/codebase-understand")
async def codebase_understand(payload: dict):
    """Index and understand an entire codebase."""
    directory = payload.get("directory", ""); question = payload.get("question", "")
    if not directory: return {"error": "No directory"}
    # Read key files
    path = Path(directory)
    files_content = []
    for f in sorted(path.rglob("*"))[:20]:
        if f.suffix.lower() in {'.py','.js','.ts','.go'} and not any(p.startswith('.') for p in f.parts):
            try:
                content = f.read_text(errors="ignore")[:1500]
                files_content.append(f"=== {f.relative_to(path)} ===\n{content}")
            except Exception:
                pass
    combined = "\n\n".join(files_content[:10])
    prompt = f"Codebase at: {directory}\n\nFiles:\n{combined[:10000]}\n\nQuestion: {question or 'Give me a comprehensive understanding of this codebase: architecture, main components, data flow, patterns used, and key insights.'}"
    out = await llm_complete(
        system="You are a senior architect analyzing a codebase. Be specific, insightful, and practical.",
        user=prompt,
        max_tokens=1800,
    )
    if "error" in out: return out
    return {"understanding": out["text"], "files_analyzed": len(files_content),
            "provider": out["provider"], "model": out["model"]}


# ── Refactor & Apply ──────────────────────────────────────────────────────────

IMPROVE_SYSTEM = (
    "You are a senior engineer performing a refactor. You return STRICT JSON only — "
    "no markdown fences, no prose before or after. The JSON must have exactly these keys:\n"
    '  "improved_code": string  — the COMPLETE refactored file, ready to save as-is\n'
    '  "changes": string[]      — concise bullet points of what you changed\n'
    '  "why_better": string     — a clear explanation of WHY the new version is better '
    "than the original (readability, correctness, performance, maintainability), written so "
    "a developer learns from it\n"
    '  "summary": string        — one sentence\n'
    "Preserve behavior and public interfaces unless a change fixes a real bug (call that out "
    "in changes). Keep the same language and style as the input."
)


@router.post("/code/improve")
async def improve_code(payload: dict):
    """Refactor code and return a structured, applyable result.

    Returns improved_code + a deterministic before/after diff + a plain-English
    'why it's better' explanation + the list of changes. The diff is computed
    server-side with difflib so it always matches what /code/apply would write.
    """
    code = payload.get("code", "")
    filename = payload.get("filename", "code.py")
    if not code.strip():
        return {"error": "No code provided"}

    lang = Path(filename).suffix.lstrip('.') or 'code'
    out = await llm_complete(
        system=IMPROVE_SYSTEM,
        user=f"Refactor this {lang} file ({filename}):\n\n```{lang}\n{code[:12000]}\n```",
        max_tokens=4000,
        temperature=0.2,
    )
    if "error" in out:
        return out

    parsed = _extract_json(out["text"])
    from tools.code_analysis import build_diff_hunks

    if not parsed or "improved_code" not in parsed:
        # Model didn't return clean JSON — degrade gracefully to raw text, no apply.
        return {
            "improved_code": "", "changes": [], "why_better": out["text"],
            "summary": "Model returned unstructured output (no applyable diff).",
            "diff": {"hunks": [], "added_lines": 0, "removed_lines": 0, "unchanged": True},
            "parse_warning": True,
            "provider": out["provider"], "model": out["model"],
        }

    improved = parsed["improved_code"]
    diff = build_diff_hunks(code, improved, filename)
    return {
        "improved_code": improved,
        "changes": parsed.get("changes", []),
        "why_better": parsed.get("why_better", ""),
        "summary": parsed.get("summary", ""),
        "diff": diff,
        "provider": out["provider"], "model": out["model"],
    }


@router.post("/code/apply")
async def apply_code(payload: dict):
    """Write improved code to a file on disk.

    Safety: requires an explicit confirm flag, only touches recognised source
    files, and always writes a .jarvis.bak backup first so a bad apply is
    one rename away from being undone. The action is audit-logged.
    """
    path_str = payload.get("path", "")
    code = payload.get("code", "")
    confirm = payload.get("confirm", False)

    if not confirm:
        return {"error": "Apply requires confirm=true"}
    if not path_str or not code:
        return {"error": "Both 'path' and 'code' are required"}

    target = Path(path_str)
    if not target.exists() or not target.is_file():
        return {"error": f"File not found: {path_str}"}
    if target.suffix.lower() not in CODE_EXTENSIONS:
        return {"error": f"Refusing to write unsupported file type: {target.suffix}"}

    try:
        original = target.read_text(encoding="utf-8", errors="ignore")
        backup = target.with_suffix(target.suffix + ".jarvis.bak")
        backup.write_text(original, encoding="utf-8")
        target.write_text(code, encoding="utf-8")
    except Exception as e:
        return {"error": f"Write failed: {e}"}

    # Audit log (best-effort — never block the write on logging)
    try:
        from core.database import AsyncSessionLocal
        from core.audit import log_action
        async with AsyncSessionLocal() as db:
            await log_action(
                db, tool_name="code_apply",
                parameters={"path": str(target)},
                result=f"wrote {len(code)} bytes, backup at {backup.name}",
                device="laptop", requester="user", approval_status="confirmed",
            )
    except Exception:
        pass

    return {
        "applied": True,
        "path": str(target),
        "backup": str(backup),
        "bytes_written": len(code.encode("utf-8")),
    }


@router.get("/code/provider")
async def code_provider():
    """Tell the UI which AI provider is active so it can label results."""
    from core.config import settings
    prov = active_provider()
    return {
        "provider": prov,
        "model": settings.CLAUDE_MODEL if prov == "claude" else settings.GROQ_MODEL if prov == "groq" else None,
        "claude_available": bool(settings.ANTHROPIC_API_KEY),
        "upgrade_hint": None if prov == "claude" else "Add ANTHROPIC_API_KEY to backend/.env for higher-quality Claude analysis.",
    }


# ── Repo file-tree browser ────────────────────────────────────────────────────

_SKIP_DIRS = {".git", ".venv", "venv", "node_modules", "__pycache__", "dist", "build",
              ".next", ".cache", "site-packages", ".idea", ".vscode", "wa-session", ".wwebjs_cache"}


@router.get("/code/tree")
async def code_tree(directory: str, max_nodes: int = 800):
    """Return a nested tree of folders + source files for the browser."""
    root = Path(directory)
    if not root.exists() or not root.is_dir():
        return {"error": f"Folder not found: {directory}"}
    count = {"n": 0}

    def walk(d: Path, depth: int):
        if count["n"] >= max_nodes or depth > 6:
            return []
        items = []
        try:
            entries = sorted(d.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
        except Exception:
            return []
        for p in entries:
            if count["n"] >= max_nodes:
                break
            if p.name.startswith(".") or p.name in _SKIP_DIRS:
                continue
            if p.is_dir():
                children = walk(p, depth + 1)
                if children:
                    count["n"] += 1
                    items.append({"name": p.name, "type": "dir", "path": str(p), "children": children})
            elif p.suffix.lower() in CODE_EXTENSIONS:
                count["n"] += 1
                items.append({"name": p.name, "type": "file", "path": str(p),
                              "ext": p.suffix.lstrip(".")})
        return items

    return {"root": str(root), "tree": walk(root, 0), "truncated": count["n"] >= max_nodes}


@router.get("/code/file")
async def code_file(path: str):
    """Read a single source file for analysis."""
    p = Path(path)
    if not p.exists() or not p.is_file():
        return {"error": "File not found"}
    if p.suffix.lower() not in CODE_EXTENSIONS:
        return {"error": f"Unsupported file type: {p.suffix}"}
    try:
        if p.stat().st_size > 600_000:
            return {"error": "File too large (>600 KB)"}
        content = p.read_text(encoding="utf-8", errors="ignore")
    except Exception as e:
        return {"error": str(e)}
    return {"path": str(p), "name": p.name, "language": p.suffix.lstrip("."),
            "content": content, "lines": content.count("\n") + 1}


# ── Real security scanner (secrets + risky deps) ──────────────────────────────

_SECRET_PATTERNS = [
    ("Private key", _re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----"), "CRITICAL"),
    ("AWS access key", _re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "CRITICAL"),
    ("AWS secret key", _re.compile(r"(?i)aws_secret_access_key\s*[=:]\s*['\"]?([A-Za-z0-9/+=]{40})"), "CRITICAL"),
    ("Stripe live key", _re.compile(r"\bsk_live_[0-9A-Za-z]{20,}\b"), "CRITICAL"),
    ("Google API key", _re.compile(r"\bAIza[0-9A-Za-z\-_]{35}\b"), "HIGH"),
    ("GitHub token", _re.compile(r"\bgh[pousr]_[0-9A-Za-z]{36,}\b"), "HIGH"),
    ("Slack token", _re.compile(r"\bxox[baprs]-[0-9A-Za-z-]{10,}\b"), "HIGH"),
    ("OpenAI/Anthropic key", _re.compile(r"\b(sk-ant-[0-9A-Za-z\-_]{20,}|sk-[0-9A-Za-z]{32,})\b"), "HIGH"),
    ("JWT", _re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"), "MEDIUM"),
    ("Hardcoded secret", _re.compile(r"(?i)(api[_-]?key|secret|token|passwd|password|access[_-]?key)\s*[=:]\s*['\"]([^'\"\s]{8,})['\"]"), "MEDIUM"),
]
_PLACEHOLDERS = ("your_", "changeme", "change-this", "xxxx", "placeholder", "example", "<", "dummy", "test", "...", "${", "os.environ", "getenv", "process.env")


def _redact(s: str) -> str:
    s = s.strip()
    if len(s) <= 10:
        return s[:2] + "***"
    return s[:4] + "***" + s[-2:]


@router.post("/code/secscan")
async def security_scan(payload: dict):
    """Scan a folder for hardcoded secrets + risky dependencies — real detection, not LLM prose."""
    directory = (payload.get("directory") or "").strip()
    root = Path(directory)
    if not directory or not root.exists():
        return {"error": "Provide a valid folder path to scan."}

    findings: list[dict] = []
    files_scanned = 0
    SCAN_EXT = CODE_EXTENSIONS | {".env", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".txt", ".json", ".sh", ".ps1", ".xml", ".properties"}

    for f in root.rglob("*"):
        if files_scanned >= 1500 or len(findings) >= 300:
            break
        if not f.is_file():
            continue
        if any(part.startswith(".") and part not in (".env",) or part in _SKIP_DIRS for part in f.parts):
            continue
        is_env = f.name.startswith(".env") or f.name.endswith(".env")
        if f.suffix.lower() not in SCAN_EXT and not is_env:
            continue
        try:
            if f.stat().st_size > 400_000:
                continue
            text = f.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        files_scanned += 1
        rel = str(f.relative_to(root))

        for ln, line in enumerate(text.splitlines(), 1):
            if len(line) > 500:
                continue
            for name, pat, sev in _SECRET_PATTERNS:
                m = pat.search(line)
                if not m:
                    continue
                val = (m.group(m.lastindex) if m.lastindex else m.group(0))
                low = val.lower()
                if name == "Hardcoded secret" and any(ph in low for ph in _PLACEHOLDERS):
                    continue
                # .env with a real-looking value is a true positive
                eff_sev = "HIGH" if (is_env and sev == "MEDIUM") else sev
                findings.append({"type": name, "severity": eff_sev, "file": rel, "line": ln,
                                 "preview": _redact(val),
                                 "detail": f"{name} detected in {rel}:{ln}"})
                break  # one finding per line is enough

        # Dependency risk: unpinned deps
        if f.name == "requirements.txt":
            for ln, line in enumerate(text.splitlines(), 1):
                s = line.strip()
                if not s or s.startswith("#") or s.startswith("-"):
                    continue
                if not _re.search(r"[=<>~!@]", s):
                    findings.append({"type": "Unpinned dependency", "severity": "LOW", "file": rel, "line": ln,
                                     "preview": s[:40], "detail": f"'{s}' has no version pin — supply-chain risk."})
        elif f.name == "package.json":
            try:
                pj = json.loads(text)
                for section in ("dependencies", "devDependencies"):
                    for dep, ver in (pj.get(section) or {}).items():
                        if isinstance(ver, str) and ver.strip() in ("*", "latest", "") or (isinstance(ver, str) and ver.startswith(">")):
                            findings.append({"type": "Unpinned dependency", "severity": "LOW", "file": rel, "line": 0,
                                             "preview": f"{dep}: {ver}", "detail": f"'{dep}' uses a floating version ({ver})."})
            except Exception:
                pass

    sev_rank = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    findings.sort(key=lambda x: sev_rank.get(x["severity"], 9))
    counts = {s: sum(1 for f in findings if f["severity"] == s) for s in ("CRITICAL", "HIGH", "MEDIUM", "LOW")}
    # 100 = clean; subtract by severity
    score = max(0, 100 - counts["CRITICAL"] * 35 - counts["HIGH"] * 18 - counts["MEDIUM"] * 7 - counts["LOW"] * 2)
    return {"findings": findings[:200], "counts": counts, "files_scanned": files_scanned,
            "score": score, "total": len(findings)}
