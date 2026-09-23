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
- Preserve all pre-existing and concurrent working-tree changes. In particular, do not edit or revert `.atl/.skill-registry.cache.json`, `.atl/skill-registry.md`, `app.json`, `scripts/seed_lidemoda.sql`, `src/features/ajustes/screens/AISettingsScreen.tsx`, `src/features/asistente-ia/lib/aiGateway.ts`, `src/features/asistente-ia/lib/aiProviders.ts`, `src/features/auth/hooks/useAuth.tsx`, `src/features/auth/lib/authBoundary.ts`, `src/shared/lib/secureKeyStore.ts`, `tests/behavior.test.mjs`, `scripts/vault_ai_credentials_sync.sql`, or `src/features/asistente-ia/lib/aiVaultSync.ts` as part of ACU work. These paths contained concurrent changes during implementation; a later broader commit `9c86d81` records them. The initial user-owned test hunk removing the obsolete fallback assertion is now committed; do not rewrite or revert it.
- No remote Ollama/Supabase access, secret inspection, or provider usage-dashboard access.
- Delivery strategy was initially recorded as `ask-on-risk`; the user requires remaining on `master`, with no push or PR. The original authored-line forecast was approximate and excluded later concurrent changes.

## Tasks

- [x] ACU-001 — Bound AI SDK request amplification.
  - Acceptance: a stream timeout/failure cannot silently trigger a second full generation to the same provider; tool loops have an explicit lower per-provider step cap; automatic SDK retries are disabled on the retained generation path; timeout errors remain accurately classified; deterministic tests assert invocation/fallback behavior.
  - Checks: focused request-count and timeout-error tests first (RED), then GREEN/REFACTOR; `npm test`; `npx tsc --noEmit` (blocked by unrelated concurrent workspace errors unless those clear).
  - Rollback boundary: `src/features/asistente-ia/api/assistantAgent.ts`, the focused request-policy test, and `package.json` test wiring; do not include any `tests/behavior.test.mjs` hunk because it belongs to concurrent user work.
- [x] ACU-002 — Guard and cancel chat submissions.
  - Acceptance: button and keyboard sends share a synchronous single-flight guard; leaving the screen, switching sessions, deleting the active session, or changing users aborts the request; a failed request keeps its submitted draft and offers an explicit retry without duplicating the user message; caller cancellation does not trigger provider failover.
  - Checks: focused lifecycle tests first (RED), then GREEN/REFACTOR; `node --test tests/assistant-chat-lifecycle.test.mjs`; `npm test`; `npx tsc --noEmit`.
  - Rollback boundary: `src/features/asistente-ia/api/assistantAgent.ts`, `src/features/asistente-ia/api/voiceCommandApi.ts`, `src/features/asistente-ia/lib/assistantChatRequestLifecycle.ts`, `src/features/asistente-ia/screens/VoiceCommandView.tsx`, `src/features/asistente-ia/components/ChatComposer.tsx`, and `tests/assistant-chat-lifecycle.test.mjs` only.
- [ ] ACU-003 — Align provider choice and request-state UX.
  - Acceptance: configured Ollama and Mistral choices appear in the chat picker; current progress identifies the provider/attempt state; a user-triggered retry is distinguishable from an automatic request; no credentials are displayed.
  - Checks: provider-picker contract test first (RED), then GREEN/REFACTOR; `npm test`; `npx tsc --noEmit`.
  - Rollback boundary: chat provider-picker and progress/error UI changes with their focused tests only.

## Progress

- Status: ACU-001 request cap and timeout-specific error reporting implemented and committed as `e500349` and `ddc2bc1`; ACU-002 request lifecycle and retry UX implemented and verified; ACU-003 remains planned.
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
- Earlier ACU-001 writer verification ran 69 tests and passed 68 because the then-current dirty `tests/behavior.test.mjs` asserted that `generateText()` and `GENERATE_TIMEOUT_MS` remain after ACU-001 removed that fallback. A concurrent user-owned diff later removed the obsolete assertion; this task preserved that file untouched and unstaged.
- Independent verification confirmed the focused tests count mocked AI SDK calls, but initially found that swallowed stream errors left `lastError` unset, so exhausted providers lost the specific timeout message.
- Strict TDD follow-up RED: the new simulated-abort test immediately fired the internal 20-second timeout callback and failed because the final message was generic provider error instead of timeout-specific.
- GREEN: `node --test tests/assistant-request-budget.test.mjs` passes 4 tests, including an in-flight abort simulation that completes in under a second and verifies timeout-specific messaging without any generateText replay.
- Parent spot-check after `ddc2bc1`: the focused request-budget suite passes 4/4; native risk assessment for the committed work returned `medium`, and receipt-driven review is off by default.
- At the ACU-001 verification point, `npm test` passed all 70 tests, including the concurrent user-owned `tests/behavior.test.mjs` changes; that file remains untouched and unstaged by this work.
- `npx tsc --noEmit` is blocked by unrelated workspace errors in `aiSdkProviders.ts`, the pre-existing untracked `aiVaultSync.ts`, and missing `react-native-drawer-layout` types in `AppDrawerProvider.tsx`.
- `git diff --check` reports a pre-existing trailing blank line in the protected, modified `scripts/seed_lidemoda.sql`; no ACU-001 file is named in the output.
- The focused request-budget test is included in `npm test`; no remote calls, credentials, or provider usage checks were made.
- ACU-002 strict TDD RED: the offline cancellation test showed an aborted primary-provider stream still invoked the fallback provider; lifecycle tests also failed before the request gate/retry classification existed. GREEN: `node --test tests/assistant-chat-lifecycle.test.mjs` passes 5/5, covering cancellation without failover, synchronous duplicate rejection, session-scoped cancellation, retry identity, retryable provider/configuration failures, and the shared button/keyboard/retry wiring.
- ACU-002 `npm test` passed 76/76 at its implementation point; the focused lifecycle suite is run explicitly and is not wired into this script. After the broader `9c86d81` commit, the writer reran the current suite at 81/81.
- ACU-002 `npx tsc --noEmit` remains blocked only by unrelated dirty/untracked `aiSdkProviders.ts`, `aiVaultSync.ts`, and missing `react-native-drawer-layout` types in `AppDrawerProvider.tsx`; no ACU-002 file appears in the errors.
- Before the broader `9c86d81` commit, `git diff --check` reported only the pre-existing blank line at `scripts/seed_lidemoda.sql:356`; the writer later confirmed `git diff --check` passes on the clean current tree.
- The AI SDK's installed local docs and source confirm `streamText` accepts `abortSignal`; the local provider fetch wrapper forwards its `init` unchanged, so the signal reaches the SDK fetch. No mobile/native runtime or real provider was invoked; the offline mocked harness verified one model invocation on cancellation.
- Parent spot-check after ACU-002: `node --test tests/assistant-chat-lifecycle.test.mjs` passes 5/5. Native assessment of the current committed delta returned `medium`; receipt-driven review remains off by default.
- ACU-002 lifecycle UI/helper/tests are in `a82a120`; its AI SDK abort/failover integration in `assistantAgent.ts` and `voiceCommandApi.ts` is present in the later broad `9c86d81`, not `a82a120`. The integrated current tree passes the lifecycle suite, but those commits are not a standalone ACU-002-only sequence.

## Next Step

ACU-001 and ACU-002 are complete on `master`. ACU-003 remains the recommended next UX slice: expose configured Ollama/Mistral choices and make provider/attempt/request-count state visible. No source changes for ACU-003 were made in this pass.

## Relevant Files

- `src/features/asistente-ia/api/assistantAgent.ts` — AI SDK request and tool-loop orchestration.
- `src/features/asistente-ia/lib/providerFetch.ts` — compatibility wrapper that currently buffers provider response bodies.
- `src/features/asistente-ia/components/ChatComposer.tsx` — keyboard/button send affordances and request-state feedback.
- `src/features/asistente-ia/components/ProviderSelectModal.tsx` — provider selection in the chat.
- `src/features/asistente-ia/screens/VoiceCommandView.tsx` — owns the chat send lifecycle and session state.
