#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN_DIRS = {"dist", "build", "__pycache__", ".pytest_cache"}
FORBIDDEN_FILES = {".DS_Store"}
errors = []
for p in ROOT.rglob("*"):
    if any(part in FORBIDDEN_DIRS for part in p.relative_to(ROOT).parts):
        errors.append(str(p.relative_to(ROOT)))
    if p.is_file() and p.name in FORBIDDEN_FILES:
        errors.append(str(p.relative_to(ROOT)))
if errors:
    print("BLOCKED: generated/temporary files are present in source tree")
    for item in sorted(set(errors)):
        print(f"- {item}")
    sys.exit(1)
print("PASS: source tree hygiene")
