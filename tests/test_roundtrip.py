#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "scripts" / "build_distributions.py"
IMPORT = ROOT / "scripts" / "import_existing.py"

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def run(*args: str) -> None:
    subprocess.run(args, check=True, cwd=ROOT, stdout=subprocess.DEVNULL)

def main() -> None:
    with tempfile.TemporaryDirectory() as td:
        t = Path(td)
        project = t / "project"
        (project / "knowledge" / "sub").mkdir(parents=True)
        description = 'Testar paketering: "citat" + Knowledge utan omskrivning.'
        (project / "gpt.yaml").write_text(
            'schema_version: 1\n\ngpt:\n'
            + '  id: "test-gpt"\n'
            + '  name: "Test GPT: ÅÄÖ"\n'
            + f'  description: {json.dumps(description, ensure_ascii=False)}\n',
            encoding="utf-8")
        original = "# Roll\n\nGör exakt det användaren ber om.\n\n## Knowledge\n\nBehåll detta.\n\n## OpenCode runtime\n\nBehåll även detta.\n"
        (project / "instructions.md").write_text(original, encoding="utf-8")
        (project / "knowledge" / "a.md").write_text("Alpha\n", encoding="utf-8")
        (project / "knowledge" / "sub" / "b.txt").write_text("Beta\n", encoding="utf-8")
        d1, d2 = t / "dist1", t / "dist2"
        run("python3", str(BUILD), str(project), "--output", str(d1), "--version", "0.0.0-test")
        run("python3", str(BUILD), str(project), "--output", str(d2), "--version", "0.0.0-test")
        for runtime in ("chat", "plugin", "claude", "opencode"):
            z1, z2 = d1 / f"test-gpt-{runtime}-0.0.0-test.zip", d2 / f"test-gpt-{runtime}-0.0.0-test.zip"
            assert sha(z1) == sha(z2), f"non-deterministic {runtime}"
            imported = t / f"import-{runtime}"
            run("python3", str(IMPORT), str(z1), str(imported))
            assert (imported / "instructions.md").read_text(encoding="utf-8") == original
            y = (imported / "gpt.yaml").read_text(encoding="utf-8")
            assert 'name: "Test GPT: ÅÄÖ"' in y
            assert f"description: {json.dumps(description, ensure_ascii=False)}" in y
            assert (imported / "knowledge" / "a.md").read_text() == "Alpha\n"
            assert (imported / "knowledge" / "sub" / "b.txt").read_text() == "Beta\n"
    print("PASS: chat, plugin, claude, opencode round-trip + deterministic build")

if __name__ == "__main__":
    main()
