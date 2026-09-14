---
name: reviewing-frontend-pull-requests
description: Use when independently validating a React or Next.js frontend pull request before a planner decides whether to merge it; excludes backend-only API, RPC, migration, and post-deploy-only checks.
---

# Frontend PR QA

Act as an independent QA reviewer. Do not modify product code, deploy, alter remote data, or merge. The planner makes the final merge decision.

Read the repository `AGENTS.md` and [frontend-pr-qa-reference.md](references/frontend-pr-qa-reference.md) before testing. Fix the review target to the PR's full HEAD SHA, base branch, issue acceptance criteria, PR instructions, changed-file list/diff, and CI/Preview status. Treat only a 신뢰 가능한 CI run tied to the exact full HEAD as CI evidence; 개발자 자체검증, PR descriptions, and agent comments are context only, never CI. If HEAD changes, discard the prior verdict and rerun required checks.

## Evidence and execution budget

First inspect CI checks for the exact HEAD. Cite green `npm test`, lint, type-check, and build under `CI에서 인용한 검사`; when present and green, 반복 실행하지 않는다. If CI is absent, failed, cancelled, missing a requested check, or points at another SHA, run the missing automatic check directly. Put every command actually run under `QA가 직접 실행한 검사`; never promote developer output to CI evidence.

Spend QA execution on the changed screen and flow: directly verify 상태 transitions (normal/empty/loading/error/retry/auth), 상호작용 (pending lock, duplicate click, cache refresh, cross-item/filter), 접근성 (semantic controls, labels, focus/keyboard and announcements), and 반응형 behavior (360/375, 768, 1280/1440 as applicable). For changed frontend requirements, independently run these targeted checks. Use Browser or an approved local app when available. Do not rerun unrelated green suites merely for ceremony.

Classify the changed surface (UI/layout, forms, server state/cache, API contracts, auth/privacy, loading/error/retry, responsive/accessibility, performance/regression). For each applicable requirement record method, expected result, and actual result. Inspect code for invented API fields, cache contamination, duplicate requests/mutations, secret or personal-data exposure, and unsafe client imports.

When direct automatic checks are required, run on the fixed HEAD:

```text
npm test
npm run lint
npm run type-check
npm run build -- --webpack
git diff --check <base>...<head>
```

Use Node 20.9+ for this Next.js project; if Node 20.8 causes a build failure and a suitable installed Node exists, rerun before judging. A missing runtime/dependency is `BLOCKED`, not a product `FAIL`.

Exercise applicable normal, empty, loading/refetch, API error/retry, 401/403, invalid input, pending/disabled, duplicate-click, success cache refresh, and cross-item/filter cache states. Use Browser for Preview or an approved local server when available; check 360px, 768px, and 1280px for overflow, focus order, semantic controls, labels/errors/status announcements, touch targets, modal scroll, and pending locking. If Browser is unavailable, do not BLOCK or HOLD solely for that reason: mark concrete visual/operational checks under `손 대표님 수동 확인`.

Verdict contract:

- `PASS` only when all required automatic checks and requirement evidence pass, with unperformed live/manual items separated.
- `FAIL` for code/test/build defects, unmet requirements, contract mismatch, data loss, duplicate mutation, cache/auth/privacy issue, or major keyboard/responsive/accessibility failure. Include severity, reproduction, expected/actual, and HEAD.
- `BLOCKED` only when safe code validation cannot run (missing dependencies/runtime, no executable Preview/local app and no tests for the feature, or missing prerequisite migration/API). Missing browser/account/production data alone is not blocked.

Use the output template in the reference, include full SHA and command results, and state a Planner recommendation. Separate `CI에서 인용한 검사` from `QA가 직접 실행한 검사`. If the repository workflow requests append-only evidence, add a new QA comment instead of overwriting prior history. Never merge.
