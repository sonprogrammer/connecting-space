#!/usr/bin/env python3
"""Reproduce the eight contract checks for the frontend PR QA skill."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
skill = (ROOT / "SKILL.md").read_text()
reference = (ROOT / "references" / "frontend-pr-qa-reference.md").read_text()

checks = {
    "browser fallback": "do not BLOCK or HOLD solely" in skill and "수동 확인" in skill,
    "head invalidation": "If HEAD changes, discard" in skill and "invalidates the prior verdict" in reference,
    "node retry": "Node 20.9+" in skill and "20.8" in reference,
    "major duplicate mutation": "duplicate mutation" in skill and "MAJOR" in reference,
    "independent evidence": "independently run" in skill and "Developer-reported" in reference,
    "no credentials": "Never request an admin password/account" in reference,
    "comment contract": "검증 HEAD" in reference and "Planner 권고" in reference,
    "no merge": "Never merge" in skill,
}

for name, passed in checks.items():
    print(f"{'PASS' if passed else 'FAIL'} {name}")
if not all(checks.values()):
    raise SystemExit(1)
print(f"{len(checks)}/{len(checks)} PASS")
