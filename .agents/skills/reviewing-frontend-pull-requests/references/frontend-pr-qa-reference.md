# Frontend PR QA reference

## Required evidence

Before running tests capture:

- PR number/URL, base branch, and full HEAD SHA
- linked issue acceptance criteria
- PR QA instructions, migration/environment/deploy notes
- repository `AGENTS.md`, changed files, complete diff, and CI/Preview state

Run `git diff-tree --check` (or the equivalent `git diff --check <base>...<head>`) and inspect for unrelated generated files, secrets, debug logs, and unsafe client exposure. For Next.js behavior, consult the installed `node_modules/next/dist/docs/` version-specific docs.

## State matrix

For each changed screen or flow, connect requirement → method → expected → actual. Cover only applicable rows:

| State | Evidence to seek |
|---|---|
| Normal/empty | expected data and explicit empty state |
| Initial/background loading | visible loading distinction and preserved actionable data |
| API error/retry | safe message, retry path, no stale corruption |
| 401/403 | auth boundary and no sensitive leakage |
| Invalid/conflict/duplicate click | validation, disabled pending controls, one mutation |
| Success | cache invalidation/update and correct detail/list consistency |
| Cross-item/filter/page | no query-key or user-data contamination |

## Browser and manual fallback

When Browser is connected, use Preview or approved local server and inspect 360px, 768px, and 1280px. Check overflow/clipping/overlap/layout shift, readable controls, loading/error/empty distinction, tab order and visible focus, native button/link semantics, labels and error association, status announcements, disabled/pending behavior, touch target size, and modal scroll restoration.

When Browser, administrator credentials, or real operational data are unavailable, do not ask for credentials or convert that absence into BLOCKED. Put a one-sentence manual item in the comment using: **where → action → expected result**. Example: `Preview 관리자 화면 → 360px에서 목록을 스크롤 → 가로 스크롤과 잘림 없이 모든 컨트롤이 보임.`

## Pressure rules

1. Browser absent but code checks pass: PASS if no defect is found, with manual checks listed.
2. A new commit after testing invalidates the prior verdict; re-anchor and rerun.
3. Node 20.8 build failure with Node 20.19 available: rerun with 20.19; do not call product FAIL from the first attempt.
4. Visual success cannot mask duplicate mutation or input loss: mark MAJOR and FAIL with a minimal reproduction.
5. Developer-reported results are context only; run commands independently at the fixed HEAD.
6. Never request an admin password/account; route live checks to the manual list.

## Comment template

```markdown
## QA 결과 — PASS | FAIL | BLOCKED

- 검증 HEAD: `<full-sha>`
- base: `<branch>`
- 검증 범위: `<요구사항 요약>`

### 자동 검증
- `npm test`: PASS — <tests>/<tests>
- `npm run lint`: PASS
- `npm run type-check`: PASS
- `npm run build -- --webpack`: PASS
- `git diff --check <base>...<head>`: PASS

### 기능·코드 검증
- <요구사항>: PASS | FAIL — <근거>

### 발견 사항
- 없음
<!-- 또는 [MAJOR] 재현 절차 / 기대 / 실제 -->

### 손 대표님 수동 확인
- 없음
<!-- 또는 위치 → 행동 → 정상 기준 -->

### 제한 사항
- <실행하지 못한 항목과 판정에 미치는 영향>

**Planner 권고: 머지 검토 가능 | 수정 후 재검증 | 차단 해소 후 재검증**
```
