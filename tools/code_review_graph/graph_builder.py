"""
Parse Python and JavaScript source files into a knowledge graph.

Graph schema
------------
nodes: {node_id: NodeDict}
  NodeDict keys: type, name, file, line, end_line, docstring, source, parent
  type values: "file" | "function" | "class" | "method"

edges: list of {src, dst, kind}
  kind values: "calls" | "imports" | "defines" | "inherits" | "contains"
"""
from __future__ import annotations

import ast
import hashlib
import json
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _node_id(file: str, name: str) -> str:
    key = f"{file}::{name}"
    return hashlib.md5(key.encode()).hexdigest()[:12]


def _file_id(file: str) -> str:
    return _node_id(file, "<file>")


def _read(path: str) -> str:
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def _source_lines(source: str, start: int, end: int) -> str:
    lines = source.splitlines()
    return "\n".join(lines[start - 1 : end])


# ---------------------------------------------------------------------------
# Python parser
# ---------------------------------------------------------------------------

class _PythonVisitor(ast.NodeVisitor):
    def __init__(self, filepath: str, source: str, nodes: dict, edges: list):
        self.filepath = filepath
        self.source = source
        self.lines = source.splitlines()
        self.nodes = nodes
        self.edges = edges
        self._class_stack: list[str] = []  # stack of class node_ids
        self._func_stack: list[str] = []   # stack of function node_ids
        self._imports: list[str] = []       # resolved module names

    def _get_source(self, node: ast.AST) -> str:
        try:
            return ast.get_source_segment(self.source, node) or ""
        except Exception:
            return ""

    def _get_docstring(self, node: ast.AST) -> str:
        try:
            return ast.get_docstring(node) or ""
        except Exception:
            return ""

    def visit_Import(self, node: ast.Import):
        file_nid = _file_id(self.filepath)
        for alias in node.names:
            self.edges.append({"src": file_nid, "dst": alias.name, "kind": "imports"})
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        file_nid = _file_id(self.filepath)
        module = node.module or ""
        self.edges.append({"src": file_nid, "dst": module, "kind": "imports"})
        self.generic_visit(node)

    def visit_ClassDef(self, node: ast.ClassDef):
        file_nid = _file_id(self.filepath)
        nid = _node_id(self.filepath, node.name)
        end = getattr(node, "end_lineno", node.lineno)
        self.nodes[nid] = {
            "type": "class",
            "name": node.name,
            "file": self.filepath,
            "line": node.lineno,
            "end_line": end,
            "docstring": self._get_docstring(node),
            "source": self._get_source(node),
            "parent": self._class_stack[-1] if self._class_stack else None,
        }
        self.edges.append({"src": file_nid, "dst": nid, "kind": "defines"})
        for base in node.bases:
            if isinstance(base, ast.Name):
                self.edges.append({"src": nid, "dst": base.id, "kind": "inherits"})
            elif isinstance(base, ast.Attribute):
                self.edges.append({"src": nid, "dst": base.attr, "kind": "inherits"})
        self._class_stack.append(nid)
        self.generic_visit(node)
        self._class_stack.pop()

    def _visit_func(self, node: ast.FunctionDef | ast.AsyncFunctionDef):
        file_nid = _file_id(self.filepath)
        ftype = "method" if self._class_stack else "function"
        nid = _node_id(self.filepath, node.name)
        # disambiguate overloads by line
        base_name = node.name
        if nid in self.nodes:
            nid = _node_id(self.filepath, f"{node.name}:{node.lineno}")
        end = getattr(node, "end_lineno", node.lineno)
        self.nodes[nid] = {
            "type": ftype,
            "name": base_name,
            "file": self.filepath,
            "line": node.lineno,
            "end_line": end,
            "docstring": self._get_docstring(node),
            "source": self._get_source(node),
            "parent": self._class_stack[-1] if self._class_stack else None,
        }
        self.edges.append({"src": file_nid, "dst": nid, "kind": "defines"})
        if self._class_stack:
            self.edges.append({"src": self._class_stack[-1], "dst": nid, "kind": "contains"})
        self._func_stack.append(nid)
        self.generic_visit(node)
        self._func_stack.pop()

    visit_FunctionDef = _visit_func
    visit_AsyncFunctionDef = _visit_func

    def visit_Call(self, node: ast.Call):
        if self._func_stack:
            caller = self._func_stack[-1]
            callee_name: str | None = None
            if isinstance(node.func, ast.Name):
                callee_name = node.func.id
            elif isinstance(node.func, ast.Attribute):
                callee_name = node.func.attr
            if callee_name:
                self.edges.append({"src": caller, "dst": callee_name, "kind": "calls"})
        self.generic_visit(node)


def parse_python(filepath: str, nodes: dict, edges: list):
    source = _read(filepath)
    if not source:
        return
    file_nid = _file_id(filepath)
    nodes[file_nid] = {
        "type": "file",
        "name": Path(filepath).name,
        "file": filepath,
        "line": 1,
        "end_line": len(source.splitlines()),
        "docstring": "",
        "source": "",
        "parent": None,
    }
    try:
        tree = ast.parse(source, filename=filepath)
    except SyntaxError:
        return
    visitor = _PythonVisitor(filepath, source, nodes, edges)
    visitor.visit(tree)


# ---------------------------------------------------------------------------
# JavaScript parser (regex-based)
# ---------------------------------------------------------------------------

_JS_FUNC_RE = re.compile(
    r"(?:^|\n)"                                    # line start
    r"(?:export\s+(?:default\s+)?(?:async\s+)?)?"  # optional export
    r"(?:async\s+)?"
    r"(?:function\s+(\w+)|(\w+)\s*[:=]\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))",
    re.MULTILINE,
)

_JS_CLASS_RE = re.compile(r"(?:^|\n)(?:export\s+)?class\s+(\w+)", re.MULTILINE)
_JS_IMPORT_RE = re.compile(r"(?:^|\n)\s*import\s+.*?from\s+['\"]([^'\"]+)['\"]", re.MULTILINE)
_JS_REQUIRE_RE = re.compile(r"require\(['\"]([^'\"]+)['\"]\)", re.MULTILINE)
_JS_CALL_RE = re.compile(r"(\w+)\s*\(", re.MULTILINE)


def parse_js(filepath: str, nodes: dict, edges: list):
    source = _read(filepath)
    if not source:
        return
    file_nid = _file_id(filepath)
    source_lines = source.splitlines()
    nodes[file_nid] = {
        "type": "file",
        "name": Path(filepath).name,
        "file": filepath,
        "line": 1,
        "end_line": len(source_lines),
        "docstring": "",
        "source": "",
        "parent": None,
    }

    # Imports
    for m in _JS_IMPORT_RE.finditer(source):
        edges.append({"src": file_nid, "dst": m.group(1), "kind": "imports"})
    for m in _JS_REQUIRE_RE.finditer(source):
        edges.append({"src": file_nid, "dst": m.group(1), "kind": "imports"})

    # Classes
    for m in _JS_CLASS_RE.finditer(source):
        name = m.group(1)
        line = source[: m.start()].count("\n") + 1
        nid = _node_id(filepath, name)
        nodes[nid] = {
            "type": "class",
            "name": name,
            "file": filepath,
            "line": line,
            "end_line": line,
            "docstring": "",
            "source": "",
            "parent": None,
        }
        edges.append({"src": file_nid, "dst": nid, "kind": "defines"})

    # Functions
    for m in _JS_FUNC_RE.finditer(source):
        name = m.group(1) or m.group(2)
        if not name or name in ("if", "for", "while", "switch", "catch"):
            continue
        line = source[: m.start()].count("\n") + 1
        nid = _node_id(filepath, name)
        if nid in nodes:
            nid = _node_id(filepath, f"{name}:{line}")
        nodes[nid] = {
            "type": "function",
            "name": name,
            "file": filepath,
            "line": line,
            "end_line": line,
            "docstring": "",
            "source": "",
            "parent": None,
        }
        edges.append({"src": file_nid, "dst": nid, "kind": "defines"})


# ---------------------------------------------------------------------------
# Build full graph
# ---------------------------------------------------------------------------

def build_graph(root: str) -> dict[str, Any]:
    root = str(Path(root).resolve())
    nodes: dict[str, dict] = {}
    edges: list[dict] = []

    # Walk files
    for dirpath, dirnames, filenames in os.walk(root):
        # Skip common noise directories
        dirnames[:] = [
            d for d in dirnames
            if d not in {".git", "node_modules", "__pycache__", ".venv", "venv",
                         "dist", "build", ".aws-sam", "vendor"}
        ]
        for fname in filenames:
            fpath = os.path.join(dirpath, fname)
            if fname.endswith(".py"):
                parse_python(fpath, nodes, edges)
            elif fname.endswith((".js", ".mjs")):
                parse_js(fpath, nodes, edges)

    # Resolve symbolic call/import edges to node IDs where possible
    name_index: dict[str, list[str]] = {}
    for nid, node in nodes.items():
        name_index.setdefault(node["name"], []).append(nid)

    resolved_edges: list[dict] = []
    for edge in edges:
        dst = edge["dst"]
        if dst in nodes:
            resolved_edges.append(edge)
        elif dst in name_index:
            for target_nid in name_index[dst]:
                resolved_edges.append({"src": edge["src"], "dst": target_nid, "kind": edge["kind"]})
        else:
            # Keep unresolved as symbolic (dst is a string name, not an ID)
            resolved_edges.append(edge)

    return {
        "nodes": nodes,
        "edges": resolved_edges,
        "meta": {
            "root": root,
            "built_at": time.time(),
            "node_count": len(nodes),
            "edge_count": len(resolved_edges),
        },
    }


def load_or_build(root: str, cache_path: str) -> dict[str, Any]:
    """Load cached graph if fresh (< 5 min old), else rebuild."""
    cache = Path(cache_path)
    if cache.exists():
        try:
            g = json.loads(cache.read_text(encoding="utf-8"))
            age = time.time() - g.get("meta", {}).get("built_at", 0)
            if age < 300:
                return g
        except Exception:
            pass
    g = build_graph(root)
    cache.write_text(json.dumps(g, ensure_ascii=False, indent=2), encoding="utf-8")
    return g


def rebuild(root: str, cache_path: str) -> dict[str, Any]:
    g = build_graph(root)
    Path(cache_path).write_text(json.dumps(g, ensure_ascii=False, indent=2), encoding="utf-8")
    return g
