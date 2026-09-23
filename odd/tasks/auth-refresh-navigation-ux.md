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
- Add focused regression coverage for revalidation state, route stability/covers, profile changes, and failure behavior as supported by the existing test harness.

## Constraints

- Stay on the current primary branch `master`; do not create or switch branches, push, or open a PR.
- Preserve every unrelated or concurrent worktree change. The existing AI-vault sync/cleanup hunks in `src/features/auth/hooks/useAuth.tsx` and `src/features/auth/lib/authBoundary.ts` must remain intact.
- Strict TDD is enabled by the existing project decision: RED → GREEN → REFACTOR.
- Verification commands: `node --test tests/auth.test.mjs`, `npm test`, and `npx tsc --noEmit`.
- Consult the exact Expo SDK 57.0.0 versioned documentation before source changes. No remote Supabase operations or credential inspection are needed.
- Delivery strategy: `ask-on-risk`; forecast is approximately 180 authored changed lines, below the 400-line planning heuristic.

## Tasks

- [ ] AUTH-001 — Preserve navigation and cover protected content during profile revalidation.
  - Acceptance: same-user revalidation keeps the current route and navigator mounted; protected app content is inaccessible and interactions are blocked until the refreshed profile is applied; changed or unknown role/branch scope clears query data, pending single/batch sales, and mounted cart/stock state before content is revealed; a failed-refresh retry cannot expose data from the previous scope; initial auth resolution, identity changes, and sign-out retain existing behavior; AI-vault sync/cleanup changes are preserved.
  - Checks: add focused regression tests for same-user revalidation, scope-change sales state, and failed-refresh retry; observe RED before implementation; implement and verify GREEN; refactor without changing behavior; run `node --test tests/auth.test.mjs`, `npm test`, and `npx tsc --noEmit`; inspect only this work unit's diff for whitespace and unrelated hunks.
  - Commit boundary: the auth refresh/navigation state, its cover/gating behavior, and focused tests only. Keep unrelated and concurrent worktree changes unstaged.

## Progress

- Status: initial implementation complete; independent audit found pending-sales/local screen state and failed-refresh retry gaps; one bounded correction remains.
- TDD mode: strict, source: existing user-selected assistant-reliability project decision.
- Test runner: `node --test tests/auth.test.mjs` (focused), `npm test`; type check: `npx tsc --noEmit`.
- Branch: `master` (current primary branch).
- Feature delivery strategy: `ask-on-risk`.
- Forecast: approximately 180 authored changed lines; generated files excluded.

## Verification Evidence

- Read-only trace: same-user session synchronization sets auth status to `loading`; the root protected-route guard and the drawer-provider tree can then remove/remount authenticated navigation.
- Expo SDK 57 versioned Router API documentation was consulted before implementation; protected-route behavior redirects when an active route becomes unavailable, so the fix must preserve the guard during same-user refresh rather than disable validation.
- Read-only security challenge: suppressing refresh risks stale client role/branch state; existing backend authorization does not remove already-cached client data.
- Read-only worktree map: current diffs in the auth hook and auth boundary are AI-vault integration additions and must be preserved; `clearAuthScopedState()` must not be used for same-user refresh.
- Independent audit: normal role/branch changes cleared the query cache and single pending product, but not module-level batch sales or mounted sales cart/stock state; after a failed refresh set `profile` to null, a retry could skip scope invalidation and reveal old cached/transaction state. These gaps are in-scope and are not covered by the initial tests.
- Parent spot check: `node --test tests/auth.test.mjs` passed 8/8 before the bounded correction.

## Next Step

Add failing regression tests for pending-sales/local screen state and failed-refresh retry, then close the identified stale-scope gaps on `master` while preserving the existing AI-vault hunks.

## Relevant Files

- `src/features/auth/hooks/useAuth.tsx` — session events, profile synchronization, and auth state.
- `src/app/_layout.tsx` — Expo Router protection of authenticated routes.
- `src/shared/components/AppDrawerProvider.tsx` — authenticated navigation wrapper.
- `src/features/auth/lib/authBoundary.ts` — auth-scoped cache cleanup; includes protected AI-vault cleanup.
- `src/shared/lib/queryClient.ts` — query cache policy for role/branch-scoped data.
- `tests/auth.test.mjs` — current auth synchronization regression tests.
