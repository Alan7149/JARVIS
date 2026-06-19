"""
JARVIS Code Analysis Engine
Handles: complexity heatmap, dead code, duplicates, patterns,
architecture diagrams, git diffs, docs writer, smells, comments
"""
import ast
import difflib
import hashlib
import logging
import os
import re
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.code_analysis")

CODE_EXTENSIONS = {'.py', '.js', '.ts', '.jsx', '.tsx', '.go', '.rs', '.java', '.cpp', '.c'}


# ── Complexity Analysis ──────────────────────────────────────────────────────

def _cyclomatic_complexity_python(code: str) -> list[dict]:
    """Calculate cyclomatic complexity for each function in Python code."""
    results = []
    try:
        tree = ast.parse(code)
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                complexity = 1
                for child in ast.walk(node):
                    if isinstance(child, (ast.If, ast.While, ast.For, ast.ExceptHandler,
                                          ast.comprehension, ast.BoolOp, ast.Assert)):
                        complexity += 1
                    if isinstance(child, ast.BoolOp):
                        complexity += len(child.values) - 1

                level = "low" if complexity <= 5 else "medium" if complexity <= 10 else "high" if complexity <= 20 else "critical"
                results.append({
                    "name": node.name,
                    "line": node.lineno,
                    "complexity": complexity,
                    "level": level,
                    "color": {"low": "#00ff88", "medium": "#ff9900", "high": "#ff6600", "critical": "#ff3333"}[level],
                })
    except SyntaxError:
        pass
    return sorted(results, key=lambda x: -x["complexity"])


def analyze_complexity(code: str, language: str = "python") -> dict[str, Any]:
    """Analyze code complexity and return heatmap data."""
    if language in ("python", "py"):
        functions = _cyclomatic_complexity_python(code)
    else:
        # For other languages, use line count as proxy
        lines = code.split('\n')
        # Find function-like blocks
        func_pattern = re.compile(r'(?:function|func|def|fn|public|private|protected)\s+(\w+)\s*\(')
        functions = []
        for i, line in enumerate(lines, 1):
            m = func_pattern.search(line)
            if m:
                block = '\n'.join(lines[i-1:i+50])
                complexity = sum(1 for kw in ('if', 'else', 'while', 'for', 'switch', 'catch', '&&', '||', '??')
                                 if kw in block)
                complexity = max(1, complexity)
                level = "low" if complexity <= 5 else "medium" if complexity <= 10 else "high" if complexity <= 20 else "critical"
                functions.append({"name": m.group(1), "line": i, "complexity": complexity, "level": level,
                                   "color": {"low":"#00ff88","medium":"#ff9900","high":"#ff6600","critical":"#ff3333"}[level]})

    avg = sum(f["complexity"] for f in functions) / max(len(functions), 1)
    return {
        "functions": functions[:50],
        "total_functions": len(functions),
        "avg_complexity": round(avg, 2),
        "critical_count": sum(1 for f in functions if f["level"] == "critical"),
        "high_count": sum(1 for f in functions if f["level"] == "high"),
        "score": min(100, max(0, 100 - int(avg * 5))),
    }


# ── Dead Code Finder ─────────────────────────────────────────────────────────

def find_dead_code(directory: str) -> dict[str, Any]:
    """Find potentially unused functions, classes, imports."""
    path = Path(directory)
    defined = {}   # name → file:line
    called = set()
    imports = defaultdict(list)
    dead = []

    for f in path.rglob("*.py"):
        try:
            code = f.read_text(encoding="utf-8", errors="ignore")
            tree = ast.parse(code)
            rel = str(f.relative_to(path))

            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    if not node.name.startswith('_') and not node.name.startswith('test_'):
                        defined[node.name] = f"{rel}:{node.lineno}"
                if isinstance(node, ast.Call):
                    if isinstance(node.func, ast.Name):
                        called.add(node.func.id)
                    elif isinstance(node.func, ast.Attribute):
                        called.add(node.func.attr)
                if isinstance(node, (ast.Import, ast.ImportFrom)):
                    for alias in getattr(node, 'names', []):
                        name = alias.asname or alias.name
                        imports[rel].append(name.split('.')[0])
        except Exception:
            pass

    for name, loc in defined.items():
        if name not in called:
            dead.append({"name": name, "location": loc, "type": "function/class"})

    return {
        "dead_code": dead[:30],
        "dead_count": len(dead),
        "defined_count": len(defined),
        "called_count": len(called),
        "unreachable_ratio": round(len(dead) / max(len(defined), 1) * 100, 1),
    }


# ── Duplicate Code Detector ──────────────────────────────────────────────────

def find_duplicates(directory: str, min_lines: int = 6) -> dict[str, Any]:
    """Find duplicate and near-duplicate code blocks."""
    path = Path(directory)
    blocks = {}  # hash → list of locations
    duplicates = []

    for f in path.rglob("*"):
        if f.suffix.lower() not in CODE_EXTENSIONS:
            continue
        try:
            lines = f.read_text(encoding="utf-8", errors="ignore").splitlines()
            rel = str(f.relative_to(path))
            for i in range(len(lines) - min_lines + 1):
                chunk = lines[i:i + min_lines]
                # Normalize whitespace for comparison
                normalized = '\n'.join(l.strip() for l in chunk if l.strip())
                if len(normalized) < 50:
                    continue
                h = hashlib.md5(normalized.encode()).hexdigest()
                if h not in blocks:
                    blocks[h] = []
                blocks[h].append({"file": rel, "line": i + 1, "preview": chunk[0][:80]})
        except Exception:
            pass

    for h, locs in blocks.items():
        if len(locs) >= 2:
            duplicates.append({"locations": locs, "copies": len(locs)})

    duplicates.sort(key=lambda x: -x["copies"])
    return {
        "duplicates": duplicates[:20],
        "duplicate_count": len(duplicates),
        "total_blocks_scanned": len(blocks),
    }


# ── Architecture Diagram (Mermaid) ───────────────────────────────────────────

def generate_architecture_diagram(directory: str) -> dict[str, Any]:
    """Generate a Mermaid diagram of file/module relationships."""
    path = Path(directory)
    imports_map = defaultdict(set)
    files = []

    for f in list(path.rglob("*.py"))[:30]:  # limit for performance
        try:
            rel = str(f.relative_to(path)).replace('\\', '/').replace('.py', '').replace('/', '_')
            files.append(rel)
            code = f.read_text(encoding="utf-8", errors="ignore")
            tree = ast.parse(code)
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module:
                    mod = node.module.replace('.', '_')
                    if any(mod.startswith(m.replace('/', '_')) for m in [str(ff.relative_to(path)).replace('\\','/').replace('.py','').replace('/','.') for ff in path.rglob("*.py")]):
                        imports_map[rel].add(mod)
        except Exception:
            pass

    # Generate Mermaid
    lines = ["graph TD"]
    for f in files[:20]:
        short = f.split('_')[-1] if '_' in f else f
        lines.append(f'    {f}["{short}"]')
    for src, dests in list(imports_map.items())[:30]:
        for dest in list(dests)[:3]:
            if dest in files:
                lines.append(f'    {src} --> {dest}')

    # Also generate simple text tree
    tree_lines = []
    for f in sorted(path.rglob("*"))[:40]:
        if not any(p.startswith('.') for p in f.parts) and f.suffix.lower() in CODE_EXTENSIONS:
            rel = f.relative_to(path)
            depth = len(rel.parts) - 1
            tree_lines.append("  " * depth + "├── " + f.name)

    return {
        "mermaid": '\n'.join(lines),
        "file_tree": '\n'.join(tree_lines[:50]),
        "file_count": len(files),
        "connection_count": sum(len(v) for v in imports_map.values()),
    }


# ── Git-Aware Review ─────────────────────────────────────────────────────────

def get_git_diff(repo_path: str, commits: int = 1) -> dict[str, Any]:
    """Get the git diff for recent commits."""
    try:
        result = subprocess.run(
            ["git", "diff", f"HEAD~{commits}", "HEAD", "--stat"],
            cwd=repo_path, capture_output=True, text=True, timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )
        stat = result.stdout

        diff_result = subprocess.run(
            ["git", "diff", f"HEAD~{commits}", "HEAD", "--", "*.py", "*.js", "*.ts"],
            cwd=repo_path, capture_output=True, text=True, timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )
        diff = diff_result.stdout[:8000]

        # Parse diff for added/removed lines
        added = sum(1 for l in diff.split('\n') if l.startswith('+') and not l.startswith('+++'))
        removed = sum(1 for l in diff.split('\n') if l.startswith('-') and not l.startswith('---'))

        return {"diff": diff, "stat": stat, "added_lines": added, "removed_lines": removed, "commits": commits}
    except Exception as e:
        return {"error": str(e)}


def build_diff_hunks(original: str, improved: str, filename: str = "code") -> dict[str, Any]:
    """
    Compute a deterministic before/after diff between two versions of code.

    Unlike an LLM-produced "diff" (which can hallucinate lines that were never
    there), this uses Python's difflib on the actual strings — so the diff the
    user sees is guaranteed to match exactly what 'Apply' would write.

    Returns the same {file, before[], after[]} hunk shape the frontend
    DiffViewer already renders, plus summary line counts.
    """
    orig_lines = original.splitlines()
    new_lines = improved.splitlines()

    before: list[dict] = []
    after: list[dict] = []
    added = removed = 0

    sm = difflib.SequenceMatcher(a=orig_lines, b=new_lines, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i1, i2):
                before.append({"text": orig_lines[k], "type": "context"})
                after.append({"text": new_lines[j1 + (k - i1)], "type": "context"})
        elif tag == "delete":
            for k in range(i1, i2):
                before.append({"text": orig_lines[k], "type": "removed"})
                after.append({"text": "", "type": "empty"})
                removed += 1
        elif tag == "insert":
            for k in range(j1, j2):
                before.append({"text": "", "type": "empty"})
                after.append({"text": new_lines[k], "type": "added"})
                added += 1
        elif tag == "replace":
            old_block = orig_lines[i1:i2]
            new_block = new_lines[j1:j2]
            removed += len(old_block)
            added += len(new_block)
            # Pad the shorter side so removed/added stay row-aligned
            for idx in range(max(len(old_block), len(new_block))):
                if idx < len(old_block):
                    before.append({"text": old_block[idx], "type": "removed"})
                else:
                    before.append({"text": "", "type": "empty"})
                if idx < len(new_block):
                    after.append({"text": new_block[idx], "type": "added"})
                else:
                    after.append({"text": "", "type": "empty"})

    return {
        "hunks": [{"file": filename, "before": before[:400], "after": after[:400]}],
        "added_lines": added,
        "removed_lines": removed,
        "unchanged": original.strip() == improved.strip(),
    }


def parse_diff_hunks(diff: str) -> list[dict]:
    """Parse a git diff into before/after hunks for the diff viewer."""
    hunks = []
    current_file = ""
    before_lines = []
    after_lines = []

    for line in diff.split('\n'):
        if line.startswith('diff --git'):
            if before_lines or after_lines:
                hunks.append({"file": current_file, "before": before_lines, "after": after_lines})
            current_file = line.split(' b/')[-1] if ' b/' in line else line
            before_lines, after_lines = [], []
        elif line.startswith('---') or line.startswith('+++'):
            continue
        elif line.startswith('-'):
            before_lines.append({"text": line[1:], "type": "removed"})
            after_lines.append({"text": "", "type": "empty"})
        elif line.startswith('+'):
            after_lines.append({"text": line[1:], "type": "added"})
            if len(before_lines) < len(after_lines):
                before_lines.append({"text": "", "type": "empty"})
        else:
            before_lines.append({"text": line[1:] if line.startswith(' ') else line, "type": "context"})
            after_lines.append({"text": line[1:] if line.startswith(' ') else line, "type": "context"})

    if before_lines or after_lines:
        hunks.append({"file": current_file, "before": before_lines[:100], "after": after_lines[:100]})

    return hunks[:10]


# ── Code Smell Detector ──────────────────────────────────────────────────────

def detect_code_smells(code: str, filename: str = "code.py") -> dict[str, Any]:
    """Detect common code smells."""
    smells = []
    lines = code.split('\n')

    # Long functions (> 50 lines)
    try:
        tree = ast.parse(code)
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                end_line = getattr(node, 'end_lineno', node.lineno + 10)
                length = end_line - node.lineno
                if length > 50:
                    smells.append({"type": "Long Function", "name": node.name, "line": node.lineno,
                                   "detail": f"{length} lines — should be < 50", "severity": "WARNING"})
                # Too many parameters
                params = len(node.args.args)
                if params > 7:
                    smells.append({"type": "Too Many Parameters", "name": node.name, "line": node.lineno,
                                   "detail": f"{params} params — consider a config object", "severity": "INFO"})
            # God class
            if isinstance(node, ast.ClassDef):
                methods = [n for n in ast.walk(node) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
                if len(methods) > 20:
                    smells.append({"type": "God Class", "name": node.name, "line": node.lineno,
                                   "detail": f"{len(methods)} methods — split into smaller classes", "severity": "WARNING"})
    except Exception:
        pass

    # Magic numbers
    magic = re.findall(r'(?<!["\'\w])(?!0x)\b([2-9]\d{2,})\b(?!["\'])', code)
    if magic:
        smells.append({"type": "Magic Numbers", "name": "multiple", "line": 0,
                       "detail": f"Found {len(set(magic))} magic numbers: {', '.join(set(magic[:5]))}", "severity": "INFO"})

    # TODO/FIXME/HACK
    debt_comments = [(i+1, l.strip()) for i, l in enumerate(lines)
                     if re.search(r'\b(TODO|FIXME|HACK|XXX|BUG)\b', l, re.I)]
    if debt_comments:
        smells.append({"type": "Tech Debt Comments", "name": f"{len(debt_comments)} found", "line": debt_comments[0][0],
                       "detail": ', '.join(f"L{l}: {c[:40]}" for l, c in debt_comments[:3]),
                       "severity": "INFO"})

    # Very long lines
    long_lines = [(i+1, len(l)) for i, l in enumerate(lines) if len(l) > 120]
    if long_lines:
        smells.append({"type": "Long Lines", "name": f"{len(long_lines)} lines > 120 chars",
                       "line": long_lines[0][0], "detail": "Consider breaking into multiple lines", "severity": "INFO"})

    # Nested loops/ifs (complexity indicator)
    deep_nesting = []
    for i, line in enumerate(lines):
        indent = len(line) - len(line.lstrip())
        if indent >= 24 and any(kw in line for kw in ('if ', 'for ', 'while ')):
            deep_nesting.append(i + 1)
    if deep_nesting:
        smells.append({"type": "Deep Nesting", "name": f"{len(deep_nesting)} locations",
                       "line": deep_nesting[0], "detail": "Consider extracting to functions", "severity": "WARNING"})

    score = max(0, 100 - len(smells) * 8)
    return {"smells": smells, "smell_count": len(smells), "score": score, "file": filename}
