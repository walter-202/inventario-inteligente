# Plan: Asistente IA con tool calling (eliminar interpretación hardcodeada)

Estado: **Plan cerrado** — 0.3 en device **PASS**; streaming **ON** (chat con `streamText`, fallback a `generateText`)
Decisiones tomadas por el usuario: ✅ confirmadas (ver §2)
Última revisión de compatibilidad: 2026-09-22 (Expo 57 docs + AI SDK v7)

---

## 1. Problema

El asistente no interpreta lenguaje natural; es un clasificador de intenciones de una pasada con capas redundantes que se pisan:

1. Prompt con allowlist de 9 acciones — `src/features/asistente-ia/api/aiInterpretationService.ts:438-468`
2. Zod `superRefine` que exige "producto nombrado" y bloquea filtros — mismo archivo `:53-85`
3. Cadena de 9 `if` sobre `response.accion` — `src/features/asistente-ia/api/voiceCommandApi.ts:342-606` (default → *"No se pudo identificar la operación"* `:606`)
4. Fallback heurístico con ~100 stopwords (`BROAD_PRODUCT_QUERY_TOKENS:5-29`) y 28 frases literales (`LISTAR_INVENTORY_PHRASES:184-211`)

Fallos observados en demo:

- *"Quiero vender dos sombras para cejas"* → la frase completa se usa como nombre de producto en búsqueda ILIKE → *"No se encontró el producto…"* (`voiceCommandApi.ts:585`)
- *"cuánto stock me queda de labiales"* → stopword/allowlist falla → mismo error
- *"quiero agregarle 10 unidades"* → *"No se pudo identificar la operación"* (`:606`)
- Mensajes robóticos hardcodeados: `RETRY_HINT = "Corregí el texto abajo y enviá de nuevo."` (`VoiceCommandView.tsx:48`)
- Cero tool calling, cero streaming (`aiGateway.ts:260-342`: temp=0, `json_object`, sin `tools`), historial solo 8 msgs de texto, el modelo no puede actuar — solo etiqueta y TypeScript hace todo con regex.

## 2. Decisiones confirmadas

| Decisión | Respuesta del usuario |
|---|---|
| Arquitectura | **Cliente puro** — solo Supabase + Expo, sin backend. Vercel AI SDK client-side con OpenRouter/custom providers. Incluye formularios por voz. |
| Streaming | **ON** — spike 0.3 en device (2026-09-22): `openrouter/free`, 9 chunks, contó 1–5. Chat usa `streamText`; si el stream falla, `generateText`. |
| Fallback sin claves/proveedores caídos | **Eliminar el heurístico**. Sin clave → *"Configurá tu IA en Ajustes"*; proveedores caídos → mensaje amable. Cero interpretación local. |
| Seguridad (no negociable) | Tools `propose_*` **nunca escriben**; `SaleConfirmationCard` + recheck `canExecuteAssistantWrite` antes de cada escritura; RLS/RPC de Supabase sigue siendo la autoridad final. |

## 3. Compatibilidad verificada (Expo 57 + AI SDK v7)

| Requisito | Estado en Expo 57 / proyecto |
|---|---|
| `expo/fetch` con streaming SSE | ✅ nativo — es el `fetch` global default en Android/iOS |
| `structuredClone`, `TextEncoder/Decoder`, `ReadableStream`, `TextEncoderStream` | ✅ globales y nativos (los polyfills de la guía AI SDK son para Expo ≤56; Expo recomienda eliminar polyfills de `structuredClone`) |
| OpenRouter | ✅ `@openrouter/ai-sdk-provider` (oficial) o `@ai-sdk/openai-compatible` con `baseURL` |
| Groq / Cerebras / custom | ✅ `createOpenAICompatible({ baseURL, apiKey })` — mismo patrón que el gateway actual |
| Gemini | ✅ `@ai-sdk/google` |
| Tools + `stopWhen` + forms (`Output.object`) | ✅ APIs de `ai@7`, corren client-side con claves BYOK en SecureStore |
| Zod | ✅ proyecto tiene `zod@4.6.5` (ai@7 acepta Standard Schema / `zod/v4`) |

Salvedades:

1. `ai@7` es **ESM-only** y pide Node 22+ *en servidor*; en Metro/RN usa fetch isomórfico — verificar con smoke (Fase 0). Fallback posible: `ai@6` (API casi idéntica).
2. **Streaming directo client→proveedor** tuvo bugs históricos (vercel/ai#5074, #7267). No bloquea: el loop de tools con `generateText` sin stream ya resuelve lo importante. Spike en device decide.

## 4. Fases

### Fase 0 — Spike de verificación (INICIAR AQUÍ)

Objetivo: probar `ai@7` + providers + tool loop + forms en Node, y streaming con `expo/fetch` en device, **sin tocar el asistente**.

- [x] **0.1 Instalar**
  ```
  pnpm add ai @ai-sdk/openai-compatible @ai-sdk/google @openrouter/ai-sdk-provider
  ```
  Verificar `pnpm ls ai` y warnings de peer-deps.
- [x] **0.2 Smoke Node** (imports OK; A–D skipped sin clave en el entorno) — crear `tests/ai-sdk-spike.test.mjs` (skip si no hay `GROQ_API_KEY` u `OPENROUTER_API_KEY` en el entorno; las claves viven en SecureStore, exportar una para el spike):
  - **A. Tool loop**: `generateText({ instructions, messages, tools: { search_products(mock) }, stopWhen: isStepCount(3) })` con el prompt real fallido *"Quiero vender dos sombras para cejas"* → asertar tool call o texto no vacío (sin allowlist, sin crash).
  - **B. Custom provider**: `createOpenAICompatible({ baseURL: 'https://openrouter.ai/api/v1' })` → respuesta simple.
  - **C. Form por voz**: `generateText({ output: Output.object({ schema: camposProducto }) })` → schema Zod válido (`Output.object` reemplaza al deprecado `generateObject`).
  - **D. Streaming Node**: `streamText` + consumir `textStream` → acumula ≥1 chunk.
  - Script: `"test:spike": "node --test tests/ai-sdk-spike.test.mjs"` — **fuera de `pnpm test`** (no romper CI sin claves).
- [x] **0.3 Streaming en device** — 2026-09-22, Ajustes → *Probar streaming IA*: **OK** `openrouter/free`, **9 chunks**, texto `1\n2\n3\n4\n5`. Botón temporal en `AISettingsScreen.tsx` (`ajustes-ia.tsx` reexporta).
- [x] **0.4 Registro** — anotar versiones exactas + resultado A–D + decisión streaming ON/OFF en este documento (§7).

### Fase 1 — Agente con tools (elimina lo hardcodeado)

- [x] **1.1** `src/features/asistente-ia/lib/aiSdkProviders.ts` — factory de modelos desde SecureStore (groq / cerebras / openrouter / gemini + custom baseURL) reutilizando el orden de fallback de `secureKeyStore.ts`.
- [x] **1.2** `src/features/asistente-ia/lib/assistantTools.ts` — registry chica filtrada por rol (`can()` de `permissions.ts`):
  - lectura: `search_products`, `get_stock`, `list_low_stock`, `get_sales_today`, `list_inventory`
  - propuestas (**NO escriben**): `propose_sale`, `propose_product_registration` → `execute` solo valida stock/sucursal y devuelve payload → `SaleConfirmationCard` existente.
  - Descripciones con cuándo usar / cuándo NO usar; errores estructurados `{ error, message, suggestion }` para auto-corrección del modelo.
- [x] **1.3** `src/features/asistente-ia/api/assistantAgent.ts` — `generateText({ instructions, messages, tools, stopWhen: isStepCount(5) })` → texto natural del modelo + detección de propuestas para las cards. (En v7: `instructions` reemplaza a `system`.)
- [x] **1.4** Re- cablear `VoiceCommandView.enviar` (`:342-528`) → agente. Mantener: persistencia (`assistantSessionPersistence.ts`), reducer (`chatSession.ts`), ThinkingTrace, pre-check de stock (`procerarLineasVenta:202-273`), oversell block, submission lock.
- [x] **1.5 SEGURIDAD (invariantes — no tocar)**:
  - recheck `canExecuteAssistantWrite` antes de cada escritura: `VoiceCommandView.tsx:533` (confirmar), `:574` (carrito), `:623` (alta producto)
  - scope de sucursal: `resolveAssistantBranch` / `allowedAssistantBranches` (`assistantAuthorization.ts`)
  - RLS/RPC Supabase = autoridad final; nada de `user_metadata` para autorización.
- [x] **1.6 ELIMINAR**:
  - `src/features/asistente-ia/api/aiInterpretationService.ts` — **archivo completo** (allowlist, superRefine, `esConsultaProductoEspecifica`, `BROAD_PRODUCT_QUERY_TOKENS`, `LISTAR_INVENTORY_PHRASES`, `interpretarHeuristica`, `interpretarTextoVoz`)
  - Cadena de 9 `if` de `interpretarVoz` — `voiceCommandApi.ts:280-607` (dejar solo el seam `AssistantReadApi` que usan las tools)
  - `RETRY_HINT` — `VoiceCommandView.tsx:48` (el modelo redacta la clarificación)
  - Shims deprecated: `src/lib/api.ts:8-9` (`interpretarTexto`), `src/services/aiInterpretationService.ts`
  - Heurístico de registro en `voiceRegistrationService.ts` (hecho en Fase 2: `Output.object`)
  - **Sin heurístico de reemplazo.** Sin clave → mensaje de configuración; proveedores caídos → mensaje amable; nunca interpretación local.
- [x] **1.7 Fast-path determinista permitido (único)**: `normalizarCodigoSKU` (`productMatching.ts:16`) — reparación de dictado STT, no filtrado de intención. Correcciones *"sino 5"* las maneja el modelo con el historial.
- [x] **1.8 Tests** — reemplazar asserts de allowlist por registry + loop (mock de proveedor):
  - `tests/behavior.test.mjs:221,237,246,549` (interpretarHeuristica) → eliminar/adaptar
  - `tests/behavior.test.mjs:897,922,939,975,997,1025` (allowlist/dispatch) → adaptar a tools
  - `tests/contracts.test.mjs:18-22` (`VoiceInterpretationSchema`) → schema de tools
  - `tests/assistant-correctness.test.mjs:49` (prompt contract "periodo hoy") → adaptar
  - Nuevo: test de loop del agente, test de filtrado de tools por rol, test de que `propose_sale` no escribe
- [x] **1.9 Verificación**: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm test:spike`.

### Fase 2 — Formularios por voz + visión

- [x] **2.1** Registro de producto vía `propose_product_registration` con `Output.object({ schema: camposProducto })` (Zod) — reemplaza `voiceRegistrationService` + su heurístico.
- [x] **2.2** `visualRecognitionService.ts` migrado al mismo factory de providers (conservar fallback de imagen).

### Fase 3 — Streaming (solo si el spike 0.3 lo aprueba)

- [x] **3.1** `streamText` + `expo/fetch` en el chat; ThinkingTrace como fallback de percepción.
- [x] **3.2** Spike **no falló**. Queda fallback a `generateText` solo si un turno concreto no produce texto/tools.

## 5. Mapa de archivos

| Acción | Archivo |
|---|---|
| Crear | `src/features/asistente-ia/lib/aiSdkProviders.ts` |
| Crear | `src/features/asistente-ia/lib/assistantTools.ts` |
| Crear | `src/features/asistente-ia/api/assistantAgent.ts` |
| Crear | `tests/ai-sdk-spike.test.mjs` (Fase 0) |
| Modificar | `src/features/asistente-ia/screens/VoiceCommandView.tsx` (enviar → agente; quitar RETRY_HINT) |
| Modificar | `src/features/asistente-ia/api/voiceCommandApi.ts` (dejar solo seam de lectura) |
| Modificar | `src/app/ajustes-ia.tsx` (reexporta `AISettingsScreen`; el botón spike temporal se quitó tras el PASS de 0.3) |
| Modificar | `package.json` (deps + script `test:spike`) |
| Modificar | `tests/behavior.test.mjs`, `tests/contracts.test.mjs`, `tests/assistant-correctness.test.mjs` |
| **Eliminar** | `src/features/asistente-ia/api/aiInterpretationService.ts` |
| **Eliminar** | `src/services/aiInterpretationService.ts` (shim) |
| Conservar intacto | `assistantAuthorization.ts`, `assistantSessionPersistence.ts`, `chatSession.ts`, `SaleConfirmationCard.tsx`, `productMatching.ts`, `aiGateway.ts` (`testProviderConnection`; visión/registro ya no lo usan) |

## 6. Comandos de verificación

```
pnpm test                 # suite principal
pnpm test:spike           # smoke ai@7 (requiere clave exportada)
pnpm exec tsc --noEmit    # tipos
pnpm lint                 # expo lint
```

## 7. Registro de resultados (completar en Fase 0)

- Versiones instaladas: `ai@7.0.108`, `@ai-sdk/openai-compatible@3.0.53`, `@ai-sdk/google@4.0.76`, `@openrouter/ai-sdk-provider@3.1.0`, `zod@4.6.5`. Peer-deps: único warning preexistente (`@react-native/metro-config` 0.87.1 vs 0.86.3), no de AI SDK.
- Smoke Node (imports, sin clave): **PASS** — `generateText`, `streamText`, `isStepCount`, `Output.object`, `tool`, `createOpenAICompatible`, `createGoogleGenerativeAI`, `createOpenRouter`.
- Smoke A (tool loop): **SKIP** — falta `GROQ_API_KEY` u `OPENROUTER_API_KEY` en el entorno (las claves viven en SecureStore).
- Smoke B (OpenRouter custom): **SKIP** — falta `OPENROUTER_API_KEY`.
- Smoke C (Output.object / form): **SKIP** — misma razón que A.
- Smoke D (streaming Node): **SKIP** — misma razón que A.
- Streaming en device (0.3): **PASS** — 2026-09-22, Expo device, botón *Probar streaming IA*. Proveedor/modelo: `openrouter/free`. Chunks: **9**. Texto recibido:
  ```
  1
  2
  3
  4
  5
  ```
  Decisión Fase 3: **ON**. El chat usa `streamText` + `expo/fetch`; si un turno no produce texto/tools (o tira), cae a `generateText`. ThinkingTrace cubre la espera sin chunks.
- Fase 2: `interpretarRegistroProducto` usa `generateStructuredOutput` (`Output.object` + factory BYOK). Se eliminó `interpretarHeuristicaRegistro`. Visión envía la foto como `file` part; ya no inventa los primeros 3 productos del catálogo. `completeChatJSON` queda en `aiGateway.ts` solo para `testProviderConnection` y el test de fallback del gateway.
- Desviaciones del plan:
  - `pnpm add` / `pnpm install` pueden fallar en este Windows al crear symlinks (`react-native-reanimated` / `worklets`, Acceso denegado). Dependencias quedaron en `package.json` + `pnpm-lock.yaml` (`pnpm install --lockfile-only`); `node_modules` ya tenía los tarballs. Scripts: `pnpm test` / `pnpm test:spike` / `pnpm exec tsc` (sin reinstalar).
  - `isStepCount` es el nombre v7 (`stepCountIs` queda como alias).
  - Botón 0.3 vivía en `AISettingsScreen.tsx`; se eliminó junto con `aiSdkStreamingSpike.ts` después del PASS.

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| `ai@7` ESM-only en Metro | Expo 57 soporta ESM; fallback `ai@6` |
| Peer-deps de providers incompatibles | Ajustar versión según `pnpm ls` en 0.1 |
| Sin clave en entorno CI | `test:spike` con skip condicional; fuera de `pnpm test` |
| `streamText` falla en RN (histórico) | Spike 0.3 + fallback automático a `generateText` en el chat |
| Tools escriben sin permiso | Invariantes §4.1.5 + tests de que `propose_*` no escribe |
