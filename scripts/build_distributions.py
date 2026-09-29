#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import tempfile
import zipfile
from pathlib import Path

FIXED_ZIP_TIME = (2020, 1, 1, 0, 0, 0)
RUNTIMES = ("chat", "plugin", "claude", "opencode")
SOURCE_EXCLUDES = {".git", ".github/workflows/__pycache__", "dist", "build", "__pycache__", ".pytest_cache", ".DS_Store"}


def slugify(value: str) -> str:
    s = value.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "gpt"


def parse_simple_yaml(path: Path) -> dict:
    result: dict = {}
    stack: list[tuple[int, dict]] = [(-1, result)]
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        line = raw.strip()
        if ":" not in line:
            raise ValueError(f"Unsupported YAML line: {raw}")
        key, value = line.split(":", 1)
        while stack[-1][0] >= indent:
            stack.pop()
        parent = stack[-1][1]
        value = value.strip()
        if value == "":
            child: dict = {}
            parent[key] = child
            stack.append((indent, child))
        elif value.isdigit():
            parent[key] = int(value)
        elif value.startswith('"'):
            parent[key] = json.loads(value)
        else:
            parent[key] = value.strip("'")
    return result


def stable_zip(source_dir: Path, target: Path, *, prefix: str | None = None) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in source_dir.rglob("*") if p.is_file())
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in files:
            rel = p.relative_to(source_dir).as_posix()
            arcname = f"{prefix}/{rel}" if prefix else rel
            info = zipfile.ZipInfo(arcname, FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, p.read_bytes())


def copy_knowledge(project: Path, dest: Path) -> None:
    src = project / "knowledge"
    if src.exists():
        files = [p for p in src.rglob("*") if p.is_file()]
        if files:
            shutil.copytree(src, dest, dirs_exist_ok=True)


def load_project(project: Path) -> tuple[dict, str]:
    cfg = parse_simple_yaml(project / "gpt.yaml")
    if cfg.get("schema_version") != 1:
        raise ValueError("Only schema_version: 1 is supported")
    gpt = cfg.get("gpt", {})
    for field in ("name", "description"):
        if not str(gpt.get(field, "")).strip():
            raise ValueError(f"Missing gpt.{field}")
    gpt["id"] = slugify(str(gpt.get("id") or gpt["name"]))
    instructions = (project / "instructions.md").read_text(encoding="utf-8").strip() + "\n"
    return gpt, instructions


def build_chat(project: Path, gpt: dict, instructions: str, root: Path, version: str) -> None:
    (root / "assistant").mkdir(parents=True)
    (root / "assistant" / "instructions.md").write_text(instructions, encoding="utf-8")
    copy_knowledge(project, root / "knowledge")
    (root / "START-HERE.md").write_text(
        f"# {gpt['name']}\n\n{gpt['description']}\n\n"
        "Använd innehållet i denna ZIP som GPT-kontext i den här konversationen.\n\n"
        "Läs först `assistant/instructions.md`. Knowledge-filer finns under `knowledge/` när sådana finns.\n",
        encoding="utf-8",
    )
    (root / "VERSION").write_text(version + "\n", encoding="utf-8")


def build_plugin(project: Path, gpt: dict, instructions: str, root: Path, version: str) -> None:
    skill = root / "skills" / gpt["id"]
    refs = skill / "references"
    skill.mkdir(parents=True)
    copy_knowledge(project, refs)
    plugin = {
        "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        "name": gpt["id"],
        "version": version,
        "description": gpt["description"],
    }
    (root / "plugin.json").write_text(json.dumps(plugin, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (root / "README.md").write_text(
        f"# {gpt['name']}\n\nPlugin-distribution genererad från canonical GPT-innehåll.\n",
        encoding="utf-8",
    )
    (skill / "SKILL.md").write_text(
        "---\n"
        f"name: {gpt['id']}\n"
        f"description: {gpt['description']}\n"
        "---\n\n"
        + instructions
        + "\n<!-- GPT-PACKAGER:RUNTIME-ADAPTER:BEGIN -->\n"
        + "## Knowledge\n\nReferensmaterial finns under `references/` när sådant finns.\n"
        + "<!-- GPT-PACKAGER:RUNTIME-ADAPTER:END -->\n",
        encoding="utf-8",
    )
    (root / "VERSION").write_text(version + "\n", encoding="utf-8")


def build_claude(project: Path, gpt: dict, instructions: str, root: Path, version: str) -> None:
    (root / "instructions.md").write_text(instructions, encoding="utf-8")
    copy_knowledge(project, root / "knowledge")
    (root / "README.md").write_text(
        f"# {gpt['name']} – Claude\n\n{gpt['description']}\n\n"
        "1. Skapa ett Claude Project.\n"
        "2. Använd `instructions.md` som Project Instructions.\n"
        "3. Lägg till filerna under `knowledge/` som Project Files när sådana finns.\n",
        encoding="utf-8",
    )
    (root / "VERSION").write_text(version + "\n", encoding="utf-8")


def build_opencode(project: Path, gpt: dict, instructions: str, root: Path, version: str) -> None:
    copy_knowledge(project, root / "knowledge")
    (root / "AGENTS.md").write_text(
        instructions
        + "\n<!-- GPT-PACKAGER:RUNTIME-ADAPTER:BEGIN -->\n"
        + "## OpenCode runtime\n\n"
        + "Knowledge-filer som hör till assistenten finns under `knowledge/` när sådana finns. "
        + "Använd dem när instruktionen eller uppgiften gör dem relevanta.\n"
        + "<!-- GPT-PACKAGER:RUNTIME-ADAPTER:END -->\n",
        encoding="utf-8",
    )
    (root / "README.md").write_text(
        f"# {gpt['name']} – OpenCode\n\n{gpt['description']}\n\n"
        "Packa upp innehållet i roten av det workspace där assistenten ska användas.\n",
        encoding="utf-8",
    )
    (root / "VERSION").write_text(version + "\n", encoding="utf-8")


def is_source_file(root: Path, path: Path) -> bool:
    rel = path.relative_to(root)
    if any(part in {".git", "dist", "build", "__pycache__", ".pytest_cache"} for part in rel.parts):
        return False
    if path.name == ".DS_Store" or path.suffix in {".pyc", ".pyo"}:
        return False
    return path.is_file()


def build_project_zip(root: Path, output: Path, version: str) -> Path:
    name = f"gpt-paketeraren-{version}"
    with tempfile.TemporaryDirectory() as td:
        stage = Path(td) / name
        stage.mkdir(parents=True)
        for p in sorted(root.rglob("*")):
            if is_source_file(root, p):
                dest = stage / p.relative_to(root)
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(p, dest)
        target = output / f"{name}.zip"
        stable_zip(stage, target, prefix=name)
        return target


def write_release_metadata(output: Path, artifacts: list[Path], version: str) -> None:
    rows = []
    for p in sorted(artifacts, key=lambda x: x.name):
        digest = hashlib.sha256(p.read_bytes()).hexdigest()
        rows.append((digest, p.name))
    (output / "SHA256SUMS.txt").write_text("".join(f"{d}  {n}\n" for d, n in rows), encoding="utf-8")
    manifest = {
        "version": version,
        "artifacts": [{"file": n, "sha256": d} for d, n in rows],
    }
    (output / "DELIVERY-MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description="Build canonical GPT project distributions.")
    ap.add_argument("project", nargs="?", type=Path, help="Canonical GPT project directory")
    ap.add_argument("--project-root", type=Path, help="Repository root; canonical project defaults to <root>/packager")
    ap.add_argument("--output", type=Path, default=Path("dist"))
    ap.add_argument("--version", default="0.0.0-dev")
    ap.add_argument("--targets", default="chat,plugin,claude,opencode", help="Comma-separated: project,chat,plugin,claude,opencode")
    args = ap.parse_args()

    repo_root = (args.project_root or Path.cwd()).resolve()
    project = (args.project or (repo_root / "packager")).resolve()
    output = args.output.resolve()
    targets = [x.strip() for x in args.targets.split(",") if x.strip()]
    unknown = set(targets) - ({"project"} | set(RUNTIMES))
    if unknown:
        raise SystemExit(f"Unknown targets: {', '.join(sorted(unknown))}")

    gpt, instructions = load_project(project)
    builders = {"chat": build_chat, "plugin": build_plugin, "claude": build_claude, "opencode": build_opencode}
    output.mkdir(parents=True, exist_ok=True)
    artifacts: list[Path] = []

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        for runtime in RUNTIMES:
            if runtime not in targets:
                continue
            runtime_root = tmp / runtime
            runtime_root.mkdir()
            builders[runtime](project, gpt, instructions, runtime_root, args.version)
            target = output / f"{gpt['id']}-{runtime}-{args.version}.zip"
            stable_zip(runtime_root, target)
            artifacts.append(target)
            print(target)

    if "project" in targets:
        target = build_project_zip(repo_root, output, args.version)
        artifacts.append(target)
        print(target)

    if artifacts:
        write_release_metadata(output, artifacts, args.version)


if __name__ == "__main__":
    main()
