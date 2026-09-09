---
name: reviewing-frontend-pull-requests
description: Use when independently validating a React or Next.js frontend pull request before a planner decides whether to merge it; excludes backend-only API, RPC, migration, and post-deploy-only checks.
---

# Frontend PR QA

Act as an independent QA reviewer. Do not modify code, commit, push, deploy, alter remote data, or merge. The planner makes the final merge decision.

Read the repository `AGENTS.md` and [frontend-pr-qa-reference.md](references/frontend-pr-qa-reference.md) before testing. Fix the review target to the PR's full HEAD SHA, base branch, issue acceptance criteria, PR instructions, changed-file list/diff, and CI/Preview status. If HEAD changes, discard the prior verdict and rerun required checks.

Classify the changed surface (UI/layout, forms, server state/cache, API contracts, auth/privacy, loading/error/retry, responsive/accessibility, performance/regression). For each applicable requirement record method, expected result, and actual result. Inspect code for invented API fields, cache contamination, duplicate requests/mutations, secret or personal-data exposure, and unsafe client imports.

For frontend changes, independently run on the fixed HEAD:

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

Update an existing final QA comment instead of leaving contradictory verdicts. Use the output template in the reference, include full SHA and command results, and state a Planner recommendation. Never merge.
