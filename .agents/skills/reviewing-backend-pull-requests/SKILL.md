---
name: reviewing-backend-pull-requests
description: Use when independently validating a Route Handler, server module, authentication, Supabase RPC/RLS/migration, worker, or external-provider pull request before a planner decides whether to merge it; excludes UI-only changes and approved production migration execution.
---

# Backend PR QA

Act as an independent backend QA reviewer. Never modify code, commit, push, deploy, alter operational data, run remote migrations, or merge. The planner makes the final merge decision. Never put tokens, API keys, webhook URLs, customer contact/body data, or unmasked provider/DB errors in evidence.

Read repository `AGENTS.md` and [backend-pr-qa-reference.md](references/backend-pr-qa-reference.md). Fix PR number, URL, base, full HEAD SHA, issue acceptance criteria, API/migration/environment notes, changed files/diff, dependency migrations, and CI state before testing. Developer-reported results are context only. If HEAD changes, discard the verdict and rerun required checks.

Classify risks: API/error contract, auth/RLS, migration/RPC, transaction/atomicity/idempotency/concurrency, worker/queue/retry/locks, provider/webhook/encryption, privacy/secrets/logs, and schema/API regressions. Connect each risk to method → expected → actual; inspect auth-before-body/mutation, stable error mapping, least privilege, generated type contracts, and state transitions.

On the fixed HEAD run:

```text
npm test
npm run lint
npm run type-check
npm run build -- --webpack
git diff --check <base>...<head>
```

Use Node 20.9+. Retry a Node 20.8 failure with an installed suitable Node before judging. A missing runtime/dependency is `BLOCKED`, not product `FAIL`. Record test pass/fail/skip counts. A DB-change PR cannot PASS from skipped DB suites or developer reports.

For API changes exercise unauthenticated/unauthorized, malformed and boundary inputs, not-found, success, repeat/conflict/expired/revoked states, provider/DB failures, allowed response fields, status codes, and persisted state. For DB/RPC/RLS/migration changes, use only an isolated local Supabase whose host is explicitly `localhost` or `127.0.0.1`; verify migration-from-zero, constraints/indexes/triggers, backfill/NOT NULL safety, role policies, row locks, atomic rollback, duplicate/concurrent requests, retry/expiry/revocation, generated types, and regression suites. Never run `supabase db push`, migration repair, or remote SQL.

Separate provider credentials and live sends from code QA. If live sending is not an acceptance criterion, leave a manual check; if it is required and unavailable, `BLOCKED`. Verify stable payload/idempotency keys, timeout/non-2xx handling, bounded retry/backoff, stale-lock recovery, finalize recovery, duplicate suppression, and redacted logs.

Verdict contract:

- `PASS`: required checks, risk-specific API/security/integrity evidence, and direct local DB integration for DB changes pass; live operations are listed separately.
- `FAIL`: reproducible code/test/build/API/auth/RLS/atomicity/idempotency/retry/migration/privacy defect. Include severity, command/input, expected/actual, and HEAD with secrets masked.
- `BLOCKED`: safe validation cannot run (DB-change PR without isolated local Supabase, missing prerequisite migration/API/env, no suitable runtime, or explicitly required live environment unavailable). Missing ordinary provider credentials alone is not blocked.

Use the reference comment template and update an existing final comment rather than leaving contradictory verdicts. Include local DB host/result and explicit “remote DB changed: no”.
