"""
code-review-graph MCP server

Exposes a knowledge graph of the ec2-control-center codebase with tools for
code review, impact analysis, and architecture exploration.
"""
from __future__ import annotations

import json
import os
import subprocess
import textwrap
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP

from graph_builder import load_or_build, rebuild, _file_id, _node_id, _read

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ROOT = str(Path(__file__).resolve().parent.parent.parent)  # ec2-control-center/
CACHE = str(Path(__file__).resolve().parent / "graph.json")

mcp = FastMCP("code-review-graph")

# ---------------------------------------------------------------------------
# Shared graph accessor (lazy-loads once per request group)
# ---------------------------------------------------------------------------

_graph_cache: dict | None = None


def _g() -> dict[str, Any]:
    global _graph_cache
    _graph_cache = load_or_build(ROOT, CACHE)
    return _graph_cache


def _nodes() -> dict[str, dict]:
    return _g()["nodes"]


def _edges() -> list[dict]:
    return _g()["edges"]


# ---------------------------------------------------------------------------
# Graph traversal helpers
# ---------------------------------------------------------------------------

def _outgoing(node_id: str, kind: str | None = None) -> list[str]:
    return [
        e["dst"] for e in _edges()
        if e["src"] == node_id and (kind is None or e["kind"] == kind)
    ]


def _incoming(node_id: str, kind: str | None = None) -> list[str]:
    return [
        e["src"] for e in _edges()
        if e["dst"] == node_id and (kind is None or e["kind"] == kind)
    ]


def _bfs(start_ids: list[str], direction: str, max_depth: int, kind: str | None = None) -> dict[str, int]:
    """BFS returning {node_id: depth}. direction: 'out' | 'in'."""
    visited: dict[str, int] = {}
    queue = [(nid, 0) for nid in start_ids]
    while queue:
        cur, depth = queue.pop(0)
        if cur in visited or depth > max_depth:
            continue
        visited[cur] = depth
        if direction == "out":
            neighbors = _outgoing(cur, kind)
        else:
            neighbors = _incoming(cur, kind)
        for nb in neighbors:
            if nb not in visited:
                queue.append((nb, depth + 1))
    return visited


def _find_by_name(name: str) -> list[str]:
    """Return node IDs whose name matches (case-insensitive)."""
    name_lower = name.lower()
    return [nid for nid, n in _nodes().items() if n["name"].lower() == name_lower]


def _search_nodes(query: str, limit: int = 20) -> list[dict]:
    """Fuzzy search across node names and docstrings."""
    query_lower = query.lower()
    results = []
    for nid, node in _nodes().items():
        score = 0
        if query_lower in node["name"].lower():
            score += 10 if node["name"].lower() == query_lower else 5
        if node.get("docstring") and query_lower in node["docstring"].lower():
            score += 2
        if score:
            results.append((score, nid, node))
    results.sort(key=lambda x: -x[0])
    return [{"id": nid, **node} for _, nid, node in results[:limit]]


def _node_summary(nid: str) -> dict | None:
    node = _nodes().get(nid)
    if not node:
        return None
    return {
        "id": nid,
        "type": node["type"],
        "name": node["name"],
        "file": os.path.relpath(node["file"], ROOT).replace("\\", "/"),
        "line": node["line"],
        "end_line": node["end_line"],
        "docstring": node.get("docstring", "")[:200],
    }


# ---------------------------------------------------------------------------
# Risk scoring for detect_changes
# ---------------------------------------------------------------------------

_RISK_KEYWORDS = {
    "auth": 3, "token": 3, "password": 3, "secret": 3, "cognito": 3,
    "iam": 3, "sts": 3, "role": 2, "permission": 2, "admin": 2,
    "delete": 2, "drop": 2, "truncate": 2, "billing": 2, "payment": 2,
    "prod": 2, "production": 2, "migrate": 2,
    "backup": 1, "restore": 1, "ec2": 1, "lambda": 1,
}


def _risk_score(filepath: str, diff_text: str) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    text_lower = (filepath + " " + diff_text).lower()
    for kw, weight in _RISK_KEYWORDS.items():
        if kw in text_lower:
            score += weight
            reasons.append(kw)
    # More changed lines = higher risk
    added = diff_text.count("\n+")
    removed = diff_text.count("\n-")
    churn = added + removed
    if churn > 50:
        score += 3
        reasons.append(f"large churn ({churn} lines)")
    elif churn > 20:
        score += 1
        reasons.append(f"moderate churn ({churn} lines)")
    return min(score, 10), reasons


# ---------------------------------------------------------------------------
# MCP tools
# ---------------------------------------------------------------------------

@mcp.tool()
def detect_changes(base_ref: str = "HEAD~1") -> str:
    """
    Analyse git diff between base_ref and working tree.
    Returns changed files with risk scores and affected graph nodes.
    """
    try:
        diff_out = subprocess.check_output(
            ["git", "diff", "--name-only", base_ref],
            cwd=ROOT, text=True, stderr=subprocess.DEVNULL
        ).strip()
    except subprocess.CalledProcessError:
        return json.dumps({"error": f"git diff failed for base_ref={base_ref}"})

    changed_files = [f.strip() for f in diff_out.splitlines() if f.strip()]
    if not changed_files:
        return json.dumps({"message": "No changed files detected.", "base_ref": base_ref})

    results = []
    nodes = _nodes()
    edges = _edges()

    for rel_path in changed_files:
        abs_path = os.path.join(ROOT, rel_path)
        try:
            diff_text = subprocess.check_output(
                ["git", "diff", base_ref, "--", rel_path],
                cwd=ROOT, text=True, stderr=subprocess.DEVNULL
            )
        except Exception:
            diff_text = ""

        score, reasons = _risk_score(rel_path, diff_text)
        file_nid = _file_id(abs_path)

        # Find nodes defined in this file
        defined_nids = [
            e["dst"] for e in edges
            if e["src"] == file_nid and e["kind"] == "defines" and e["dst"] in nodes
        ]

        results.append({
            "file": rel_path,
            "risk_score": score,
            "risk_reasons": reasons,
            "defined_nodes": [_node_summary(n) for n in defined_nids if _node_summary(n)],
            "callers_in_other_files": [
                _node_summary(caller)
                for nid in defined_nids
                for caller in _incoming(nid, "calls")
                if caller in nodes and nodes[caller]["file"] != abs_path
            ][:10],
        })

    results.sort(key=lambda x: -x["risk_score"])
    return json.dumps({"base_ref": base_ref, "changed_files": results}, indent=2)


@mcp.tool()
def get_review_context(name: str, include_source: bool = True) -> str:
    """
    Return source snippet + callers + callees for a function/class by name.
    Token-efficient alternative to reading full files during code review.
    """
    matches = _find_by_name(name)
    if not matches:
        # Try semantic search
        matches_data = _search_nodes(name, limit=3)
        if not matches_data:
            return json.dumps({"error": f"No node found for '{name}'"})
        matches = [m["id"] for m in matches_data]

    results = []
    for nid in matches[:3]:
        node = _nodes().get(nid)
        if not node:
            continue
        entry = _node_summary(nid) or {}
        if include_source and node.get("source"):
            # Trim long sources
            src = node["source"]
            if len(src) > 1500:
                src = src[:1500] + "\n... (truncated)"
            entry["source"] = src
        entry["callers"] = [_node_summary(c) for c in _incoming(nid, "calls") if _node_summary(c)][:8]
        entry["callees"] = [
            {"name": e["dst"] if e["dst"] in _nodes() else e["dst"],
             **((_node_summary(e["dst"]) or {"name": e["dst"]}))
            }
            for e in _edges()
            if e["src"] == nid and e["kind"] == "calls"
        ][:8]
        results.append(entry)

    return json.dumps(results, indent=2)


@mcp.tool()
def get_impact_radius(name: str, max_depth: int = 3) -> str:
    """
    BFS outward from a node to find everything that depends on it (callers tree).
    Use before making changes to understand blast radius.
    """
    seeds = _find_by_name(name)
    if not seeds:
        hits = _search_nodes(name, limit=1)
        seeds = [hits[0]["id"]] if hits else []
    if not seeds:
        return json.dumps({"error": f"Node '{name}' not found"})

    visited = _bfs(seeds, direction="in", max_depth=max_depth, kind="calls")
    by_depth: dict[int, list] = {}
    for nid, depth in visited.items():
        if depth == 0:
            continue
        by_depth.setdefault(depth, []).append(_node_summary(nid))

    return json.dumps({
        "root": name,
        "seeds": seeds,
        "impact_by_depth": {str(k): v for k, v in sorted(by_depth.items())},
        "total_affected": len(visited) - len(seeds),
    }, indent=2)


@mcp.tool()
def get_affected_flows(name: str, max_depth: int = 4) -> str:
    """
    Trace all execution flows that pass through a node (both callers and callees).
    Returns upstream callers and downstream callees up to max_depth hops.
    """
    seeds = _find_by_name(name)
    if not seeds:
        hits = _search_nodes(name, limit=1)
        seeds = [hits[0]["id"]] if hits else []
    if not seeds:
        return json.dumps({"error": f"Node '{name}' not found"})

    upstream = _bfs(seeds, direction="in", max_depth=max_depth, kind="calls")
    downstream = _bfs(seeds, direction="out", max_depth=max_depth, kind="calls")

    def _fmt(d: dict, skip_depth_0: bool = True) -> list:
        return [
            {**(_node_summary(nid) or {"id": nid}), "depth": depth}
            for nid, depth in sorted(d.items(), key=lambda x: x[1])
            if not (skip_depth_0 and depth == 0)
        ]

    return json.dumps({
        "node": name,
        "upstream_callers": _fmt(upstream),
        "downstream_callees": _fmt(downstream),
    }, indent=2)


@mcp.tool()
def query_graph(pattern: str, name: str, limit: int = 20) -> str:
    """
    Flexible graph query.
    pattern: callers_of | callees_of | imports_of | imported_by | tests_for | defines_in | siblings
    name: the node or file name to query
    """
    seeds = _find_by_name(name)
    if not seeds:
        # Also try file names
        file_matches = [
            nid for nid, n in _nodes().items()
            if n["type"] == "file" and name.lower() in n["name"].lower()
        ]
        seeds = file_matches[:1]
    if not seeds:
        hits = _search_nodes(name, limit=1)
        seeds = [hits[0]["id"]] if hits else []
    if not seeds:
        return json.dumps({"error": f"No node found for '{name}'"})

    nid = seeds[0]
    results: list[dict | None] = []

    if pattern == "callers_of":
        results = [_node_summary(c) for c in _incoming(nid, "calls")]
    elif pattern == "callees_of":
        results = [_node_summary(c) for c in _outgoing(nid, "calls")]
    elif pattern == "imports_of":
        results = [{"module": dst} for dst in _outgoing(nid, "imports")]
    elif pattern == "imported_by":
        results = [_node_summary(s) for s in _incoming(nid, "imports")]
    elif pattern == "tests_for":
        # Find files with "test" in name that import this file
        node = _nodes().get(nid, {})
        target_file = node.get("file", "")
        test_results = []
        for n2id, n2 in _nodes().items():
            if n2["type"] == "file" and "test" in n2["name"].lower():
                # Check if this test file imports the target
                imported = _outgoing(n2id, "imports")
                mod_name = Path(target_file).stem
                if any(mod_name in (i if isinstance(i, str) else "") for i in imported):
                    test_results.append(_node_summary(n2id))
        results = test_results
    elif pattern == "defines_in":
        results = [_node_summary(d) for d in _outgoing(nid, "defines")]
    elif pattern == "siblings":
        parent_file = _nodes().get(nid, {}).get("file", "")
        file_nid = _file_id(parent_file)
        siblings = [_node_summary(d) for d in _outgoing(file_nid, "defines") if d != nid]
        results = siblings
    else:
        return json.dumps({"error": f"Unknown pattern '{pattern}'. Choose: callers_of, callees_of, imports_of, imported_by, tests_for, defines_in, siblings"})

    filtered = [r for r in results if r is not None][:limit]
    return json.dumps({"pattern": pattern, "name": name, "results": filtered, "count": len(filtered)}, indent=2)


@mcp.tool()
def semantic_search_nodes(query: str, limit: int = 15, node_type: str = "") -> str:
    """
    Find functions, classes, or files by name or keyword.
    node_type filter: '' (all) | 'function' | 'class' | 'file' | 'method'
    """
    results = _search_nodes(query, limit=limit * 3)
    if node_type:
        results = [r for r in results if r.get("type") == node_type]
    results = results[:limit]
    # Add caller count for context
    out = []
    for r in results:
        nid = r["id"]
        entry = {
            "id": nid,
            "type": r["type"],
            "name": r["name"],
            "file": os.path.relpath(r["file"], ROOT).replace("\\", "/"),
            "line": r["line"],
            "caller_count": len(_incoming(nid, "calls")),
            "callee_count": len(_outgoing(nid, "calls")),
        }
        if r.get("docstring"):
            entry["docstring"] = r["docstring"][:120]
        out.append(entry)
    return json.dumps({"query": query, "results": out, "total": len(out)}, indent=2)


@mcp.tool()
def get_architecture_overview() -> str:
    """
    High-level codebase structure: file count, function count, top hubs,
    most-called functions, module dependency summary.
    """
    nodes = _nodes()
    edges = _edges()
    meta = _g()["meta"]

    by_type: dict[str, int] = {}
    by_file: dict[str, int] = {}
    for nid, node in nodes.items():
        by_type[node["type"]] = by_type.get(node["type"], 0) + 1
        if node["type"] != "file":
            rel = os.path.relpath(node["file"], ROOT).replace("\\", "/")
            by_file[rel] = by_file.get(rel, 0) + 1

    # Top hubs = most callers
    call_counts: dict[str, int] = {}
    for e in edges:
        if e["kind"] == "calls" and e["dst"] in nodes:
            call_counts[e["dst"]] = call_counts.get(e["dst"], 0) + 1

    top_hubs = sorted(call_counts.items(), key=lambda x: -x[1])[:10]
    top_hubs_fmt = [
        {**(_node_summary(nid) or {"id": nid}), "caller_count": cnt}
        for nid, cnt in top_hubs
    ]

    # Top files by symbol count
    top_files = sorted(by_file.items(), key=lambda x: -x[1])[:10]

    # File-level import graph edges
    import_pairs = [
        (os.path.relpath(nodes[e["src"]]["file"], ROOT).replace("\\", "/"), e["dst"])
        for e in edges
        if e["kind"] == "imports" and e["src"] in nodes and nodes[e["src"]]["type"] == "file"
    ][:30]

    return json.dumps({
        "meta": meta,
        "by_type": by_type,
        "top_files_by_symbol_count": [{"file": f, "symbols": c} for f, c in top_files],
        "top_hubs_most_called": top_hubs_fmt,
        "sample_import_pairs": [{"from": src, "to": dst} for src, dst in import_pairs[:20]],
    }, indent=2)


@mcp.tool()
def list_communities() -> str:
    """
    Group files into communities based on import relationships.
    Returns clusters of tightly coupled modules.
    """
    nodes = _nodes()
    edges = _edges()

    # Build file-level import graph
    file_nodes = {nid: n for nid, n in nodes.items() if n["type"] == "file"}
    file_name_to_id = {
        Path(n["file"]).stem: nid for nid, n in file_nodes.items()
    }

    # Union-Find for community detection
    parent: dict[str, str] = {nid: nid for nid in file_nodes}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: str, b: str):
        a, b = find(a), find(b)
        if a != b:
            parent[a] = b

    for e in edges:
        if e["kind"] != "imports":
            continue
        src = e["src"]
        dst_name = Path(e["dst"]).stem if "/" in e["dst"] or "." in e["dst"] else e["dst"]
        dst_nid = file_name_to_id.get(dst_name)
        if src in file_nodes and dst_nid and dst_nid in file_nodes:
            union(src, dst_nid)

    # Group by root
    communities: dict[str, list] = {}
    for nid in file_nodes:
        root = find(nid)
        rel = os.path.relpath(file_nodes[nid]["file"], ROOT).replace("\\", "/")
        communities.setdefault(root, []).append(rel)

    result = []
    for root, members in communities.items():
        members.sort()
        root_node = file_nodes.get(root, {})
        result.append({
            "community_root": os.path.relpath(root_node.get("file", root), ROOT).replace("\\", "/"),
            "size": len(members),
            "members": members,
        })
    result.sort(key=lambda x: -x["size"])

    return json.dumps({"communities": result, "total": len(result)}, indent=2)


@mcp.tool()
def refactor_tool(action: str, name: str = "", new_name: str = "") -> str:
    """
    Refactoring assistant.
    action: dead_code | rename_plan | find_large_functions | find_god_files
    name: target node/file name (for dead_code, rename_plan)
    new_name: replacement name (for rename_plan)
    """
    nodes = _nodes()
    edges = _edges()

    if action == "dead_code":
        # Functions with zero callers and not main/handler/lambda_handler
        ENTRY_POINTS = {"main", "handler", "lambda_handler", "index", "app"}
        dead = []
        for nid, node in nodes.items():
            if node["type"] not in ("function", "method"):
                continue
            if node["name"] in ENTRY_POINTS:
                continue
            caller_count = len(_incoming(nid, "calls"))
            if caller_count == 0:
                dead.append({
                    "name": node["name"],
                    "file": os.path.relpath(node["file"], ROOT).replace("\\", "/"),
                    "line": node["line"],
                    "type": node["type"],
                })
        dead.sort(key=lambda x: x["file"])
        return json.dumps({"dead_code_candidates": dead, "count": len(dead)}, indent=2)

    elif action == "rename_plan":
        if not name:
            return json.dumps({"error": "Provide name= for rename_plan"})
        seeds = _find_by_name(name)
        if not seeds:
            return json.dumps({"error": f"'{name}' not found"})
        sites: list[dict] = []
        for nid in seeds:
            node = nodes[nid]
            sites.append({
                "definition": os.path.relpath(node["file"], ROOT).replace("\\", "/") + f":{node['line']}",
                "callers": [
                    {
                        **((_node_summary(c) or {"id": c})),
                        "file_line": os.path.relpath(nodes[c]["file"], ROOT).replace("\\", "/") + f":{nodes[c]['line']}"
                        if c in nodes else c,
                    }
                    for c in _incoming(nid, "calls")
                ]
            })
        return json.dumps({
            "rename": {"from": name, "to": new_name or "<new_name>"},
            "sites_to_update": sites,
            "total_callers": sum(len(s["callers"]) for s in sites),
        }, indent=2)

    elif action == "find_large_functions":
        large = []
        for nid, node in nodes.items():
            if node["type"] not in ("function", "method"):
                continue
            size = (node.get("end_line") or node["line"]) - node["line"]
            if size > 40:
                large.append({
                    "name": node["name"],
                    "file": os.path.relpath(node["file"], ROOT).replace("\\", "/"),
                    "line": node["line"],
                    "lines": size,
                })
        large.sort(key=lambda x: -x["lines"])
        return json.dumps({"large_functions": large[:20]}, indent=2)

    elif action == "find_god_files":
        by_file: dict[str, list] = {}
        for nid, node in nodes.items():
            if node["type"] == "file":
                continue
            rel = os.path.relpath(node["file"], ROOT).replace("\\", "/")
            by_file.setdefault(rel, []).append(node["name"])
        god = sorted(
            [{"file": f, "symbol_count": len(s), "symbols": s[:10]} for f, s in by_file.items()],
            key=lambda x: -x["symbol_count"]
        )
        return json.dumps({"god_files": god[:10]}, indent=2)

    else:
        return json.dumps({"error": f"Unknown action '{action}'. Choose: dead_code, rename_plan, find_large_functions, find_god_files"})


@mcp.tool()
def rebuild_graph() -> str:
    """Force a full graph rebuild (use after significant code changes)."""
    global _graph_cache
    g = rebuild(ROOT, CACHE)
    _graph_cache = g
    return json.dumps({
        "status": "ok",
        "nodes": g["meta"]["node_count"],
        "edges": g["meta"]["edge_count"],
        "root": g["meta"]["root"],
    })


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run()
