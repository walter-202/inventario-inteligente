# Auth Refresh Navigation UX

## Objective

Keep web and mobile navigation stable during same-user session/profile revalidation while covering protected app content until the current server-owned authorization profile has been confirmed.

## Problem

Auth synchronization currently uses `loading` for both initial session resolution and same-user profile revalidation. The Expo Router protected route guard can therefore remove the active `(tabs)` route and return to its root anchor; the drawer provider can also replace the navigator wrapper. Simply suppressing revalidation would risk stale role/branch permissions and cached data.

## Why

The user reported that switching tabs on web can return to `/` and that mobile repeatedly shows session checks and navigation jumps. The user authorized a fix on the existing primary branch and chose to cover sensitive UI while authorization is being revalidated.

## Scope

- Preserve the active route and mounted navigator during same-user revalidation on web and native.
- Keep protected content covered and interactions blocked until the updated profile is confirmed; initial loading, user changes, sign-out, and refresh failures must remain fail-closed.
- Continue server-owned role/branch profile revalidation; do not suppress `SIGNED_IN` or reuse a stale profile as authorization.
- Invalidate or clear every role/branch-scoped cache and pending-sales state when the refreshed authorization scope changes, including module-level batch sales and local cart/stock state retained by mounted screens; do not invoke `clearAuthScopedState()` for a same-user refresh because that path also clears AI-vault local keys.
- If revalidation fails, keep protected content covered and ensure a later retry cannot bypass scope cleanup merely because the last profile was cleared; no prior-scope cache or pending transaction may reappear after retry.
- Guard every asynchronous screen effect and mutation-error presentation across authorization-scope changes, including late sale callbacks that could otherwise clear a new-scope cart draft or show stale dialogs/inline errors.
- Add focused regression coverage for revalidation state, route stability/covers, profile changes, and failure behavior as supported by the existing test harness.

## Constraints

- Stay on the current primary branch `master`; do not create or switch branches, push, or open a PR.
- Preserve every unrelated or concurrent worktree change. The existing AI-vault sync/cleanup hunks in `src/features/auth/hooks/useAuth.tsx` and `src/features/auth/lib/authBoundary.ts` must remain intact.
- Strict TDD is enabled by the existing project decision: RED → GREEN → REFACTOR.
- Verification commands: `node --test tests/auth.test.mjs`, `npm test`, and `npx tsc --noEmit`.
- Consult the exact Expo SDK 57.0.0 versioned documentation before source changes. No remote Supabase operations or credential inspection are needed.
- Delivery strategy: `ask-on-risk`; forecast is approximately 180 authored changed lines, below the 400-line planning heuristic.

## Tasks

- [x] AUTH-001 — Preserve navigation and cover protected content during profile revalidation.
  - Acceptance: same-user revalidation keeps the current route and navigator mounted; protected app content is inaccessible and interactions are blocked until the refreshed profile is applied; changed or unknown role/branch scope clears query data, pending single/batch sales, and mounted cart/stock state before content is revealed; a failed-refresh retry cannot expose data from the previous scope; delayed callbacks from an older scope cannot mutate or erase a new-scope draft or show stale success/failure dialogs or inline errors; initial auth resolution, identity changes, and sign-out retain existing behavior; AI-vault sync/cleanup changes are preserved.
  - Checks: add focused regression tests for same-user revalidation, scope-change sales state, failed-refresh retry, and delayed success/failure callbacks and rendered errors; observe RED before implementation; implement and verify GREEN; refactor without changing behavior; run `node --test tests/auth.test.mjs`, `npm test`, and `npx tsc --noEmit`; inspect only this work unit's diff for whitespace and unrelated hunks.
  - Commit boundary: the auth refresh/navigation state, its cover/gating behavior, and focused tests only. Keep unrelated and concurrent worktree changes unstaged.

## Progress

- Status: complete on the existing primary branch; same-user revalidation, protected-content cover, authorization-scope cleanup, and stale callback/error guards are implemented.
- TDD mode: strict, source: existing user-selected assistant-reliability project decision.
- Test runner: `node --test tests/auth.test.mjs` (focused), `npm test`; type check: `npx tsc --noEmit`.
- Branch: `master` (current primary branch).
- Work-unit commits: `0dba6b7` (auth refresh/navigation fix) and `80ce42b` (stale sales callback/error safeguards).
- Feature delivery strategy: `ask-on-risk`.
- Forecast: approximately 180 authored changed lines; generated files excluded.

## Verification Evidence

- Read-only trace: same-user session synchronization sets auth status to `loading`; the root protected-route guard and the drawer-provider tree can then remove/remount authenticated navigation.
- Expo SDK 57 versioned Router API documentation was consulted before implementation; protected-route behavior redirects when an active route becomes unavailable, so the fix must preserve the guard during same-user refresh rather than disable validation.
- Read-only security challenge: suppressing refresh risks stale client role/branch state; existing backend authorization does not remove already-cached client data.
- Read-only worktree map: current diffs in the auth hook and auth boundary are AI-vault integration additions and must be preserved; `clearAuthScopedState()` must not be used for same-user refresh.
- Independent audit: normal role/branch changes cleared the query cache and single pending product, but not module-level batch sales or mounted sales cart/stock state; after a failed refresh set `profile` to null, a retry could skip scope invalidation and reveal old cached/transaction state. These gaps are in-scope and are not covered by the initial tests.
- Follow-up audit: `VentasScreen.confirm()` could resolve after a scope reset and unconditionally clear a newly entered cart draft; async effects from the old scope must check the scope epoch before mutating screen state.
- Follow-up audit: sale success effects now check the authorization epoch, but the failure callback still showed an alert after scope reset; stale failure feedback must also be suppressed.
- Follow-up audit: the old-scope alert is now suppressed, but `mutation.error` can still render in the new scope; error presentation must also be scoped to the epoch that produced it.
- Final audit: no remaining issue found in the old-scope dialog or inline error filters; current-scope errors remain visible.
- TDD: regression tests reproduced missing same-user cover, incomplete scope cleanup, stale retry behavior, and old-scope callback/error leakage before their respective fixes.
- Focused test: `node --test tests/auth.test.mjs` passed 14/14 (writer and parent spot check).
- Full suite: `npm test` passed 84/84.
- Type check: `npx tsc --noEmit` remains blocked by workspace errors in `aiSdkProviders.ts`, `aiVaultSync.ts`, and missing `react-native-drawer-layout` types in `AppDrawerProvider.tsx`; the auth/scope-epoch corrections were not reported as errors.
- Targeted whitespace check: `git diff --check` passed on the work-unit paths.
- Risk assessment: RDD is off (`decided by default`); native assessment classified this auth hot-path candidate as `high`. The independent read-only audit found and helped close the stale sale state/callback issues; no RDD review transaction was started while the user-owned switch is off.
- Root trigger limitation: the exact event that causes a same-user revalidation on tab switch remains unproven; the fix preserves navigation and covers content for every same-user revalidation rather than suppressing session checks.
- No interactive web or mobile visual test was run.

## Next Step

Optional next step: reproduce tab switching on web and a mobile device to visually confirm the cover and route retention in the running app.

## Relevant Files

- `src/features/auth/hooks/useAuth.tsx` — session events, profile synchronization, and auth state.
- `src/app/_layout.tsx` — Expo Router protection of authenticated routes.
- `src/shared/components/AppDrawerProvider.tsx` — authenticated navigation wrapper.
- `src/features/auth/lib/authBoundary.ts` — auth-scoped cache cleanup; includes protected AI-vault cleanup.
- `src/shared/lib/queryClient.ts` — query cache policy for role/branch-scoped data.
- `tests/auth.test.mjs` — current auth synchronization regression tests.
