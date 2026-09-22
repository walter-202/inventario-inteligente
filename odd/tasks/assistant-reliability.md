# Assistant Reliability

## Objective

Make the AI assistant useful for natural-language inventory work, durable across screen remounts, and safe under the authenticated user's role and branch scope. Fix restricted-route back navigation and add representative multi-branch demo coverage without weakening Supabase authorization.

## Problem

The assistant currently emits a small intent vocabulary, treats unsupported questions as product names, keeps chat sessions only in component memory, and sends branch labels rather than authoritative permissions to the interpreter. A restricted screen also calls `router.back()` when no navigation history exists. Demo data under-represents multi-branch users and the current "today" response uses a seven-day aggregate.

## Why

The requested product behavior depends on the assistant using the existing read/write APIs instead of guessing, preserving user context, and refusing operations outside the authenticated scope. The implementation must be reportable through unit, integration, authorization, persistence, and navigation tests.

## Scope

- Extend the allowlisted assistant intent/tool boundary for product search, stock, low-stock inventory, and today's sales.
- Pass role, abilities, and allowed branch IDs into interpretation and enforce them again before execution.
- Persist sessions per authenticated user with safe hydration and sidebar restoration; never replay a sale from restored UI state.
- Add two multi-branch demo users/fixtures without exposing new credentials in source or changing live Supabase data.
- Correct `GO_BACK` by using Expo Router 57's `canGoBack()` and a deterministic route fallback.
- Add focused unit, integration, authorization, persistence, and navigation tests under strict TDD.

## Constraints

- Strict TDD is enabled by explicit user decision: RED -> GREEN -> REFACTOR.
- Existing verification commands: `npm test` and `npx tsc --noEmit`.
- Supabase RLS/RPC remains the final authorization boundary; UI and model output are not authority.
- Do not use `user_metadata` for authorization decisions.
- Preserve pre-existing working-tree changes in `.atl/`, `GestionUsuariosScreen.tsx`, and `supabase/migrations/20260921020000_admin_crear_usuario.sql`.
- Do not run remote Supabase mutations or commit secrets/demo passwords.
- Feature delivery strategy: `ask-on-risk`; split only if the accumulated authored change exceeds repository review policy.

## Tasks

- [x] AR-001 — Define safe assistant intents and tool-backed queries.
  - Acceptance: natural-language queries do not pass question text as a product name; supported read operations call the correct API; unsupported operations return a clear safe response.
  - Checks: parser/unit tests first, then query-handler integration tests and `npm test`.
  - Evidence: RED `npm test` observed 47 passing / 3 failing focused tests; a follow-up branch-safety RED observed 53 passing / 1 failing. Final GREEN `npm test` observed 57 passing / 0 failing. REFACTOR `npx tsc --noEmit` and `git diff --check` passed. Commit: `be78c34`.
- [x] AR-002 — Persist authenticated assistant sessions and sidebar state.
  - Acceptance: sessions survive unmount/remount and app reload per user; sidebar can select/delete sessions; malformed or foreign storage is ignored; restored confirmation UI cannot execute a sale without a fresh confirmation.
  - Checks: storage serialization and hydration unit tests, reducer/component integration tests, `npm test`.
  - Evidence: per-user AsyncStorage keys hydrate bounded sessions/messages (20/30), malformed storage is ignored, and hydrated messages strip action attachments. Full suite passed 57/57. Commit: `be78c34`.
- [x] AR-003 — Enforce role, permission, and branch scope in assistant context and execution.
  - Acceptance: interpreter receives role/abilities/allowed branch IDs; branch selection is limited to allowed branches; disallowed sale or branch actions are rejected before API invocation; backend contracts remain unchanged.
  - Checks: authorization unit tests, assistant execution integration tests, TypeScript check.
  - Evidence: the interpreter receives the complete role/ability/branch context; allowed branches are filtered before reads; sale/cart/product writes recheck permissions; focused assistant correctness tests passed 3/3 and TypeScript passed. Commit: `be78c34`.
- [x] AR-004 — Improve multi-branch demo data and date-correct business queries.
  - Acceptance: two additional demo profiles exercise multiple allowed branches; fixture generation is idempotent and credentials are environment-driven; "today" is a calendar-day query rather than a seven-day dashboard aggregate.
  - Checks: seed/contract tests and date-boundary integration tests; no remote mutation.
  - Evidence: added marketing and regional-admin multi-branch representatives, environment-driven credentials, idempotent profile seeds, and database-current-day sales anchors. Focused seed tests passed 3/3; remote SQL was intentionally not executed. Commit: `97d8786`.
- [x] AR-005 — Fix restricted-screen back navigation.
  - Acceptance: in-stack access denial goes back; direct/deep-linked denial navigates to the authenticated home route without `GO_BACK`; the action is safe on Expo SDK 57.
  - Checks: navigation helper/unit tests and `npm test`.
  - Evidence: focused navigation tests passed 4/4; direct access now falls back to `/` when `canGoBack()` is false. Commit: `5e49571`.
- [x] AR-006 — Refactor and close verification evidence.
  - Acceptance: all tasks have observed proof recorded here, no unrelated files are reverted, and the final report lists passed/failed/skipped checks.
  - Checks: `npm test`, `npx tsc --noEmit`, targeted test commands, working-tree readback.
  - Evidence: `npm test` 57/57; `npx tsc --noEmit` exit 0; focused auth, assistant-correctness, and seed tests 10/10; `git diff --check` exit 0. Commits: `be78c34`, `97d8786`, `5e49571`.

## Progress

- Status: AR-001 through AR-006 complete.
- TDD mode: strict, user-selected.
- Test runner: `npm test`; type verification: `npx tsc --noEmit`.
- Branch: `codex/ai-assistant-reliability`.
- Baseline evidence: existing `npm test` passed 47/47 and TypeScript passed before implementation.
- Work-unit commits: `be78c34` (assistant), `97d8786` (seed fixtures), `5e49571` (restricted navigation).

## Verification Evidence

- AR-005 RED: `node --test tests/auth.test.mjs` failed because `restrictedAccessNavigation.ts` did not exist (3 passed, 1 failed).
- AR-005 GREEN: the focused auth test passed (4/4) after adding the pure decision helper and guarded component handler.
- AR-005 REFACTOR: reviewed the helper/component split; no further refactor was needed. `npx tsc --noEmit` passed. Commit: `5e49571`.
- AR-001 RED: `npm test` observed 47 passing / 3 failing focused parser, malformed-JSON, and read-query-dispatch tests. A branch-safety follow-up observed 53 passing / 1 failing and proved unknown branches could silently fall through to an unfiltered sales query.
- AR-001 GREEN: `npm test` observed 54 passing / 0 failing after named-product validation, allowlisted read dispatch, exact branch resolution, and local-day sales support were implemented.
- AR-001 REFACTOR: the final suite passed 57/57 after persistence, authorization, seed, navigation, and prompt-contract coverage was added; `npx tsc --noEmit` passed. Commit: `be78c34`.
- AR-002/AR-003 focused evidence: storage, scope, and user-switch regression coverage passed as part of `npm test` 57/57 and `node --test tests/assistant-correctness.test.mjs` 3/3.
- AR-004 focused evidence: `node --test tests/seed-fixtures.test.mjs` passed 3/3; no remote Supabase mutation was attempted.
- Final verification: `npm test` 57/57, `npx tsc --noEmit` exit 0, `node --test tests/auth.test.mjs tests/assistant-correctness.test.mjs tests/seed-fixtures.test.mjs` 10/10, and `git diff --check` exit 0.
- Pre-existing changes in `.atl/`, `GestionUsuariosScreen.tsx`, and `supabase/migrations/20260921020000_admin_crear_usuario.sql` were preserved and excluded from the work-unit commits.

## Next Step

Implementation and verification are complete on `codex/ai-assistant-reliability`. Applying the SQL seed requires an authorized Supabase session and an externally supplied `seed.auth_password`; push, PR, merge, and remote seed execution remain ordinary repository/user decisions.
