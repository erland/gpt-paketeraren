#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

RUNTIMES = ("chat", "plugin", "claude", "opencode")


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def validate_zip(path: Path, required: list[str], forbidden_parts: set[str], errors: list[str]) -> None:
    if not path.exists():
        fail(errors, f"Missing artifact: {path.name}")
        return
    try:
        with zipfile.ZipFile(path) as zf:
            names = zf.namelist()
            if zf.testzip() is not None:
                fail(errors, f"Corrupt zip: {path.name}")
            for req in required:
                if req not in names:
                    fail(errors, f"{path.name}: missing {req}")
            for name in names:
                parts = set(Path(name).parts)
                if parts & forbidden_parts:
                    fail(errors, f"{path.name}: forbidden generated/development path {name}")
    except zipfile.BadZipFile:
        fail(errors, f"Invalid zip: {path.name}")


def decode_frontmatter_scalar(value: str) -> str:
    value = value.strip()
    if value.startswith('"'):
        try:
            return json.loads(value)
        except Exception:
            return value.strip('"')
    return value.strip("'")
    

def parse_skill_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---\n", 4)
    if end < 0:
        return {}, text
    meta = {}
    for line in text[4:end].splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        meta[key.strip()] = decode_frontmatter_scalar(value)
    body = text[end + 5 :]
    if body.startswith("\n"):
        body = body[1:]
    return meta, body


def validate_plugin(path: Path, project_root: Path, errors: list[str]) -> None:
    if not path.exists():
        fail(errors, f"Missing artifact: {path.name}")
        return
    try:
        with zipfile.ZipFile(path) as zf:
            names = set(zf.namelist())
            for req in ("plugin.json", "README.md", "VERSION", "runtime-contract.json"):
                if req not in names:
                    fail(errors, f"{path.name}: missing {req}")
            if zf.testzip() is not None:
                fail(errors, f"Corrupt zip: {path.name}")
                return

            plugin = json.loads(zf.read("plugin.json").decode("utf-8"))
            for key in ("name", "version", "description"):
                if not str(plugin.get(key, "")).strip():
                    fail(errors, f"{path.name}: plugin.json missing {key}")
            plugin_id = str(plugin.get("name", "")).strip()
            skill_path = f"skills/{plugin_id}/SKILL.md"
            if skill_path not in names:
                fail(errors, f"{path.name}: missing {skill_path}")
                return

            contract = json.loads(zf.read("runtime-contract.json").decode("utf-8"))
            if contract.get("runtime_id") != "openai_plugin":
                fail(errors, f"{path.name}: runtime_id must be openai_plugin")
            adapter = contract.get("adapter", {})
            if adapter.get("skills_first") is not True:
                fail(errors, f"{path.name}: runtime contract must be skills-first")
            if adapter.get("skills") != [plugin_id]:
                fail(errors, f"{path.name}: runtime contract skills mismatch")
            if adapter.get("mcp_generated") is not False:
                fail(errors, f"{path.name}: packager must not generate MCP")
            scripts = adapter.get("script_resources", {})
            if scripts.get("packaged") != []:
                fail(errors, f"{path.name}: packager must not add script resources")
            if scripts.get("mcp_required_for_resource_use") is not False:
                fail(errors, f"{path.name}: script resource MCP semantics mismatch")

            skill_text = zf.read(skill_path).decode("utf-8")
            meta, body = parse_skill_frontmatter(skill_text)
            if meta.get("name") != plugin_id:
                fail(errors, f"{path.name}: SKILL.md name mismatch")
            if meta.get("description") != plugin.get("description"):
                fail(errors, f"{path.name}: SKILL.md description mismatch")

            canonical = (project_root / "packager" / "instructions.md").read_text(encoding="utf-8").strip() + "\n"
            marker = "<!-- GPT-PACKAGER:RUNTIME-ADAPTER:BEGIN -->"
            projected = body.split(marker, 1)[0].rstrip() + "\n"
            if projected != canonical:
                fail(errors, f"{path.name}: canonical instruction changed in SKILL.md")

            expected_refs = set()
            knowledge = project_root / "packager" / "knowledge"
            if knowledge.exists():
                for item in knowledge.rglob("*"):
                    if item.is_file():
                        expected_refs.add(f"skills/{plugin_id}/references/{item.relative_to(knowledge).as_posix()}")
            actual_refs = {n for n in names if n.startswith(f"skills/{plugin_id}/references/") and not n.endswith("/")}
            if actual_refs != expected_refs:
                fail(errors, f"{path.name}: Knowledge/reference projection mismatch")

            forbidden_prefixes = (
                f"skills/{plugin_id}/scripts/",
                "tools/",
                "mcp/",
            )
            for name in names:
                if name.startswith(forbidden_prefixes):
                    fail(errors, f"{path.name}: unexpected tool/script resource {name}")
    except (zipfile.BadZipFile, KeyError, json.JSONDecodeError) as exc:
        fail(errors, f"Invalid Plugin distribution {path.name}: {exc}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project-root", type=Path, default=Path("."))
    ap.add_argument("--dist", type=Path, default=Path("dist"))
    ap.add_argument("--version", default=None)
    args = ap.parse_args()
    root = args.project_root.resolve()
    dist = (root / args.dist).resolve() if not args.dist.is_absolute() else args.dist.resolve()
    errors: list[str] = []

    manifest_path = dist / "DELIVERY-MANIFEST.json"
    checksums_path = dist / "SHA256SUMS.txt"
    if not manifest_path.exists():
        fail(errors, "Missing DELIVERY-MANIFEST.json")
    if not checksums_path.exists():
        fail(errors, "Missing SHA256SUMS.txt")

    version = args.version
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            version = version or manifest.get("version")
            for item in manifest.get("artifacts", []):
                p = dist / item["file"]
                if not p.exists():
                    fail(errors, f"Manifest artifact missing: {p.name}")
                elif hashlib.sha256(p.read_bytes()).hexdigest() != item.get("sha256"):
                    fail(errors, f"Checksum mismatch: {p.name}")
        except Exception as exc:
            fail(errors, f"Invalid delivery manifest: {exc}")

    if not version:
        fail(errors, "Could not determine version")
    else:
        gid = "gpt-paketeraren"
        validate_zip(dist / f"{gid}-chat-{version}.zip", ["START-HERE.md", "assistant/instructions.md", "VERSION"], {"tests", "scripts", "dist", "__pycache__"}, errors)
        validate_plugin(dist / f"{gid}-plugin-{version}.zip", root, errors)
        validate_zip(dist / f"{gid}-claude-{version}.zip", ["README.md", "instructions.md", "VERSION"], {"tests", "scripts", "dist", "__pycache__"}, errors)
        validate_zip(dist / f"{gid}-opencode-{version}.zip", ["README.md", "AGENTS.md", "VERSION"], {"tests", "scripts", "dist", "__pycache__"}, errors)
        project_zip = dist / f"gpt-paketeraren-{version}.zip"
        if not project_zip.exists():
            fail(errors, f"Missing project zip: {project_zip.name}")
        else:
            with zipfile.ZipFile(project_zip) as zf:
                for name in zf.namelist():
                    parts = Path(name).parts
                    if any(p in {"dist", "build", "__pycache__", ".pytest_cache", ".git"} for p in parts):
                        fail(errors, f"Project zip contains generated/temporary path: {name}")
                required_suffixes = [
                    ".github/workflows/ci.yml",
                    ".github/workflows/release.yml",
                    "scripts/build_distributions.py",
                    "scripts/validate_distributions.py",
                    "packager/instructions.md",
                    ".gitignore",
                ]
                for suffix in required_suffixes:
                    if not any(name.endswith(suffix) for name in zf.namelist()):
                        fail(errors, f"Project zip missing {suffix}")

    if errors:
        print("BLOCKED")
        for e in errors:
            print(f"- {e}")
        raise SystemExit(1)
    print("PASS: release artifacts and project hygiene validated")


if __name__ == "__main__":
    main()
