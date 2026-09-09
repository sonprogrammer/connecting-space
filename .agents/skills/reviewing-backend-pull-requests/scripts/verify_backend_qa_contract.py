#!/usr/bin/env python3
"""Reproduce the backend QA skill's non-negotiable contract checks."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
skill = (ROOT / "SKILL.md").read_text()
reference = (ROOT / "references" / "backend-pr-qa-reference.md").read_text()

checks = {
    "latest head invalidates verdict": "If HEAD changes, discard" in skill and "new HEAD or migration invalidates" in reference,
    "local db required": "isolated local Supabase" in skill and "verdict is `BLOCKED`" in reference,
    "remote migration forbidden": "Never run `supabase db push`" in skill and "migration repair" in reference,
    "provider boundary": "Missing provider credentials do not block" in reference,
    "concurrency integrity": "duplicate/concurrent requests" in skill and "concurrent atomicity/idempotency" in reference,
    "migration scope stop": "migration repair" in reference and "not repaired or applied" in reference,
    "redaction": "Never put tokens" in skill and "Redact PII" in reference,
    "automated commands": "npm test" in skill and "git diff --check" in skill,
    "comment contract": "원격 DB 변경: 하지 않음" in reference and "Planner 권고" in reference,
    "no merge": "or merge" in skill,
}

for name, passed in checks.items():
    print(f"{'PASS' if passed else 'FAIL'} {name}")
if not all(checks.values()):
    raise SystemExit(1)
print(f"{len(checks)}/{len(checks)} PASS")
