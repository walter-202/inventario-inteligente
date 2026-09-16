import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { loadTsModule } from "./load-ts.mjs";

process.env.TZ = "America/Caracas";

test("payment schema accepts the documented values and rejects lowercase qr", () => {
  const { RegistrarVentaSchema } = loadTsModule("src/features/ventas/api/ventasApi.ts");
  const base = { sucursal_id: 1, productos: [{ producto_id: 1, cantidad: 1 }] };
  for (const metodo_pago of ["efectivo", "QR", "tarjeta", "transferencia"]) {
    assert.equal(RegistrarVentaSchema.safeParse({ ...base, metodo_pago }).success, true, metodo_pago);
  }
  assert.equal(RegistrarVentaSchema.safeParse({ ...base, metodo_pago: "qr" }).success, false);
});

test("voice duplicate products are aggregated before stock checks", () => {
  const { aggregateVoiceLines, AmbiguousVoiceLineError } = loadTsModule("src/features/asistente-ia/lib/voiceLines.ts");
  const product = { id: 7, nombre: "Chompa", codigo: "SKU-7", categoria: "Ropa", precio: 10, cantidad: 99 };
  const result = aggregateVoiceLines([
    { producto: product, cantidadSolicitada: 2 },
    { producto: { ...product }, cantidadSolicitada: 3 },
  ]);
  assert.deepEqual(result.map((line) => [line.producto.id, line.cantidadSolicitada]), [[7, 5]]);
  assert.throws(() => aggregateVoiceLines([
    { producto: product, cantidadSolicitada: 1 },
    { producto: { ...product, precio: 11 }, cantidadSolicitada: 1 },
  ]), AmbiguousVoiceLineError);
});

test("dashboard buckets a Caracas 22:00 sale into the local calendar day", () => {
  const { getDashboardCalendar, bucketSalesByLocalDay, localDateKey } = loadTsModule("src/features/dashboard/lib/dateBuckets.ts");
  const now = new Date("2026-09-16T22:00:00-04:00");
  const calendar = getDashboardCalendar(now);
  assert.equal(calendar.days.at(-1).date, "2026-09-16");
  assert.equal(localDateKey(new Date(calendar.endExclusive.getTime() - 1)), "2026-09-16");
  bucketSalesByLocalDay(calendar.days, [{ fecha: "2026-09-17T01:30:00.000Z", total: 25 }]);
  assert.equal(calendar.days.at(-1).total, 25);
});

test("pagination helper fetches every row beyond the Supabase 1000-row page", async () => {
  const { fetchAllPages } = loadTsModule("src/shared/lib/pagination.ts");
  const rows = Array.from({ length: 2005 }, (_, id) => id);
  const ranges = [];
  const result = await fetchAllPages(async (from, to) => {
    ranges.push([from, to]);
    return rows.slice(from, to + 1);
  });
  assert.equal(result.length, 2005);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("scanner distinguishes no-product from lookup failures", () => {
  const { ProductoNoEncontradoError, ProductoLookupError, esProductoNoEncontrado } = loadTsModule("src/features/productos/lib/productLookupErrors.ts");
  assert.equal(esProductoNoEncontrado(new ProductoNoEncontradoError()), true);
  assert.equal(esProductoNoEncontrado(new ProductoLookupError("network")), false);
});

test("product boundary validation rejects blank numeric form fields", () => {
  const { ProductoInputSchema } = loadTsModule("src/features/productos/api/productosApi.ts");
  const input = { nombre: "Producto", codigo: "SKU-1", categoria: "Ropa", precio: Number.NaN, cantidad: Number.NaN, sucursal_id: 1 };
  assert.equal(ProductoInputSchema.safeParse(input).success, false);
  assert.equal(ProductoInputSchema.safeParse({ ...input, precio: 10, cantidad: 2 }).success, true);
});

test("voice product matching can resolve a later-page exact code and rejects fuzzy ambiguity", () => {
  const { matchProduct } = loadTsModule("src/features/asistente-ia/lib/productMatching.ts");
  const firstPageProduct = { id: 1, nombre: "Chompa azul", codigo: "SKU-1", categoria: "Ropa", precio: 10, cantidad: 1 };
  const laterPageProduct = { id: 2, nombre: "Chompa roja", codigo: "SKU-2", categoria: "Ropa", precio: 12, cantidad: 1 };
  const exact = matchProduct([firstPageProduct, laterPageProduct], "SKU-2");
  assert.equal(exact.kind, "match");
  assert.equal(exact.product.id, 2);

  const ambiguous = matchProduct([firstPageProduct, laterPageProduct], "chompa");
  assert.equal(ambiguous.kind, "ambiguous");
  assert.deepEqual(ambiguous.products.map((product) => product.id), [1, 2]);
});

test("sale submission boundary blocks same-tick deferred mutations and releases after settlement", async () => {
  const { createSubmissionLock, createGuardedMutation, VentaSubmissionInProgressError } = loadTsModule("src/features/ventas/lib/submissionLock.ts");
  const lock = createSubmissionLock();
  const queued = [];
  let executorCalls = 0;
  const executor = {
    mutate(variables, options) {
      executorCalls += 1;
      queued.push({ variables, options });
    },
    mutateAsync() {
      return Promise.resolve("ok");
    },
  };
  const boundary = createGuardedMutation(executor, lock);
  let successCallbacks = 0;

  boundary.mutate({ id: 1 }, { onSuccess: () => { successCallbacks += 1; } });
  boundary.mutate({ id: 2 }, { onSuccess: () => { successCallbacks += 1; } });

  assert.equal(executorCalls, 1);
  assert.equal(lock.locked, true);
  assert.equal(successCallbacks, 0);
  await Promise.resolve();
  queued[0].options.onSuccess({ id: 1 }, queued[0].variables);
  assert.equal(successCallbacks, 1);
  assert.equal(lock.locked, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  lock.release();
  assert.equal(lock.locked, false);

  boundary.mutate({ id: 3 }, { onSuccess: () => { successCallbacks += 1; } });
  assert.equal(executorCalls, 2);
  lock.release();

  const failedBoundary = createGuardedMutation({
    mutate() {
      throw new Error("setup failed");
    },
    mutateAsync() {
      return Promise.reject(new Error("async failed")).finally(() => lock.release());
    },
  }, lock);
  assert.throws(() => failedBoundary.mutate({ id: 4 }), /setup failed/);
  assert.equal(lock.locked, false);
  await assert.rejects(failedBoundary.mutateAsync({ id: 5 }), /async failed/);
  assert.equal(lock.locked, false);

  const deferredAsync = createGuardedMutation({
    mutate() {},
    mutateAsync() {
      return new Promise((resolve) => setTimeout(() => {
        lock.release();
        resolve("ok");
      }, 0));
    },
  }, lock);
  const pending = deferredAsync.mutateAsync({ id: 6 });
  await assert.rejects(deferredAsync.mutateAsync({ id: 7 }), VentaSubmissionInProgressError);
  await pending;
  assert.equal(lock.locked, false);
});

test("sale submission boundary keeps a reentrant second sale locked after async success", async () => {
  const { createSubmissionLock, createGuardedMutation } = loadTsModule("src/features/ventas/lib/submissionLock.ts");
  const lock = createSubmissionLock();
  let executorCalls = 0;
  let reentrantAccepted = false;
  const boundary = createGuardedMutation({
    mutate() {
      executorCalls += 1;
    },
    mutateAsync(variables, options) {
      executorCalls += 1;
      return new Promise((resolve) => setTimeout(() => {
        // Simulate React Query's hook-level onSettled after invalidation, then
        // the per-call success callback that starts the next sale.
        lock.release();
        options.onSuccess({ id: 1 }, variables);
        reentrantAccepted = executorCalls === 2;
        resolve({ id: 1 });
      }, 0));
    },
  }, lock);

  const first = boundary.mutateAsync({ id: 1 }, {
    onSuccess() {
      boundary.mutate({ id: 2 });
    },
  });
  await first;

  assert.equal(reentrantAccepted, true);
  assert.equal(lock.locked, true);
  lock.release();
  assert.equal(lock.locked, false);
});

test("secure key store saves and retrieves provider keys in fallback memory store", async () => {
  const { setApiKey, getApiKey, deleteApiKey, setPreferredMode, getPreferredMode, setCustomModel, getCustomModel } = loadTsModule("src/shared/lib/secureKeyStore.ts");

  await setApiKey("groq", "gsk_test_12345");
  assert.equal(await getApiKey("groq"), "gsk_test_12345");

  await setCustomModel("groq", "llama-3.1-8b-instant");
  assert.equal(await getCustomModel("groq"), "llama-3.1-8b-instant");

  await setPreferredMode("cerebras");
  assert.equal(await getPreferredMode(), "cerebras");

  await deleteApiKey("groq");
  assert.equal(await getApiKey("groq"), null);
});

test("AI gateway gracefully falls back to heuristic when no API keys are present", async () => {
  const { completeChatJSON } = loadTsModule("src/features/asistente-ia/lib/aiGateway.ts");
  const { z } = loadTsModule("node_modules/zod/index.js");

  const schema = z.object({ test: z.string() });
  const result = await completeChatJSON({
    systemPrompt: "Test prompt",
    userMessage: "Test user message",
    schema,
  });

  assert.equal(result.provider, "heuristic");
  assert.equal(result.data, null);
});

test("voice registration service extracts fields via heuristic when gateway falls back", async () => {
  const { interpretarRegistroProducto } = loadTsModule("src/features/asistente-ia/api/voiceRegistrationService.ts");

  const phrase = "registrar blusa de seda roja código BLU-100 precio 150 cantidad 25 categoría Blusas";
  const result = await interpretarRegistroProducto(phrase);

  assert.equal(result.codigo, "BLU-100");
  assert.equal(result.precio, 150);
  assert.equal(result.cantidad, 25);
  assert.equal(result.categoria, "Blusas");
});

test("voice assistant heuristic extracts stock query and branch correctly", () => {
  const { interpretarHeuristica } = loadTsModule("src/features/asistente-ia/api/aiInterpretationService.ts");

  const query1 = "¿cuánto stock queda de Jean Mom Fit en San Miguel?";
  const res1 = interpretarHeuristica(query1);
  assert.equal(res1.accion, "consulta_stock");
  assert.equal(res1.consulta?.producto?.toLowerCase(), "jean mom fit");
  assert.equal(res1.consulta?.sucursal, "san miguel");

  const query2 = "¿cuánto stock hay de chompa roja?";
  const res2 = interpretarHeuristica(query2);
  assert.equal(res2.accion, "consulta_stock");
  assert.equal(res2.consulta?.producto?.toLowerCase(), "chompa roja");
  assert.equal(res2.consulta?.sucursal, null);
});

test("voice assistant heuristic detects catalog registration intent", () => {
  const { interpretarHeuristica } = loadTsModule("src/features/asistente-ia/api/aiInterpretationService.ts");

  const res1 = interpretarHeuristica("quiero registrar una prenda nueva, es una chompa de alpaca código CHO-520");
  assert.equal(res1.accion, "registro_producto");

  const res2 = interpretarHeuristica("vender 2 Jean Mom Fit");
  assert.equal(res2.accion, "venta");
});
test("voice assistant heuristic extracts daily sales query intent and branch correctly", () => {
  const { interpretarHeuristica } = loadTsModule("src/features/asistente-ia/api/aiInterpretationService.ts");

  const query1 = "¿cuánto se vendió hoy?";
  const res1 = interpretarHeuristica(query1);
  assert.equal(res1.accion, "consulta_ventas");
  assert.equal(res1.consulta?.periodo, "hoy");
  assert.equal(res1.consulta?.sucursal, null);

  const query2 = "resumen de ventas de hoy en Comercio";
  const res2 = interpretarHeuristica(query2);
  assert.equal(res2.accion, "consulta_ventas");
  assert.equal(res2.consulta?.periodo, "hoy");
  assert.equal(res2.consulta?.sucursal, "comercio");
});

test("voice SKU normalization repairs dictated codes before matching", () => {
  const { normalizarCodigoSKU, pareceSKU, matchProduct } = loadTsModule("src/features/asistente-ia/lib/productMatching.ts");

  assert.equal(normalizarCodigoSKU("jea 001"), "jea-001");
  assert.equal(normalizarCodigoSKU("JEA_guion_001"), "jea-001");
  assert.equal(pareceSKU("jea 001"), true);
  assert.equal(pareceSKU("chompa"), false);

  const product = { id: 9, nombre: "Jean Mom Fit", codigo: "JEA-001", categoria: "Pantalones", precio: 185, cantidad: 10 };
  const dictated = matchProduct([product], "jea 001");
  assert.equal(dictated.kind, "match");
  assert.equal(dictated.product.id, 9);
});

test("voice transcription stabilizer collapses spaces and repairs SKUs", () => {
  const { estabilizarTranscripcion } = loadTsModule("src/features/asistente-ia/hooks/useVoiceCommand.ts");

  assert.equal(estabilizarTranscripcion("  vender   2  jea 001  "), "vender 2 jea-001");
  assert.equal(estabilizarTranscripcion("stock de  chompa   roja"), "stock de chompa roja");
});

test("chat sessions live short: complete locks history and auto-cancels on new", () => {
  const { chatReducer, chatInicial, objetivoDeResultado } = loadTsModule("src/features/asistente-ia/lib/chatSession.ts");

  assert.equal(objetivoDeResultado("venta"), "venta");
  assert.equal(objetivoDeResultado("consulta_stock"), "consulta");
  assert.equal(objetivoDeResultado("registro_producto"), "registro");
  assert.equal(objetivoDeResultado("desambiguacion"), "indefinido");

  const sesion = { id: "s1", objetivo: "venta", estado: "activa", resumen: null, createdAt: 1, updatedAt: 1 };
  let state = chatReducer(chatInicial, { type: "nueva-sesion", session: sesion });
  assert.equal(state.activeSessionId, "s1");

  state = chatReducer(state, {
    type: "agregar-mensaje",
    sessionId: "s1",
    message: { id: "m1", role: "usuario", texto: "vender 2 chompas" },
    updatedAt: 2,
  });
  assert.equal(state.messages.s1.length, 1);

  state = chatReducer(state, { type: "completar-sesion", sessionId: "s1", resumen: "Venta 2× Chompa", updatedAt: 3 });
  assert.equal(state.sessions[0].estado, "completada");
  assert.equal(state.activeSessionId, null);

  // Completed sessions are read-only.
  const frozen = chatReducer(state, {
    type: "agregar-mensaje",
    sessionId: "s1",
    message: { id: "m2", role: "usuario", texto: "sino 5" },
    updatedAt: 4,
  });
  assert.equal(frozen.messages.s1.length, 1);

  // A new session auto-cancels a still-active one.
  let active = chatReducer(chatInicial, {
    type: "nueva-sesion",
    session: { id: "a", objetivo: "indefinido", estado: "activa", resumen: null, createdAt: 1, updatedAt: 1 },
  });
  active = chatReducer(active, {
    type: "nueva-sesion",
    session: { id: "b", objetivo: "indefinido", estado: "activa", resumen: null, createdAt: 2, updatedAt: 2 },
  });
  assert.equal(active.sessions.find((s) => s.id === "a").estado, "cancelada");
  assert.equal(active.activeSessionId, "b");
});

test("speech loader informs instead of crashing when the native module is missing", async () => {
  const { loadSpeechRecognitionAsync, getSpeechRecognitionModule } = loadTsModule("src/shared/lib/speechRecognition.ts");

  const mod = await loadSpeechRecognitionAsync();
  assert.equal(mod === null || typeof mod.ExpoSpeechRecognitionModule === "object", true);
  // Sync view stays consistent with the async attempt (null in Node, module on device).
  assert.equal(getSpeechRecognitionModule() === null, mod === null);
});

test("chat undo restores a deleted session with its messages", () => {
  const { chatReducer, chatInicial } = loadTsModule("src/features/asistente-ia/lib/chatSession.ts");
  const sesion = { id: "u", objetivo: "venta", estado: "activa", resumen: null, createdAt: 1, updatedAt: 1 };

  let state = chatReducer(chatInicial, { type: "nueva-sesion", session: sesion });
  state = chatReducer(state, {
    type: "agregar-mensaje",
    sessionId: "u",
    message: { id: "m1", role: "usuario", texto: "vender 2 chompas" },
    updatedAt: 2,
  });
  const papelera = { session: state.sessions[0], messages: state.messages.u };
  state = chatReducer(state, { type: "eliminar-sesion", sessionId: "u" });
  assert.equal(state.sessions.length, 0);
  assert.equal(state.activeSessionId, null);

  state = chatReducer(state, { type: "restaurar-sesion", session: papelera.session, messages: papelera.messages });
  assert.equal(state.sessions.length, 1);
  assert.equal(state.sessions[0].estado, "activa");
  assert.equal(state.activeSessionId, "u");
  assert.equal(state.messages.u.length, 1);

  // Restoring twice does not duplicate.
  const once = chatReducer(state, { type: "restaurar-sesion", session: papelera.session, messages: papelera.messages });
  assert.equal(once.sessions.length, 1);
});

test("chat drawer can resume cancelled sessions and delete any session", () => {
  const { chatReducer, chatInicial } = loadTsModule("src/features/asistente-ia/lib/chatSession.ts");
  const mk = (id, at) => ({ id, objetivo: "venta", estado: "activa", resumen: null, createdAt: at, updatedAt: at });

  let state = chatReducer(chatInicial, { type: "nueva-sesion", session: mk("a", 1) });
  state = chatReducer(state, { type: "nueva-sesion", session: mk("b", 2) });
  assert.equal(state.sessions.find((s) => s.id === "a").estado, "cancelada");

  // Resume a cancelled session.
  state = chatReducer(state, { type: "reanudar-sesion", sessionId: "a", updatedAt: 3 });
  assert.equal(state.sessions.find((s) => s.id === "a").estado, "activa");
  assert.equal(state.activeSessionId, "a");
  assert.equal(state.sessions.find((s) => s.id === "b").estado, "cancelada");

  // Completed sessions cannot resume.
  state = chatReducer(state, { type: "completar-sesion", sessionId: "a", resumen: "Venta 1× X", updatedAt: 4 });
  const locked = chatReducer(state, { type: "reanudar-sesion", sessionId: "a", updatedAt: 5 });
  assert.equal(locked.sessions.find((s) => s.id === "a").estado, "completada");
  assert.equal(locked.activeSessionId, null);

  // Delete removes session and its messages.
  const withMsg = chatReducer(chatInicial, { type: "nueva-sesion", session: mk("c", 1) });
  const filled = chatReducer(withMsg, {
    type: "agregar-mensaje",
    sessionId: "c",
    message: { id: "m1", role: "usuario", texto: "hola" },
    updatedAt: 2,
  });
  const deleted = chatReducer(filled, { type: "eliminar-sesion", sessionId: "c" });
  assert.equal(deleted.sessions.length, 0);
  assert.equal(deleted.messages.c, undefined);
  assert.equal(deleted.activeSessionId, null);
});

test("mobile build configuration contains valid EAS preview profile and Android package", () => {
  const easPath = resolve("eas.json");
  assert.equal(existsSync(easPath), true);
  const easConfig = JSON.parse(readFileSync(easPath, "utf-8"));
  assert.equal(easConfig.build?.preview?.android?.buildType, "apk");
  assert.equal(easConfig.build?.development?.developmentClient, true);

  const appPath = resolve("app.json");
  const appConfig = JSON.parse(readFileSync(appPath, "utf-8"));
  assert.equal(appConfig.expo?.android?.package, "com.lidemoda.app");
  assert.equal(appConfig.expo?.android?.versionCode, 1);
  assert.deepEqual(appConfig.expo?.android?.permissions, ["CAMERA", "RECORD_AUDIO"]);
});

test("product update schema validates editable fields and rejects invalid prices", () => {
  const { ActualizarProductoSchema } = loadTsModule("src/features/productos/api/productosApi.ts");

  const valid = {
    nombre: "Jean Mom Fit Clásico",
    codigo: "JEA-001",
    categoria: "Pantalones",
    precio: 185.5,
  };
  assert.equal(ActualizarProductoSchema.safeParse(valid).success, true);

  // Rejects empty name
  assert.equal(ActualizarProductoSchema.safeParse({ ...valid, nombre: "" }).success, false);
  // Rejects empty sku
  assert.equal(ActualizarProductoSchema.safeParse({ ...valid, codigo: "   " }).success, false);
  // Rejects negative price
  assert.equal(ActualizarProductoSchema.safeParse({ ...valid, precio: -10 }).success, false);
  // Rejects NaN price
  assert.equal(ActualizarProductoSchema.safeParse({ ...valid, precio: Number.NaN }).success, false);
});
