# Assistant Chat Request Budget and UX

## Objective

Reduce avoidable AI-provider requests per chat turn and make the mobile assistant's send, failure, and provider states clearer without losing tool-backed behavior.

## Problem

The current AI SDK path allows up to eight tool-loop steps, then may silently replay the same prompt and history through `generateText` after a stream timeout or unusable response; that fallback permits an SDK retry, and Auto mode can continue to later providers. `providerFetch` buffers complete responses, so nominal streaming may not deliver tokens until the provider finishes and can hit the 20-second stream timeout. Separately, keyboard submit is not disabled while a request is active, screen/session changes do not abort active work, and the chat provider picker does not expose the locally configured Ollama/Mistral providers.

The reported Ollama usage count is not independently verified; no Ollama account, key, usage dashboard, or remote service was inspected.

## Why

The user requested an audit and correction after observing unusually high free-tier usage, plus a clearer chat UX. Avoiding silent duplicate generations is the primary quota-safety goal; visible/manual retry and cancellation should make any intentional new request attributable to a user action.

## Scope

- Bound model/tool steps and remove an automatic full-turn replay to the same provider after an ambiguous stream failure or timeout.
- Prevent overlapping chat sends and abort requests when the current chat screen/session is abandoned.
- Preserve the user's draft on failure and make retry an explicit action where the existing chat flow supports it.
- Expose Ollama and Mistral in the chat's provider picker when those providers are configured locally.
- Add offline tests that count model invocations and cover duplicate-send/cancel behavior.

## Constraints

- Strict TDD applies, based on the user's prior explicit assistant-reliability decision: RED -> GREEN -> REFACTOR.
- Test runner: `npm test`; type verification: `npx tsc --noEmit`.
- Keep mobile changes on the current primary branch (`master`) per the user's saved instruction; do not push or open a PR.
- Preserve all pre-existing and concurrent working-tree changes. In particular, do not edit or stage `.atl/.skill-registry.cache.json`, `.atl/skill-registry.md`, `app.json`, `scripts/seed_lidemoda.sql`, `src/features/ajustes/screens/AISettingsScreen.tsx`, `src/features/asistente-ia/lib/aiProviders.ts`, `src/features/auth/hooks/useAuth.tsx`, `src/features/auth/lib/authBoundary.ts`, `src/shared/lib/secureKeyStore.ts`, `tests/behavior.test.mjs`, `scripts/vault_ai_credentials_sync.sql`, or `src/features/asistente-ia/lib/aiVaultSync.ts`.
- No remote Ollama/Supabase access, secret inspection, or provider usage-dashboard access.
- Delivery strategy: `ask-on-risk`; forecast is approximately 250 authored changed lines (additions plus deletions), below the 400-line planning threshold.

## Tasks

- [x] ACU-001 — Bound AI SDK request amplification.
  - Acceptance: a stream timeout/failure cannot silently trigger a second full generation to the same provider; tool loops have an explicit lower per-provider step cap; automatic SDK retries are disabled on the retained generation path; deterministic tests assert invocation/fallback behavior.
  - Checks: focused request-count tests first (RED), then GREEN/REFACTOR; `npm test`; `npx tsc --noEmit`.
  - Rollback boundary: `src/features/asistente-ia/api/assistantAgent.ts` and the focused request-policy test only.
- [ ] ACU-002 — Guard and cancel chat submissions.
  - Acceptance: synchronous duplicate sends are rejected across button/keyboard paths; leaving or changing the active chat aborts its request; failed requests retain the user's text and require an explicit retry action; cancellation does not trigger provider failover.
  - Checks: focused send-lock/cancel/draft tests first (RED), then GREEN/REFACTOR; `npm test`; `npx tsc --noEmit`.
  - Rollback boundary: the assistant screen/composer request-lifecycle changes and their focused tests only.
- [ ] ACU-003 — Align provider choice and request-state UX.
  - Acceptance: configured Ollama and Mistral choices appear in the chat picker; current progress identifies the provider/attempt state; a user-triggered retry is distinguishable from an automatic request; no credentials are displayed.
  - Checks: provider-picker contract test first (RED), then GREEN/REFACTOR; `npm test`; `npx tsc --noEmit`.
  - Rollback boundary: chat provider-picker and progress/error UI changes with their focused tests only.

## Progress

- Status: ACU-001 implemented; ACU-002 and ACU-003 remain planned.
- TDD mode: strict, user-selected for assistant reliability.
- Test runner: `npm test`; type verification: `npx tsc --noEmit`.
- Branch: `master` (current primary branch).
- Feature delivery strategy: `ask-on-risk`.
- Review workload forecast: approximately 250 authored changed lines; generated files excluded.

## Verification Evidence

- Read-only audit confirmed the eight-step `streamText` tool limit, stream timeout, same-provider `generateText` fallback with `maxRetries: 1`, provider failover in Auto mode, buffered provider responses, missing synchronous keyboard-send guard, and missing request cancellation on screen/session changes.
- No render-triggered AI invocation or obvious speech-listener leak was found in the audited path.
- Expo SDK 57.0.0 versioned documentation was consulted before any source change.
- Strict TDD RED: the new offline request-budget tests failed because a stream error invoked both `streamText` and `generateText`, and because the tool-step cap was 8 instead of the expected 4.
- GREEN: `node --test tests/assistant-request-budget.test.mjs` passes 3 tests; a failed stream makes no same-provider `generateText` call, the retained stream path uses `maxRetries: 0` and a 4-step cap, and Auto failover makes at most one stream attempt per configured provider.
- `npm test` runs 69 tests and passes 68; the pre-existing dirty `tests/behavior.test.mjs:1332` fails because it asserts that `generateText()` and `GENERATE_TIMEOUT_MS` remain in the implementation, which conflicts with ACU-001's removal of that fallback. This file is explicitly protected from editing.
- `npx tsc --noEmit` is blocked by unrelated workspace errors in `aiSdkProviders.ts`, the pre-existing untracked `aiVaultSync.ts`, and missing `react-native-drawer-layout` types in `AppDrawerProvider.tsx`.
- `git diff --check` reports a pre-existing trailing blank line in the protected, modified `scripts/seed_lidemoda.sql`; no ACU-001 file is named in the output.
- The focused request-budget test is included in `npm test`; no remote calls, credentials, or provider usage checks were made.

## Next Step

Commit only ACU-001's source, focused test, package test wiring, and this task-document progress; then update its Engram mirror. Resolve the stale behavior assertion and workspace typecheck/diff blockers without touching the protected user-owned paths before claiming full-suite verification; ACU-002 remains next.

## Relevant Files

- `src/features/asistente-ia/api/assistantAgent.ts` — AI SDK request and tool-loop orchestration.
- `src/features/asistente-ia/lib/providerFetch.ts` — compatibility wrapper that currently buffers provider response bodies.
- `src/features/asistente-ia/components/ChatComposer.tsx` — keyboard/button send affordances and request-state feedback.
- `src/features/asistente-ia/components/ProviderSelectModal.tsx` — provider selection in the chat.
- `src/features/asistente-ia/screens/VoiceCommandView.tsx` — owns the chat send lifecycle and session state.
