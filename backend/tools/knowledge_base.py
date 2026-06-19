"""
JARVIS Second Brain — Semantic Knowledge Search
Integrates with Obsidian vault + any directory of notes/docs
Uses TF-IDF for fast search + Groq AI for semantic understanding
"""
import hashlib
import json
import logging
import os
import pickle
import re
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.brain")

# KB stored as simple pickle for speed
KB_INDEX_PATH = Path(__file__).parent.parent / "data" / "knowledge_index.pkl"
KB_INDEX_PATH.parent.mkdir(exist_ok=True)

SUPPORTED_EXTENSIONS = {".md", ".txt", ".py", ".js", ".ts", ".json", ".csv", ".rst", ".html"}

_kb_lock = threading.Lock()
_vectorizer = None
_tfidf_matrix = None
_documents: list[dict] = []


def _load_index():
    global _vectorizer, _tfidf_matrix, _documents
    if KB_INDEX_PATH.exists():
        try:
            with open(KB_INDEX_PATH, "rb") as f:
                data = pickle.load(f)
            _vectorizer = data["vectorizer"]
            _tfidf_matrix = data["matrix"]
            _documents = data["documents"]
            logger.info("Knowledge base loaded: %d documents", len(_documents))
        except Exception as e:
            logger.warning("KB index load failed: %s", e)


def _save_index():
    try:
        with open(KB_INDEX_PATH, "wb") as f:
            pickle.dump({
                "vectorizer": _vectorizer,
                "matrix": _tfidf_matrix,
                "documents": _documents,
            }, f)
    except Exception as e:
        logger.error("KB save failed: %s", e)


def _rebuild_tfidf():
    global _vectorizer, _tfidf_matrix
    if not _documents:
        return
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        _vectorizer = TfidfVectorizer(
            max_features=50000,
            ngram_range=(1, 2),
            stop_words="english",
            min_df=1,
        )
        texts = [f"{d['title']} {d['content']}" for d in _documents]
        _tfidf_matrix = _vectorizer.fit_transform(texts)
        logger.info("TF-IDF index rebuilt: %d docs", len(_documents))
    except Exception as e:
        logger.error("TF-IDF rebuild failed: %s", e)


def _read_file(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")[:10000]
    except Exception:
        return ""


def _file_hash(path: Path) -> str:
    try:
        return hashlib.md5(path.read_bytes()).hexdigest()
    except Exception:
        return ""


class KnowledgeBase:

    @staticmethod
    def index_directory(directory: str, recursive: bool = True) -> dict[str, Any]:
        """Index all supported files in a directory into the KB."""
        path = Path(directory)
        if not path.exists():
            return {"error": f"Directory not found: {directory}"}

        added = 0
        updated = 0
        skipped = 0
        pattern = "**/*" if recursive else "*"

        with _kb_lock:
            existing_hashes = {d["path"]: d.get("hash", "") for d in _documents}
            existing_paths = {d["path"] for d in _documents}

            for file in path.glob(pattern):
                if file.suffix.lower() not in SUPPORTED_EXTENSIONS:
                    continue
                if any(part.startswith(".") for part in file.parts):
                    continue  # skip hidden dirs

                file_path = str(file)
                file_hash = _file_hash(file)

                if file_path in existing_paths:
                    if existing_hashes.get(file_path) == file_hash:
                        skipped += 1
                        continue
                    # Update existing
                    for doc in _documents:
                        if doc["path"] == file_path:
                            doc["content"] = _read_file(file)
                            doc["hash"] = file_hash
                            doc["updated"] = datetime.now().isoformat()
                            updated += 1
                            break
                else:
                    content = _read_file(file)
                    if not content.strip():
                        continue
                    _documents.append({
                        "id": len(_documents),
                        "title": file.stem,
                        "path": file_path,
                        "type": file.suffix.lstrip("."),
                        "content": content,
                        "hash": file_hash,
                        "indexed": datetime.now().isoformat(),
                        "updated": datetime.now().isoformat(),
                        "source": "obsidian" if ".obsidian" in str(path) or "vault" in directory.lower() else "files",
                    })
                    added += 1

            _rebuild_tfidf()
            _save_index()

        return {"added": added, "updated": updated, "skipped": skipped, "total": len(_documents)}

    @staticmethod
    def index_obsidian(vault_path: str) -> dict[str, Any]:
        """Index an Obsidian vault specifically."""
        result = KnowledgeBase.index_directory(vault_path, recursive=True)
        result["source"] = "obsidian"
        result["vault"] = vault_path
        return result

    @staticmethod
    def search(query: str, limit: int = 8, use_ai: bool = True) -> dict[str, Any]:
        """Search the knowledge base. Returns relevant docs + AI-synthesized answer."""
        with _kb_lock:
            docs = list(_documents)
            vectorizer = _vectorizer
            matrix = _tfidf_matrix

        if not docs:
            return {"error": "Knowledge base is empty. Index some files first.", "results": []}

        results = []
        if vectorizer and matrix is not None:
            try:
                import numpy as np
                from sklearn.metrics.pairwise import cosine_similarity
                q_vec = vectorizer.transform([query])
                scores = cosine_similarity(q_vec, matrix).flatten()
                top_idx = np.argsort(scores)[::-1][:limit]
                for idx in top_idx:
                    if scores[idx] > 0.01:
                        results.append({
                            "id": docs[idx].get("id", int(idx)),
                            "score": round(float(scores[idx]), 4),
                            "title": docs[idx]["title"],
                            "path": docs[idx]["path"],
                            "type": docs[idx]["type"],
                            "snippet": docs[idx]["content"][:400],
                            "source": docs[idx].get("source", "files"),
                        })
            except Exception as e:
                logger.error("Search error: %s", e)

        # AI synthesis with Groq
        ai_answer = ""
        if use_ai and results:
            try:
                from core.config import settings
                if settings.GROQ_API_KEY:
                    from groq import Client
                    context = "\n\n".join(
                        f"[{r['title']}]:\n{r['snippet']}" for r in results[:4]
                    )
                    prompt = f"""Using the following knowledge base excerpts, answer this query concisely:

Query: {query}

Context:
{context}

Provide a clear, direct answer based on the context above. If the context doesn't contain the answer, say so."""
                    client = Client(api_key=settings.GROQ_API_KEY)
                    resp = client.chat.completions.create(
                        model=settings.GROQ_MODEL,
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=512,
                    )
                    ai_answer = resp.choices[0].message.content
            except Exception as e:
                logger.debug("AI synthesis failed: %s", e)

        return {
            "query": query,
            "results": results,
            "ai_answer": ai_answer,
            "total_indexed": len(docs),
        }

    @staticmethod
    def add_note(title: str, content: str, tags: list[str] = None) -> dict[str, Any]:
        """Add a quick note to the knowledge base (and optionally to Obsidian vault)."""
        from core.config import settings
        with _kb_lock:
            doc = {
                "id": len(_documents),
                "title": title,
                "path": f"quick_note:{title}",
                "type": "md",
                "content": content,
                "hash": hashlib.md5(content.encode()).hexdigest(),
                "indexed": datetime.now().isoformat(),
                "updated": datetime.now().isoformat(),
                "source": "quick_note",
                "tags": tags or [],
            }
            _documents.append(doc)
            _rebuild_tfidf()
            _save_index()

            # Write to Obsidian vault if configured
            vault = getattr(settings, "OBSIDIAN_VAULT_PATH", "")
            if vault and Path(vault).exists():
                note_path = Path(vault) / "JARVIS Quick Notes" / f"{title}.md"
                note_path.parent.mkdir(exist_ok=True)
                tag_str = " ".join(f"#{t}" for t in (tags or []))
                note_path.write_text(
                    f"# {title}\n\n{tag_str}\n\n{content}\n\n---\n*Added by JARVIS on {datetime.now().strftime('%Y-%m-%d %H:%M')}*",
                    encoding="utf-8"
                )
                return {"saved": True, "path": str(note_path), "obsidian": True}

        return {"saved": True, "in_memory": True}

    @staticmethod
    def get_document(ident: Any) -> dict[str, Any]:
        """Return the FULL content of a document by id or path."""
        with _kb_lock:
            for d in _documents:
                if str(d.get("id")) == str(ident) or d.get("path") == ident:
                    return {
                        "id": d.get("id"), "title": d["title"], "path": d["path"],
                        "type": d.get("type", ""), "source": d.get("source", "files"),
                        "content": d.get("content", ""), "tags": d.get("tags", []),
                        "updated": d.get("updated"),
                    }
        return {"error": "Document not found"}

    @staticmethod
    def related(ident: Any, limit: int = 5) -> dict[str, Any]:
        """Find documents most similar to a given one (vector similarity)."""
        with _kb_lock:
            docs = list(_documents); vectorizer = _vectorizer; matrix = _tfidf_matrix
        if not docs or vectorizer is None or matrix is None:
            return {"related": []}
        # locate the row index of the target doc
        target = next((i for i, d in enumerate(docs) if str(d.get("id")) == str(ident) or d.get("path") == ident), None)
        if target is None:
            return {"related": []}
        try:
            import numpy as np
            from sklearn.metrics.pairwise import cosine_similarity
            scores = cosine_similarity(matrix[target], matrix).flatten()
            order = np.argsort(scores)[::-1]
            out = []
            for idx in order:
                if idx == target or scores[idx] < 0.04:
                    continue
                out.append({"id": docs[idx].get("id", int(idx)), "title": docs[idx]["title"],
                            "path": docs[idx]["path"], "score": round(float(scores[idx]), 3),
                            "snippet": docs[idx]["content"][:160], "source": docs[idx].get("source", "files")})
                if len(out) >= limit:
                    break
            return {"related": out}
        except Exception as e:
            logger.debug("related failed: %s", e)
            return {"related": []}

    @staticmethod
    def index_text(title: str, content: str, source: str = "upload", path: str | None = None) -> dict[str, Any]:
        """Index raw text (from a dropped file or a fetched web page)."""
        if not content.strip():
            return {"error": "Empty content"}
        with _kb_lock:
            doc_id = len(_documents)
            _documents.append({
                "id": doc_id, "title": title or "Untitled",
                "path": path or f"{source}:{title}", "type": "md",
                "content": content[:20000],
                "hash": hashlib.md5(content.encode()).hexdigest(),
                "indexed": datetime.now().isoformat(), "updated": datetime.now().isoformat(),
                "source": source, "tags": [],
            })
            _rebuild_tfidf()
            _save_index()
        return {"added": 1, "id": doc_id, "total": len(_documents), "title": title}

    @staticmethod
    def get_stats() -> dict[str, Any]:
        with _kb_lock:
            if not _documents:
                return {"total": 0, "sources": {}, "types": {}}
            sources: dict[str, int] = {}
            types: dict[str, int] = {}
            for d in _documents:
                s = d.get("source", "files")
                sources[s] = sources.get(s, 0) + 1
                t = d.get("type", "?")
                types[t] = types.get(t, 0) + 1
            return {
                "total": len(_documents),
                "sources": sources,
                "types": types,
                "index_ready": _vectorizer is not None,
            }


# Load on import
_load_index()
