#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import shutil
import tempfile
import zipfile
from pathlib import Path


def slugify(value: str) -> str:
    s = value.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "imported-gpt"


ADAPTER_BEGIN = "<!-- GPT-PACKAGER:RUNTIME-ADAPTER:BEGIN -->"

def strip_runtime_adapter(text: str) -> str:
    if ADAPTER_BEGIN in text:
        text = text.split(ADAPTER_BEGIN, 1)[0]
    return text.strip() + "\n"

def read_readme_metadata(path: Path, suffix: str = "") -> tuple[str | None, str | None]:
    if not path.exists():
        return None, None
    lines = path.read_text(encoding="utf-8").splitlines()
    name = None
    description = None
    if lines and lines[0].startswith("# "):
        name = lines[0][2:].strip()
        if suffix and name.endswith(suffix):
            name = name[: -len(suffix)].strip()
    for line in lines[1:]:
        if line.strip():
            description = line.strip()
            break
    return name, description

def strip_skill_frontmatter(text: str) -> tuple[dict, str]:
    meta = {}
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end != -1:
            raw = text[4:end]
            for line in raw.splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip().strip('"\'')
            text = text[end + 5 :]
    return meta, strip_runtime_adapter(text)


def copy_tree_if_exists(src: Path, dest: Path) -> list[str]:
    copied = []
    if src.exists() and src.is_dir():
        for p in sorted(src.rglob("*")):
            if p.is_file():
                rel = p.relative_to(src)
                target = dest / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(p, target)
                copied.append(rel.as_posix())
    return copied


def detect(root: Path) -> str:
    if (root / "assistant" / "instructions.md").exists():
        return "chat"
    skills = list((root / "skills").glob("*/SKILL.md")) if (root / "skills").exists() else []
    if (root / "plugin.json").exists() and skills:
        return "plugin"
    if (root / "AGENTS.md").exists():
        return "opencode"
    if (root / "instructions.md").exists():
        return "claude-or-canonical"
    raise ValueError("Kunde inte hitta en stödd GPT-instruktion i paketet")


def import_root(root: Path, out: Path) -> dict:
    runtime = detect(root)
    name = root.name
    description = "Importerad GPT"
    instructions = ""
    knowledge_src = None

    if runtime == "chat":
        instructions = (root / "assistant" / "instructions.md").read_text(encoding="utf-8")
        knowledge_src = root / "knowledge"
        start = root / "START-HERE.md"
        readme_name, readme_description = read_readme_metadata(start)
        name = readme_name or name
        description = readme_description or description

    elif runtime == "plugin":
        plugin = json.loads((root / "plugin.json").read_text(encoding="utf-8"))
        name = plugin.get("name") or name
        description = plugin.get("description") or description
        readme = root / "README.md"
        readme_name, _ = read_readme_metadata(readme)
        name = readme_name or name
        skill_file = sorted((root / "skills").glob("*/SKILL.md"))[0]
        meta, instructions = strip_skill_frontmatter(skill_file.read_text(encoding="utf-8"))
        description = meta.get("description") or description
        knowledge_src = skill_file.parent / "references"

    elif runtime == "opencode":
        instructions = strip_runtime_adapter((root / "AGENTS.md").read_text(encoding="utf-8"))
        knowledge_src = root / "knowledge"
        readme = root / "README.md"
        readme_name, readme_description = read_readme_metadata(readme, " – OpenCode")
        name = readme_name or name
        description = readme_description or description

    else:
        instructions = (root / "instructions.md").read_text(encoding="utf-8").strip() + "\n"
        knowledge_src = root / "knowledge"
        readme = root / "README.md"
        readme_name, readme_description = read_readme_metadata(readme, " – Claude")
        name = readme_name or name
        description = readme_description or description

    out.mkdir(parents=True, exist_ok=True)
    (out / "knowledge").mkdir(exist_ok=True)
    copied = copy_tree_if_exists(knowledge_src, out / "knowledge") if knowledge_src else []
    (out / "instructions.md").write_text(instructions.strip() + "\n", encoding="utf-8")
    gid = slugify(name)
    (out / "gpt.yaml").write_text(
        "schema_version: 1\n\n"
        "gpt:\n"
        f"  id: {json.dumps(gid, ensure_ascii=False)}\n"
        f"  name: {json.dumps(name, ensure_ascii=False)}\n"
        f"  description: {json.dumps(description, ensure_ascii=False)}\n",
        encoding="utf-8",
    )
    report = {
        "detected_runtime": runtime,
        "name": name,
        "description": description,
        "knowledge_files": copied,
        "notes": [
            "Instruktionen har extraherats utan avsiktlig innehållsförbättring.",
            "Granska instructions.md innan nya distributioner byggs.",
        ],
    }
    (out / "IMPORT-REPORT.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description="Normalisera en befintlig GPT-distribution till canonical projektformat.")
    ap.add_argument("source", type=Path)
    ap.add_argument("output", type=Path)
    args = ap.parse_args()

    source = args.source.resolve()
    output = args.output.resolve()
    if output.exists():
        shutil.rmtree(output)

    if source.is_dir():
        report = import_root(source, output)
    elif source.suffix.lower() == ".zip":
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with zipfile.ZipFile(source) as zf:
                for member in zf.infolist():
                    target = (root / member.filename).resolve()
                    if root.resolve() not in target.parents and target != root.resolve():
                        raise ValueError(f"Osäker ZIP-sökväg: {member.filename}")
                zf.extractall(root)
            # tolerate one wrapping directory
            entries = [p for p in root.iterdir() if p.name != "__MACOSX"]
            candidate = entries[0] if len(entries) == 1 and entries[0].is_dir() else root
            report = import_root(candidate, output)
    else:
        raise ValueError("Source måste vara en katalog eller ZIP-fil")

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
