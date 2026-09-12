# Planner Workflow Reference

Read this reference for issue decomposition, PR decisions, merge execution, and post-merge handoff in `connecting-space`.

## Issue design contract

Every implementation issue states:

- goal and user-observable flow
- in scope and explicitly out of scope
- dependencies and ordering
- API/data/status/error contracts when applicable
- acceptance criteria that QA can reproduce
- role owner and PR expectation
- remote DB, deployment, secrets, and live-provider boundaries

Use separate issues when Backend, Frontend, and operations have independently reviewable outcomes. Link them through a parent issue or dependency list. A practical order is:

1. Backend data/API contract and local verification
2. Frontend integration against the merged contract
3. QA on each exact PR HEAD
4. Planner merge decision
5. Approved migration, deployment, environment configuration, and live smoke checks

Do not put secret values, approval tokens, webhook URLs, or real customer data in issues or comments.

## Copyable role command

```text
이슈 #<number>의 <goal>을 진행해.
범위: <role-owned surface>.
제외: <other role/production mutation>.
<required invariant and tests>를 확인하고 feature branch에서 별도 PR을 올려.
원격 DB·배포·머지는 하지 말고, PR에 실행 명령과 실제 결과를 남겨.
```

For QA:

```text
PR #<number>의 최신 full HEAD를 <reviewing-...> 스킬로 독립 검증해.
이슈 완료 조건과 변경 위험을 직접 확인하고 PR에 PASS/FAIL/BLOCKED와 명령·수치·제한 사항을 남겨. 코드·원격 DB·머지는 변경하지 마.
```

## PR evidence collection

Prefer remote read-only checks so local untracked files remain untouched. Collect:

- PR number, URL, base, full `headRefOid`, draft and merge state
- linked issue and acceptance criteria
- files and full diff, including migrations and workflow files
- required checks and their conclusions
- review comments and latest QA verdict
- exact SHA named by QA

Treat developer results as context, not QA evidence. Treat old QA comments as historical when a newer verdict exists. If comments conflict, require one updated final verdict on the current HEAD.

## Decision matrix

| Observable state | Decision | Next action |
|---|---|---|
| Current-HEAD QA PASS, CI green, issue met, authorized | MERGE | Squash, confirm merge and issue |
| QA SHA differs from PR HEAD | DO NOT MERGE | Request QA on current full SHA |
| QA FAIL with unresolved BLOCKER/MAJOR | DO NOT MERGE | Convert reproduction into role-specific fix command |
| QA BLOCKED | BLOCKED | Name the blocker owner and unblock action |
| DB change, local DB suite skipped | DO NOT MERGE | Restore isolated local DB and require Backend QA |
| Complete current-HEAD QA evidence | Do not duplicate full QA | Review evidence; target only a demonstrated gap |
| Manual account/provider check unavailable | Decide code gate separately | Give 손 대표님 location → action → expected result |

### Targeted Planner verification

Target only the disputed surface when:

- QA SHA and current HEAD do not match;
- QA, CI, or diff contradict one another;
- a required suite was skipped or only quoted from the developer;
- a new migration or commit appeared before merge; or
- high-risk auth, payment, RLS, migration, privacy, token, concurrency, or idempotency claims lack evidence.

If targeted evidence conflicts with QA, do not merge. Record the evidence and request a current-HEAD QA update. Do not convert Planner work into a second full QA pass.

## Merge and issue handling

Before merge, confirm authorization in the current conversation. `확인해줘` or `진행해줘` after the user says QA is complete grants merge authority only when the gate passes. It does not authorize deployment or remote data changes.

Default to squash merge. After the command succeeds:

1. Re-read PR state and merge commit.
2. Confirm the linked issue state.
3. If auto-close syntax was missing, add a concise evidence comment and close the completed issue.
4. List migrations, environment variables, redeployment, provider setup, and manual checks separately.
5. Assign exactly one next implementation or QA action.

Do not mark an issue complete merely because a PR exists. `Closes #<issue>` acts when the PR is merged into the default branch, not when it is opened.

## Remote migration handoff

A migration file in a merged PR creates a follow-up operation; it does not silently authorize that operation.

On explicit approval:

1. Use the latest merged `main`.
2. Inspect local migration files and the linked remote migration list.
3. Identify the exact expected pending migration.
4. Stop if any unrelated or unexplained migration is pending.
5. Use a supported dry-run when available.
6. Apply only the approved migration.
7. Re-check the remote list and record a secret-free result.

Never reset production, repair migration history speculatively, or use real customer data for a smoke test.

## Manual verification handoff

Write every manual check as:

```text
<location> → <action> → <observable expected result>
```

Examples of owner-only checks include signed-in admin behavior, real Resend/Slack delivery, production environment variables, live payment, and visual checks when Browser/account access is unavailable. Do not ask 손 대표님 to share passwords or tokens.

## Planner decision template

```markdown
## 플래너 결정 — MERGE | DO NOT MERGE | BLOCKED

- PR/HEAD: `#<pr> <full-sha>`
- QA: `<PASS|FAIL|BLOCKED>`, `<HEAD 일치|불일치>`
- CI: `<결과>`
- 이슈 완료 조건: `<충족|미충족>`
- 플래너 표적 검증: `<없음 또는 근거와 결과>`

### 처리
- `<merge commit 또는 수정/재검증 요청>`

### 손 대표님이 할 일
- `<없음 또는 위치 → 행동 → 정상 기준>`

### 다음 작업
- `<역할 + 이슈 번호 + 복사 가능한 한 명령>`
```

## Common mistakes

| Mistake | Correct response |
|---|---|
| Reusing PASS after any HEAD change | Invalidate it and request current-HEAD QA |
| Running all developer and QA suites a third time | Review complete evidence; run only justified targeted checks |
| Accepting generic CI for skipped DB integration | Refuse merge until QA runs isolated local DB integration |
| Testing migrations against linked production | Keep feature verification local; remote application is post-merge and explicitly approved |
| Combining API, UI, deployment, and live checks into one owner | Split by role and dependency |
| Saying “all done” after merge | Confirm issue, migrations, configuration, deployment, and manual checks |
| Giving several next tasks at once | Choose the single next dependency-unlocking action |
