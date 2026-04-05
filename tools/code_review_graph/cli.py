"""
code-review-graph CLI — called by Claude Code hooks.

Commands:
  update [--quiet]          Rebuild graph if source files changed
  status [--json]           Show graph stats
  detect-changes [--brief]  Show risk-scored diff summary (pre-commit)
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

# ---- paths -----------------------------------------------------------------

THIS_DIR = Path(__file__).resolve().parent
ROOT = THIS_DIR.parent.parent  # ec2-control-center/
CACHE = THIS_DIR / "graph.json"

sys.path.insert(0, str(THIS_DIR))
from graph_builder import load_or_build, rebuild, _file_id, _read

# ---- helpers ---------------------------------------------------------------

def _load() -> dict:
    return load_or_build(str(ROOT), str(CACHE))


def _risk_keywords() -> dict[str, int]:
    return {
        "auth": 3, "token": 3, "password": 3, "secret": 3, "cognito": 3,
        "iam": 3, "sts": 3, "role": 2, "permission": 2, "admin": 2,
        "delete": 2, "billing": 2, "payment": 2, "prod": 2, "production": 2,
        "backup": 1, "ec2": 1, "lambda": 1,
    }


def _score(filepath: str, diff_text: str) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    text_lower = (filepath + " " + diff_text).lower()
    for kw, weight in _risk_keywords().items():
        if kw in text_lower:
            score += weight
            reasons.append(kw)
    churn = diff_text.count("\n+") + diff_text.count("\n-")
    if churn > 50:
        score += 3
        reasons.append(f"large churn ({churn} lines)")
    elif churn > 20:
        score += 1
    return min(score, 10), reasons


# ---- commands --------------------------------------------------------------

def cmd_update(quiet: bool = False):
    """Rebuild graph if any source file is newer than the cache."""
    if CACHE.exists():
        cache_mtime = CACHE.stat().st_mtime
        newer = False
        for dirpath, dirnames, filenames in os.walk(ROOT):
            dirnames[:] = [d for d in dirnames if d not in {".git", "node_modules", "__pycache__", ".venv", "tools"}]
            for fname in filenames:
                if fname.endswith((".py", ".js", ".mjs")):
                    fpath = Path(dirpath) / fname
                    if fpath.stat().st_mtime > cache_mtime:
                        newer = True
                        break
            if newer:
                break
        if not newer:
            if not quiet:
                print("code-review-graph: graph is up-to-date")
            return
    g = rebuild(str(ROOT), str(CACHE))
    if not quiet:
        print(f"code-review-graph: rebuilt — {g['meta']['node_count']} nodes, {g['meta']['edge_count']} edges")


def cmd_status(as_json: bool = False):
    """Print graph statistics."""
    if not CACHE.exists():
        g = rebuild(str(ROOT), str(CACHE))
    else:
        g = _load()
    meta = g["meta"]
    by_type: dict[str, int] = {}
    for n in g["nodes"].values():
        by_type[n["type"]] = by_type.get(n["type"], 0) + 1
    age = int(time.time() - meta.get("built_at", 0))
    info = {
        "status": "ok",
        "nodes": meta["node_count"],
        "edges": meta["edge_count"],
        "by_type": by_type,
        "cache_age_seconds": age,
        "root": str(ROOT),
    }
    if as_json:
        print(json.dumps(info))
    else:
        print(f"code-review-graph: {info['nodes']} nodes, {info['edges']} edges, "
              f"cache {age}s old | {by_type}")


def cmd_detect_changes(brief: bool = False):
    """Analyse staged/unstaged changes for risk. Called by PreCommit hook."""
    try:
        diff_out = subprocess.check_output(
            ["git", "diff", "--name-only", "HEAD"],
            cwd=ROOT, text=True, stderr=subprocess.DEVNULL
        ).strip()
        staged_out = subprocess.check_output(
            ["git", "diff", "--cached", "--name-only"],
            cwd=ROOT, text=True, stderr=subprocess.DEVNULL
        ).strip()
    except subprocess.CalledProcessError:
        print("code-review-graph: could not run git diff")
        return

    changed = list({f for f in (diff_out + "\n" + staged_out).splitlines() if f.strip()})
    if not changed:
        print("code-review-graph: no changed files")
        return

    results = []
    for rel_path in changed:
        try:
            diff_text = subprocess.check_output(
                ["git", "diff", "HEAD", "--", rel_path],
                cwd=ROOT, text=True, stderr=subprocess.DEVNULL
            )
        except Exception:
            diff_text = ""
        score, reasons = _score(rel_path, diff_text)
        results.append((score, rel_path, reasons))

    results.sort(key=lambda x: -x[0])
    high = [r for r in results if r[0] >= 5]

    if brief:
        if high:
            print(f"code-review-graph: HIGH RISK changes detected in {len(high)} file(s):")
            for score, path, reasons in high:
                print(f"  [{score}/10] {path} — {', '.join(reasons[:3])}")
        else:
            print(f"code-review-graph: {len(results)} file(s) changed, no high-risk patterns")
    else:
        print(f"code-review-graph detect-changes ({len(results)} files):")
        for score, path, reasons in results:
            bar = "█" * score + "░" * (10 - score)
            print(f"  {bar} {score:2d}/10  {path}")
            if reasons:
                print(f"          reasons: {', '.join(reasons)}")


# ---- entry point -----------------------------------------------------------

def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)

    cmd = args[0]
    flags = set(args[1:])

    if cmd == "update":
        cmd_update(quiet="--quiet" in flags)
    elif cmd == "status":
        cmd_status(as_json="--json" in flags)
    elif cmd == "detect-changes":
        cmd_detect_changes(brief="--brief" in flags)
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
