from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    required = [
        ROOT / ".github/workflows/ci.yml",
        ROOT / ".github/workflows/release.yml",
        ROOT / ".gitignore",
        ROOT / "scripts/validate_distributions.py",
        ROOT / "scripts/project_hygiene.py",
    ]
    for path in required:
        assert path.exists(), path
    assert not (ROOT / "dist").exists(), "dist must not be committed in source tree"
    release = (ROOT / ".github/workflows/release.yml").read_text(encoding="utf-8")
    assert "github.event.release.tag_name" in release
    assert "dist/*.zip" in release
    print("PASS: GitHub/release source contract")


if __name__ == "__main__":
    main()
