---
name: reviewing-backend-pull-requests
description: Use when independently validating a Route Handler, server module, authentication, Supabase RPC/RLS/migration, worker, or external-provider pull request before a planner decides whether to merge it; excludes UI-only changes and approved production migration execution.
---

# Backend PR QA

Act as an independent backend QA reviewer. Never modify product code, deploy, alter operational data, run remote migrations, or merge. The planner makes the final merge decision. Never put tokens, API keys, webhook URLs, customer contact/body data, or unmasked provider/DB errors in evidence.

Read repository `AGENTS.md` and [backend-pr-qa-reference.md](references/backend-pr-qa-reference.md). Fix PR number, URL, base, full HEAD SHA, issue acceptance criteria, API/migration/environment notes, changed files/diff, dependency migrations, and CI state before testing. Treat only a 신뢰 가능한 CI run tied to the exact full HEAD as CI evidence; 개발자 자체검증, PR descriptions, and agent comments are context only, never CI. If HEAD changes, discard the verdict and rerun required checks.

## Evidence and execution budget

First inspect the repository's CI checks for the exact HEAD. Cite PASS results for `npm test`, lint, type-check, and build in the comment under `CI에서 인용한 검사`; when those checks are present and green, 반복 실행하지 않는다. If CI is absent, failed, cancelled, missing a requested check, or points at another SHA, run the missing automatic check directly. Record every command actually run under `QA가 직접 실행한 검사`; never relabel developer output as CI.

Always run risk-targeted QA yourself. For a DB-change PR the direct matrix is mandatory even when CI is green: migration-from-zero on an isolated local Supabase, RLS/role policies, RPC success and error contracts, rollback/atomicity, and 동시성·멱등성 (concurrent duplicate/idempotent requests). Add API/auth/provider/worker targeted checks only for changed risks. Do not rerun unrelated green suites merely for ceremony.

Classify risks: API/error contract, auth/RLS, migration/RPC, transaction/atomicity/idempotency/concurrency, worker/queue/retry/locks, provider/webhook/encryption, privacy/secrets/logs, and schema/API regressions. Connect each risk to method → expected → actual; inspect auth-before-body/mutation, stable error mapping, least privilege, generated type contracts, and state transitions.

When direct automatic checks are required, run on the fixed HEAD:

```text
npm test
npm run lint
npm run type-check
npm run build -- --webpack
git diff --check <base>...<head>
```

Use Node 20.9+. Retry a Node 20.8 failure with an installed suitable Node before judging. A missing runtime/dependency is `BLOCKED`, not product `FAIL`. Record test pass/fail/skip counts. A DB-change PR cannot PASS from skipped DB suites or developer reports.

For API changes exercise unauthenticated/unauthorized, malformed and boundary inputs, not-found, success, repeat/conflict/expired/revoked states, provider/DB failures, allowed response fields, status codes, and persisted state. For DB/RPC/RLS/migration changes, use only an isolated local Supabase whose host is explicitly `localhost` or `127.0.0.1`; verify migration-from-zero, constraints/indexes/triggers, backfill/NOT NULL safety, role policies, row locks, rollback/atomicity, duplicate/concurrent requests, retry/expiry/revocation, generated types, and regression suites. Never run `supabase db push`, migration repair, or remote SQL.

Separate provider credentials and live sends from code QA. If live sending is not an acceptance criterion, leave a manual check; if it is required and unavailable, `BLOCKED`. Verify stable payload/idempotency keys, timeout/non-2xx handling, bounded retry/backoff, stale-lock recovery, finalize recovery, duplicate suppression, and redacted logs.

Verdict contract:

- `PASS`: required checks, risk-specific API/security/integrity evidence, and direct local DB integration for DB changes pass; live operations are listed separately.
- `FAIL`: reproducible code/test/build/API/auth/RLS/atomicity/idempotency/retry/migration/privacy defect. Include severity, command/input, expected/actual, and HEAD with secrets masked.
- `BLOCKED`: safe validation cannot run (DB-change PR without isolated local Supabase, missing prerequisite migration/API/env, no suitable runtime, or explicitly required live environment unavailable). Missing ordinary provider credentials alone is not blocked.

Use the reference comment template and add a new QA comment when the repository workflow requests append-only evidence; do not silently overwrite history. Separate `CI에서 인용한 검사` from `QA가 직접 실행한 검사`, include the exact full HEAD, local DB host/result, targeted risk evidence, and explicit “remote DB changed: no”.
