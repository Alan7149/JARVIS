"""Brain Knowledge Graph API — returns nodes and edges for D3 visualization."""
import re
from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from collections import defaultdict

router = APIRouter()


def _extract_links(content: str) -> list[str]:
    """Extract [[wiki-links]] from Obsidian markdown."""
    return re.findall(r'\[\[([^\]|#]+?)(?:\|[^\]]+)?\]\]', content)


def _extract_tags(content: str) -> list[str]:
    return re.findall(r'#([\w/-]+)', content)


@router.get("/api/brain/graph")
async def brain_graph(directory: str = ""):
    """Build graph data from indexed knowledge base or Obsidian vault."""
    from tools.knowledge_base import _documents

    nodes = []
    edges = []
    seen_nodes = set()
    tag_nodes = {}

    # ── From indexed documents ────────────────────────────────────────────
    docs = list(_documents)

    if not docs and not directory:
        return {"nodes": [], "edges": [], "stats": {"nodes": 0, "edges": 0}}

    # ── From Obsidian vault (if directory given) ──────────────────────────
    if directory:
        path = Path(directory)
        if path.exists():
            for f in path.rglob("*.md"):
                if any(p.startswith('.') for p in f.parts):
                    continue
                try:
                    content = f.read_text(encoding="utf-8", errors="ignore")
                    doc_id = str(f.relative_to(path)).replace('\\', '/').replace('.md', '')
                    if doc_id not in seen_nodes:
                        seen_nodes.add(doc_id)
                        tags = _extract_tags(content)
                        links = _extract_links(content)
                        word_count = len(content.split())
                        nodes.append({
                            "id": doc_id,
                            "label": f.stem,
                            "type": "note",
                            "size": min(20, max(6, word_count // 50)),
                            "tags": tags[:5],
                            "color": "#00d4ff",
                            "path": str(f),
                            "word_count": word_count,
                        })
                        # Add tag nodes and edges
                        for tag in tags[:3]:
                            tag_id = f"tag:{tag}"
                            if tag_id not in tag_nodes:
                                tag_nodes[tag_id] = tag
                            edges.append({"source": doc_id, "target": tag_id, "type": "tag"})
                        # Add wiki-link edges
                        for link in links[:10]:
                            link_id = link.replace(' ', '-').lower()
                            edges.append({"source": doc_id, "target": link_id, "type": "link"})
                except Exception:
                    pass

        # Add tag nodes
        for tag_id, tag in tag_nodes.items():
            if tag_id not in seen_nodes:
                seen_nodes.add(tag_id)
                nodes.append({
                    "id": tag_id, "label": f"#{tag}", "type": "tag",
                    "size": 8, "color": "#a855f7", "tags": [],
                })

    # ── From indexed knowledge base ───────────────────────────────────────
    if docs and not directory:
        type_colors = {
            "md": "#00d4ff", "py": "#00ff88", "js": "#ff9900",
            "ts": "#00aaff", "txt": "#a8d8ea", "obsidian": "#a855f7",
        }
        for doc in docs[:100]:
            nid = doc.get("path", doc.get("id", str(doc.get("id", ""))))
            if str(nid) in seen_nodes:
                continue
            seen_nodes.add(str(nid))
            ftype = doc.get("type", "txt")
            source = doc.get("source", "files")
            content = doc.get("content", "")
            nodes.append({
                "id": str(nid),
                "label": doc.get("title", "untitled")[:30],
                "type": source if source == "obsidian" else ftype,
                "size": min(18, max(5, len(content) // 200)),
                "color": "#a855f7" if source == "obsidian" else type_colors.get(ftype, "#4a7a99"),
                "tags": [],
                "path": nid,
            })

        # Build edges from shared words — only if we have documents
        if len(docs) >= 2:
            try:
                from sklearn.feature_extraction.text import TfidfVectorizer
                from sklearn.metrics.pairwise import cosine_similarity
                texts = [d.get("content", "")[:300] for d in docs[:50]]
                vec = TfidfVectorizer(max_features=200, stop_words="english")
                mat = vec.fit_transform(texts)
                sim = cosine_similarity(mat)
                for i in range(len(docs[:50])):
                    for j in range(i+1, len(docs[:50])):
                        if sim[i][j] > 0.2:
                            edges.append({
                                "source": str(docs[i].get("path", i)),
                                "target": str(docs[j].get("path", j)),
                                "type": "similar",
                                "weight": round(float(sim[i][j]), 3),
                            })
            except Exception:
                pass

    # Filter edges to only connect existing nodes
    node_ids = {n["id"] for n in nodes}
    valid_edges = [e for e in edges if e["source"] in node_ids and e["target"] in node_ids]

    # Limit edges
    valid_edges = valid_edges[:500]

    return {
        "nodes": nodes,
        "edges": valid_edges,
        "stats": {
            "nodes": len(nodes),
            "edges": len(valid_edges),
            "note_count": sum(1 for n in nodes if n["type"] in ("note", "md", "obsidian")),
            "tag_count": sum(1 for n in nodes if n["type"] == "tag"),
        }
    }
