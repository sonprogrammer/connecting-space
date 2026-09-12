#!/usr/bin/env python3
"""Validate mechanical invariants of the managing-imweb-delivery skill."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SKILL_PATH = ROOT / "SKILL.md"
REFERENCE_PATH = ROOT / "references" / "planner-workflow-reference.md"
PRESSURE_PATH = ROOT / "references" / "pressure-test-results.md"

skill = SKILL_PATH.read_text(encoding="utf-8")
reference = REFERENCE_PATH.read_text(encoding="utf-8")
pressure = PRESSURE_PATH.read_text(encoding="utf-8")

frontmatter = re.match(r"\A---\n(.*?)\n---\n", skill, re.DOTALL)
checks = {
    "valid frontmatter": bool(frontmatter)
    and "name: managing-imweb-delivery" in frontmatter.group(1)
    and "description: Use when" in frontmatter.group(1),
    "reference links resolve": "(references/planner-workflow-reference.md)" in skill
    and REFERENCE_PATH.is_file()
    and PRESSURE_PATH.is_file(),
    "exact head gate": "exact current full HEAD SHA" in skill
    and "New HEAD invalidates QA PASS" in pressure,
    "skipped db blocks merge": "cannot PASS: do not merge" in skill
    and "DB change, local DB suite skipped" in reference,
    "remote is not a test substitute": "never substitute linked-remote dry-run" in skill
    and "no linked-remote command is proposed" in pressure,
    "no duplicate full qa": "Do not rerun QA's complete suite" in skill
    and "Do not convert Planner work into a second full QA pass" in reference,
    "planner is not qa": "Do not implement feature code or impersonate QA" in skill
    and "while QA owns independent validation" in pressure,
    "merge authorization bounded": "Merge authorization does not authorize deployment" in skill
    and "grants merge authority only" in reference,
    "issue closure checked": "linked issue closed" in skill
    and "If auto-close syntax was missing" in reference,
    "single next action": "one next action" in skill
    and "Assign exactly one next" in reference,
    "pressure baseline recorded": pressure.count("Actual response:") >= 3
    and "RED failure pattern" in pressure,
    "green pressure tests passed": pressure.count("GREEN result: PASS") == 3
    and "GREEN summary: 3/3" in pressure,
    "no unfinished scaffold": not re.search(r"\b(TODO|TBD|FIXME)\b", skill + reference + pressure),
}

for name, passed in checks.items():
    print(f"{'PASS' if passed else 'FAIL'} {name}")

passed_count = sum(checks.values())
print(f"{passed_count}/{len(checks)} PASS")
if passed_count != len(checks):
    raise SystemExit(1)
