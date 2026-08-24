# Inquiry AI and Slack Frontend Implementation Plan

> **For Codex:** REQUIRED SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hard-coded public pricing/FAQ content with the merged APIs and add admin content, AI reply draft, and Slack delivery controls without changing backend contracts.

**Architecture:** Keep API response shapes in frontend-only model modules, isolate payload/state transformations as tested pure functions, and layer client widgets into the existing server-rendered home and admin inquiry detail. Admin actions continue using the existing JSON envelope and login-expiry behavior.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Node test runner.

**Contract note:** The merged reply-draft GET contract exposes `generationRecordId` and `updatedAt`, but not the generation model. The UI will show the last updated time and generation identifier only; it will not invent or fetch data outside the approved contract.

---

### Task 1: Frontend content and automation models

**Files:**
- Create: `src/entities/automation/model/frontend.ts`
- Create: `src/entities/automation/index.ts`
- Create: `src/features/manage-automation-content/model/content-form.ts`
- Create: `src/features/manage-automation-content/index.ts`
- Test: `tests/automation-frontend-model.test.ts`

**Steps:**
1. Add failing tests for line-list conversion, nullable prices, API validation errors, auth expiry, draft and Slack status labels.
2. Run the focused test and confirm failure.
3. Implement frontend-only types and pure transformations matching the merged contract.
4. Run the focused test and confirm success.

### Task 2: Public service offerings and FAQ sections

**Files:**
- Create: `src/widgets/public-automation-content/model/public-content-state.ts`
- Create: `src/widgets/public-automation-content/ui/public-automation-content.tsx`
- Create: `src/widgets/public-automation-content/index.ts`
- Modify: `src/widgets/public-home/ui/public-home.tsx`
- Test: `tests/public-automation-content-state.test.ts`

**Steps:**
1. Add failing state-mapping tests for loading success, empty data, and API failure.
2. Implement client-side public API loading with accessible loading, empty, error, and retry states.
3. Render only API-returned published/sorted items and remove hard-coded pricing/FAQ arrays.
4. Run focused tests.

### Task 3: Admin service and FAQ management

**Files:**
- Create: `src/widgets/admin-automation-content/ui/admin-automation-content-manager.tsx`
- Create: `src/widgets/admin-automation-content/index.ts`
- Modify: `src/widgets/admin-dashboard/ui/admin-dashboard.tsx`

**Steps:**
1. Build keyboard-accessible service/FAQ tabs, list selection, create mode, and responsive editors.
2. Connect GET/POST/PATCH endpoints with disabled save/refresh states.
3. Surface field validation, conflicts, server failures, empty lists, and login expiry.
4. Include all approved public fields plus internal AI guidance, publication, and ordering fields.

### Task 4: Inquiry reply draft and Slack delivery panel

**Files:**
- Create: `src/features/manage-inquiry-reply/model/reply-draft-state.ts`
- Create: `src/features/manage-inquiry-reply/ui/inquiry-reply-draft-panel.tsx`
- Create: `src/features/manage-inquiry-reply/index.ts`
- Modify: `src/widgets/admin-dashboard/ui/admin-inquiry-list.tsx`
- Test: `tests/inquiry-reply-draft-state.test.ts`

**Steps:**
1. Add failing tests for missing, generating, ready, failed draft states and Slack status mapping.
2. Implement loading, pending/missing, generating, ready, and failed views.
3. Connect summary/draft editing and saving, clipboard copy, regeneration, and Slack retry.
4. Show confirmation items, last update time, generation identifier, attempts, errors, and separate AI/Slack failures.
5. Run focused tests.

### Task 5: Verification and delivery

**Files:**
- Modify only files needed for lint/type corrections.

**Steps:**
1. Run `npm test`.
2. Run `npm run lint`.
3. Run `npm run type-check`.
4. Run `npm run build` and confirm a production build succeeds.
5. Review the diff to confirm no API route, schema, migration, or database-contract changes.
6. Commit and push `frontend/issue-24-ai-slack-ui`.
7. Create a PR whose first line is `[Front Agent / 프론트엔드 에이전트]`, links issue #24, summarizes implementation and verification, and records the model-name contract limitation.
