#!/usr/bin/env python3
"""Validate the project-specific backend implementation skill contract."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
reference = (ROOT / "references" / "backend-development-reference.md").read_text(encoding="utf-8")

checks = {
    "frontmatter and identity": skill.startswith("---\nname: backend-imweb\n"),
    "frontend boundary": "Frontend UI는 구현하지 않는다" in skill,
    "remote migration boundary": "supabase db push --linked" in skill and "원격 SQL" in skill,
    "tdd cycle": all(term in skill for term in ("RED", "GREEN", "REFACTOR")),
    "auth first": "인증·권한을 body 파싱과 mutation보다 먼저" in skill,
    "local db host": "localhost" in skill and "127.0.0.1" in skill and "BLOCKED" in skill,
    "atomicity and idempotency": "transaction 또는 security-definer RPC" in skill and "동시성·rollback·멱등" in skill,
    "provider separation": "외부 전송과 핵심 저장을 분리" in skill,
    "verification gates": all(cmd in skill for cmd in ("npm test", "npm run lint", "npm run type-check", "npm run build -- --webpack", "git diff --check")),
    "qa handoff": "reviewing-backend-pull-requests" in skill and "Closes #<issue>" in skill,
    "reference resolves": "references/backend-development-reference.md" in skill,
    "red green refactor record": all(term in reference for term in ("RED", "GREEN", "REFACTOR")),
    "pressure scenarios recorded": all(f"| {number} |" in reference for number in range(1, 10)),
}

for name, passed in checks.items():
    print(f"{'PASS' if passed else 'FAIL'} {name}")
if not all(checks.values()):
    raise SystemExit(1)
print(f"{len(checks)}/{len(checks)} PASS")
