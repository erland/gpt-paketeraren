#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import zipfile
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "scripts" / "build_distributions.py"
IMPORT = ROOT / "scripts" / "import_existing.py"

RUNTIMES = ("chat", "plugin", "claude", "opencode")
NAME = "Test GPT: ÅÄÖ"
DESCRIPTION = 'Testar kompatibilitet: "Python + PWA".'
INSTRUCTIONS = "# Roll\n\nBehåll exakt.\n\n## Knowledge\n\nAnvänd bifogat material.\n"
KNOWLEDGE = {
    "a.md": "Alpha\n",
    "sub/b.txt": "Beta\n",
}


def run(*args: str) -> None:
    subprocess.run(args, check=True, cwd=ROOT)


def write_project(project: Path) -> None:
    (project / "knowledge" / "sub").mkdir(parents=True)
    (project / "gpt.yaml").write_text(
        'schema_version: 1\n\ngpt:\n'
        '  id: "test-gpt-aao"\n'
        f'  name: "{NAME}"\n'
        f'  description: {json.dumps(DESCRIPTION, ensure_ascii=False)}\n',
        encoding="utf-8",
    )
    (project / "instructions.md").write_text(INSTRUCTIONS, encoding="utf-8")
    for relative, content in KNOWLEDGE.items():
        path = project / "knowledge" / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")


def prepare(workdir: Path) -> None:
    if workdir.exists():
        shutil.rmtree(workdir)
    python_dir = workdir / "python"
    web_dir = workdir / "web"
    python_dir.mkdir(parents=True)
    web_dir.mkdir(parents=True)

    with tempfile.TemporaryDirectory() as td:
        project = Path(td) / "project"
        write_project(project)
        run(
            "python3",
            str(BUILD),
            str(project),
            "--output",
            str(python_dir),
            "--version",
            "0.0.0-compat",
            "--targets",
            ",".join(RUNTIMES),
        )

    print(f"Prepared Python compatibility fixtures in {python_dir}")


def verify(workdir: Path) -> None:
    web_dir = workdir / "web"
    missing = [runtime for runtime in RUNTIMES if not (web_dir / f"{runtime}.zip").exists()]
    assert not missing, f"Missing PWA compatibility artifacts: {', '.join(missing)}"

    with tempfile.TemporaryDirectory() as td:
        temp = Path(td)
        for runtime in RUNTIMES:
            imported = temp / runtime
            run("python3", str(IMPORT), str(web_dir / f"{runtime}.zip"), str(imported))

            assert (imported / "instructions.md").read_text(encoding="utf-8") == INSTRUCTIONS
            config = (imported / "gpt.yaml").read_text(encoding="utf-8")
            assert f'name: "{NAME}"' in config
            assert f"description: {json.dumps(DESCRIPTION, ensure_ascii=False)}" in config
            for relative, content in KNOWLEDGE.items():
                assert (imported / "knowledge" / relative).read_text(encoding="utf-8") == content

    python_plugin = workdir / "python" / "test-gpt-aao-plugin-0.0.0-compat.zip"
    web_plugin = workdir / "web" / "plugin.zip"
    with zipfile.ZipFile(python_plugin) as zf:
        python_contract = json.loads(zf.read("runtime-contract.json"))
    with zipfile.ZipFile(web_plugin) as zf:
        web_contract = json.loads(zf.read("runtime-contract.json"))
    assert python_contract == web_contract, "Python/PWA Plugin runtime-contract mismatch"

    print("PASS: PWA distributions import correctly in Python for chat, plugin, claude, opencode")


def main() -> None:
    parser = argparse.ArgumentParser(description="Cross-runtime compatibility fixture driver")
    parser.add_argument("command", choices=("prepare", "verify"))
    parser.add_argument("workdir", type=Path)
    args = parser.parse_args()

    workdir = args.workdir.resolve()
    if args.command == "prepare":
        prepare(workdir)
    else:
        verify(workdir)


if __name__ == "__main__":
    main()
