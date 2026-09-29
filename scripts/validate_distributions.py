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
        validate_zip(dist / f"{gid}-plugin-{version}.zip", ["plugin.json", "README.md", "VERSION"], {"tests", "scripts", "dist", "__pycache__"}, errors)
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
