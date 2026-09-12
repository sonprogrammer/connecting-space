#!/usr/bin/env python3
"""Validate the project-specific frontend-imweb skill contract."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SKILL_PATH = ROOT / "SKILL.md"
REFERENCE_PATH = ROOT / "references" / "frontend-development-reference.md"
PRESSURE_PATH = ROOT / "references" / "pressure-test-results.md"

def read(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.is_file() else ""

skill = read(SKILL_PATH)
reference = read(REFERENCE_PATH)
pressure = read(PRESSURE_PATH)

checks = {
    "valid frontmatter and identity": bool(re.match(r"\A---\nname: frontend-imweb\n", skill)) and "description: Use when" in skill,
    "reference links resolve": "references/frontend-development-reference.md" in skill and REFERENCE_PATH.is_file() and PRESSURE_PATH.is_file(),
    "frontend boundary": "프론트엔드 UI" in skill and "백엔드" in skill and "원격 DB" in skill,
    "tdd cycle": all(term in skill for term in ("RED", "GREEN", "REFACTOR")),
    "next documentation gate": "node_modules/next/dist/docs" in skill,
    "api contract boundary": "API 계약" in skill and "필드·상태·endpoint" in skill,
    "ui state contract": all(term in skill for term in ("로딩", "401/403", "입력 보존", "query key", "중복 클릭")),
    "quality and security": all(term in skill for term in ("360px", "키보드", "aria", "NEXT_PUBLIC_", "service role")),
    "verification gates": all(cmd in skill for cmd in ("npm test", "npm run lint", "npm run type-check", "npm run build -- --webpack", "git diff --check")),
    "qa handoff": "reviewing-frontend-pull-requests" in skill and "Closes #<issue>" in skill and "최신 HEAD" in skill,
    "no merge deploy or remote db": all(term in skill for term in ("PR 머지", "배포", "remote DB")),
    "reference has required records": all(term in reference for term in ("RED", "GREEN", "REFACTOR", "계약 검사")),
    "pressure scenarios recorded": all(f"| {number} |" in pressure for number in range(1, 9)),
    "pressure green results": pressure.count("GREEN result: PASS") >= 3,
    "no unfinished scaffold": not re.search(r"\b(TODO|TBD|FIXME)\b", skill + reference + pressure),
}

for name, passed in checks.items():
    print(f"{'PASS' if passed else 'FAIL'} {name}")
passed_count = sum(checks.values())
print(f"{passed_count}/{len(checks)} PASS")
if passed_count != len(checks):
    raise SystemExit(1)
