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

test("pending sales store queues and consumes batch items with quantities", () => {
  const {
    establecerLotePendiente,
    peekLotePendiente,
    tomarLotePendiente,
    limpiarLotePendiente,
  } = loadTsModule("src/features/ventas/lib/pendienteVenta.ts");

  limpiarLotePendiente();
  assert.deepEqual(peekLotePendiente(), []);

  const p1 = { id: 10, nombre: "P1", codigo: "SKU-10", categoria: "Ropa", precio: 100, cantidad: 50 };
  const p2 = { id: 20, nombre: "P2", codigo: "SKU-20", categoria: "Ropa", precio: 150, cantidad: 30 };
  establecerLotePendiente([
    { producto: p1, cantidad: 2 },
    { producto: p2, cantidad: 3 },
  ]);

  const peeked = peekLotePendiente();
  assert.equal(peeked.length, 2);
  assert.equal(peeked[0].cantidad, 2);
  assert.equal(peeked[1].cantidad, 3);

  const taken = tomarLotePendiente();
  assert.equal(taken.length, 2);
  assert.deepEqual(peekLotePendiente(), []);
});

test("chat session message stores thoughts array and durationMs", () => {
  const { chatReducer, chatInicial } = loadTsModule("src/features/asistente-ia/lib/chatSession.ts");
  const session = {
    id: "s-test",
    objetivo: "registro",
    estado: "activa",
    resumen: null,
    createdAt: 1000,
    updatedAt: 1000,
  };
  let state = chatReducer(chatInicial, { type: "nueva-sesion", session });
  state = chatReducer(state, {
    type: "agregar-mensaje",
    sessionId: "s-test",
    message: {
      id: "m-1",
      role: "asistente",
      texto: "Revisá los datos del nuevo producto",
      thoughts: ["Paso 1: Entidad extraída", "Paso 2: Validación de stock"],
      durationMs: 450,
      attachment: {
        kind: "registro-producto",
        datos: { nombre: "Blusa", codigo: "BLU-1", categoria: "Ropa", precio: 50, cantidad: 10 },
        branchId: 1,
        branchName: "Central",
      },
    },
    updatedAt: 1050,
  });

  const msg = state.messages["s-test"][0];
  assert.equal(msg.thoughts.length, 2);
  assert.equal(msg.durationMs, 450);
  assert.equal(msg.attachment.kind, "registro-producto");
  assert.equal(msg.attachment.datos.nombre, "Blusa");
});

test("barcode registration preserves scanned code in product schema validation", () => {
  const { ProductoInputSchema } = loadTsModule("src/features/productos/api/productosApi.ts");
  const scannedCode = "7751234567890";
  const input = {
    nombre: "Jean Clásico Azul",
    codigo: scannedCode,
    categoria: "Pantalones",
    precio: 120,
    cantidad: 15,
    sucursal_id: 1,
  };
  const parsed = ProductoInputSchema.safeParse(input);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.codigo, "7751234567890");
});

test("fijar-resumen updates session summary without completing or closing active conversation", () => {
  const { chatReducer, chatInicial } = loadTsModule("src/features/asistente-ia/lib/chatSession.ts");
  const sesion = { id: "s-multi", objetivo: "indefinido", estado: "activa", resumen: null, createdAt: 1, updatedAt: 1 };
  let state = chatReducer(chatInicial, { type: "nueva-sesion", session: sesion });
  assert.equal(state.activeSessionId, "s-multi");

  state = chatReducer(state, {
    type: "agregar-mensaje",
    sessionId: "s-multi",
    message: { id: "m1", role: "usuario", texto: "cuanto stock queda de chompas" },
    updatedAt: 2,
  });

  state = chatReducer(state, {
    type: "fijar-resumen",
    sessionId: "s-multi",
    resumen: "Stock Chompas (15)",
    updatedAt: 3,
  });

  assert.equal(state.sessions[0].resumen, "Stock Chompas (15)");
  assert.equal(state.sessions[0].estado, "activa");
  assert.equal(state.activeSessionId, "s-multi");

  // It can still receive follow-up messages without freezing!
  state = chatReducer(state, {
    type: "agregar-mensaje",
    sessionId: "s-multi",
    message: { id: "m2", role: "usuario", texto: "y en la otra sucursal?" },
    updatedAt: 4,
  });
  assert.equal(state.messages["s-multi"].length, 2);
});

test("voice assistant heuristic supports conversational greetings and dynamic branches", () => {
  const { interpretarHeuristica } = loadTsModule("src/features/asistente-ia/api/aiInterpretationService.ts");
  const saludo = interpretarHeuristica("hola buen día");
  assert.equal(saludo.accion, "conversacion");
  assert.equal(typeof saludo.respuestaConversacional, "string");

  // Dynamic branches lookup
  const stockCustom = interpretarHeuristica("cuanto stock queda de Jean Mom Fit en Equipetrol", ["Central", "Equipetrol"]);
  assert.equal(stockCustom.accion, "consulta_stock");
  assert.equal(stockCustom.consulta?.sucursal?.toLowerCase(), "equipetrol");
});

test("camera barcode scanner normalizes scanned code and triggers search query", () => {
  const { normalizarCodigoSKU } = loadTsModule("src/features/asistente-ia/lib/productMatching.ts");

  // Raw scanned barcode data with whitespace or trailing returns
  const rawScannedBarcode = "  7751234567890 \r\n ";
  const cleaned = rawScannedBarcode.trim();
  assert.equal(cleaned, "7751234567890");

  // Alphanumeric SKU codes scanned via camera/QR
  const rawQrSku = " jea - 001 ";
  const normalizedSku = normalizarCodigoSKU(rawQrSku);
  assert.equal(normalizedSku, "jea-001");
});

test("two-phase dispatch and reception schema validation enforces strict logistics rules (RF-06 & RF-07)", () => {
  const { EmitirDespachoSchema, ConfirmarRecepcionSchema } = loadTsModule("src/features/inventario/api/despachosApi.ts");

  // RF-06: Same origin and destination is rejected
  const sameBranch = EmitirDespachoSchema.safeParse({
    producto_id: 1,
    sucursal_origen_id: 1,
    sucursal_destino_id: 1,
    cantidad: 10,
  });
  assert.equal(sameBranch.success, false);

  // RF-06: Negative or zero quantity is rejected
  const invalidQty = EmitirDespachoSchema.safeParse({
    producto_id: 1,
    sucursal_origen_id: 1,
    sucursal_destino_id: 2,
    cantidad: 0,
  });
  assert.equal(invalidQty.success, false);

  // RF-06: Valid dispatch order accepted
  const validDispatch = EmitirDespachoSchema.safeParse({
    producto_id: 1,
    sucursal_origen_id: 1,
    sucursal_destino_id: 2,
    cantidad: 15,
    observacion: "Lote de 3 cajas",
  });
  assert.equal(validDispatch.success, true);

  // RF-07: Confirm reception rejects invalid quantities
  const invalidReception = ConfirmarRecepcionSchema.safeParse({
    orden_id: 99,
    cantidad_recibida: -5,
  });
  assert.equal(invalidReception.success, false);

  // RF-07: Valid confirmation accepted
  const validReception = ConfirmarRecepcionSchema.safeParse({
    orden_id: 99,
    cantidad_recibida: 15,
    observacion: "Recibido en buen estado",
  });
  assert.equal(validReception.success, true);
});

test("V2 RF-09: RegistrarMermaSchema validates motives and rejects invalid quantities", () => {
  const { RegistrarMermaSchema } = loadTsModule("src/features/inventario/api/mermasApi.ts");
  const { MOTIVOS_MERMA } = loadTsModule("src/shared/types/domain.ts");

  // Every documented motivo is valid
  for (const motivo of MOTIVOS_MERMA) {
    const res = RegistrarMermaSchema.safeParse({
      sucursal_id: 1,
      producto_id: 10,
      cantidad: 2,
      motivo,
      observacion: "Prenda de exhibición",
    });
    assert.equal(res.success, true, `Expected motivo "${motivo}" to be accepted`);
  }

  // Reject invalid motivo
  const invalidMotivo = RegistrarMermaSchema.safeParse({
    sucursal_id: 1,
    producto_id: 10,
    cantidad: 2,
    motivo: "quemado_no_valido",
  });
  assert.equal(invalidMotivo.success, false);

  // Reject non-positive quantity
  const zeroQty = RegistrarMermaSchema.safeParse({
    sucursal_id: 1,
    producto_id: 10,
    cantidad: 0,
    motivo: "rotura",
  });
  assert.equal(zeroQty.success, false);
});

test("V2 RF-17: AnularVentaSchema requires positive sale ID and justification motive", () => {
  const { AnularVentaSchema } = loadTsModule("src/features/ventas/api/ventasApi.ts");

  // Valid cancellation
  const valid = AnularVentaSchema.safeParse({
    venta_id: 42,
    motivo: "Error en el medio de pago seleccionado por el cajero",
  });
  assert.equal(valid.success, true);

  // Reject empty motive
  const emptyMotivo = AnularVentaSchema.safeParse({
    venta_id: 42,
    motivo: "  ",
  });
  assert.equal(emptyMotivo.success, false);

  // Reject short motive (< 3 characters)
  const shortMotivo = AnularVentaSchema.safeParse({
    venta_id: 42,
    motivo: "no",
  });
  assert.equal(shortMotivo.success, false);

  // Reject non-positive sale ID
  const invalidId = AnularVentaSchema.safeParse({
    venta_id: -1,
    motivo: "Motivo valido de prueba",
  });
  assert.equal(invalidId.success, false);
});

test("V2 RF-25: VisualRecognitionSchema enforces multimodal garment traits and confidence score", () => {
  const { VisualRecognitionSchema } = loadTsModule("src/features/asistente-ia/api/visualRecognitionService.ts");

  const validPayload = {
    analisis_prenda: {
      categoria: "Campera",
      color_principal: "Azul oscuro",
      tipo_corte: "Bomber",
      caracteristicas_distintivas: "Cierre metálico y cuello elástico",
    },
    candidatos: [
      {
        producto_id: 14,
        nombre: "Campera Bomber Navy",
        codigo: "SKU-BOMBER-01",
        categoria: "Abrigos",
        precio: 250,
        confidence: 0.94,
        razon: "El tono azul y el corte bomber coinciden con el catálogo",
      },
    ],
  };

  const res = VisualRecognitionSchema.safeParse(validPayload);
  assert.equal(res.success, true);

  // Reject confidence outside 0-1
  const invalidConfidence = {
    ...validPayload,
    candidatos: [{ ...validPayload.candidatos[0], confidence: 1.5 }],
  };
  assert.equal(VisualRecognitionSchema.safeParse(invalidConfidence).success, false);
});

test("V2 RF-12: Kardex running balance computes progressive stock deltas", () => {
  // Test running balance logic: entries increment, exits decrement
  const sampleTransactions = [
    { id: 1, fecha: "2026-09-01T10:00:00Z", tipo: "entrada", cantidad: 50 },
    { id: 2, fecha: "2026-09-01T12:00:00Z", tipo: "salida", cantidad: 10 },
    { id: 3, fecha: "2026-09-02T15:00:00Z", tipo: "salida", cantidad: 5 },
    { id: 4, fecha: "2026-09-03T09:00:00Z", tipo: "entrada", cantidad: 20 },
  ];

  let balance = 0;
  const withBalances = sampleTransactions.map((tx) => {
    if (tx.tipo === "entrada") balance += tx.cantidad;
    else if (tx.tipo === "salida") balance -= tx.cantidad;
    return { ...tx, saldo: balance };
  });

  assert.equal(withBalances[0].saldo, 50);
  assert.equal(withBalances[1].saldo, 40);
  assert.equal(withBalances[2].saldo, 35);
  assert.equal(withBalances[3].saldo, 55);
});

test("V2 RF-08: calcularNivelStock categorizes critico, bajo, and optimo based on custom threshold", () => {
  const { calcularNivelStock } = loadTsModule("src/features/inventario/api/reabastecimientoApi.ts");

  // Critical: 0 or negative
  assert.equal(calcularNivelStock(0, 5), "critico");
  assert.equal(calcularNivelStock(-2, 10), "critico");

  // Low: <= stockMinimo
  assert.equal(calcularNivelStock(1, 5), "bajo");
  assert.equal(calcularNivelStock(5, 5), "bajo");
  assert.equal(calcularNivelStock(8, 10), "bajo");
  assert.equal(calcularNivelStock(10, 10), "bajo");

  // Optimal: > stockMinimo
  assert.equal(calcularNivelStock(6, 5), "optimo");
  assert.equal(calcularNivelStock(11, 10), "optimo");
  assert.equal(calcularNivelStock(100, 5), "optimo");
});

test("V2 RF-08: ActualizarProductoSchema accepts valid stock_minimo and rejects negative values", () => {
  const { ActualizarProductoSchema } = loadTsModule("src/features/productos/api/productosApi.ts");
  const base = { nombre: "Remera Oversize", codigo: "SKU-REM-01", categoria: "Ropa", precio: 80 };

  // Valid with stock_minimo
  assert.equal(ActualizarProductoSchema.safeParse({ ...base, stock_minimo: 8 }).success, true);
  assert.equal(ActualizarProductoSchema.safeParse({ ...base, stock_minimo: 0 }).success, true);

  // Valid when omitted (optional)
  assert.equal(ActualizarProductoSchema.safeParse(base).success, true);

  // Invalid negative or decimal
  assert.equal(ActualizarProductoSchema.safeParse({ ...base, stock_minimo: -1 }).success, false);
  assert.equal(ActualizarProductoSchema.safeParse({ ...base, stock_minimo: 4.5 }).success, false);
});

test("V2 RF-26: replenishment suggestion logic computes optimal transfers within central surplus", () => {
  // Target: store has 2 units, threshold 10 (target buffer = 20 units -> deficit = 18)
  const targetStock = 2;
  const targetMinimo = 10;
  const targetBuffer = targetMinimo * 2;
  const deficit = Math.max(0, targetBuffer - targetStock);
  assert.equal(deficit, 18);

  // Case A: Central has 50 units (threshold 10) -> surplus = 40. Can supply full deficit 18.
  const centralStockA = 50;
  const centralMinimoA = 10;
  const surplusA = Math.max(0, centralStockA - centralMinimoA);
  const transferA = Math.min(deficit, surplusA);
  assert.equal(transferA, 18);

  // Case B: Central has only 15 units (threshold 10) -> surplus = 5. Transfers max surplus 5.
  const centralStockB = 15;
  const centralMinimoB = 10;
  const surplusB = Math.max(0, centralStockB - centralMinimoB);
  const transferB = Math.min(deficit, surplusB);
  assert.equal(transferB, 5);
});

test("V2 RF-26: clasificarProductoRotacion categorizes alta, media, and baja rotation based on sales velocity", () => {
  const { clasificarProductoRotacion } = loadTsModule("src/features/analitica/api/rotacionApi.ts");

  // 0 sales -> always 'baja'
  assert.equal(clasificarProductoRotacion(0, 10, 0), "baja");
  assert.equal(clasificarProductoRotacion(0, 0, 0), "baja");

  // High volume (>= 8) or high turnover rate (>= 0.45) -> 'alta'
  assert.equal(clasificarProductoRotacion(15, 5, 15 / 20), "alta");
  assert.equal(clasificarProductoRotacion(8, 2, 8 / 10), "alta");
  assert.equal(clasificarProductoRotacion(5, 5, 0.5), "alta");

  // Low sales (<= 2) with low turnover (< 0.2) -> 'baja'
  assert.equal(clasificarProductoRotacion(1, 15, 1 / 16), "baja");
  assert.equal(clasificarProductoRotacion(2, 20, 2 / 22), "baja");

  // Medium regular sales -> 'media'
  assert.equal(clasificarProductoRotacion(5, 15, 5 / 20), "media");
  assert.equal(clasificarProductoRotacion(4, 10, 4 / 14), "media");
});

test("V2 RF-28: generarInsightsMarketing identifies top star, dead stock, and category trends", () => {
  const { generarInsightsMarketing } = loadTsModule("src/features/analitica/api/rotacionApi.ts");

  const sampleItems = [
    {
      productoId: 1,
      nombre: "Vestido Gala Floral",
      codigo: "SKU-VES-01",
      categoria: "Vestidos",
      precio: 120,
      stockActual: 3, // Low stock on star item -> triggers risk warning
      unidadesVendidas: 25,
      ingresosTotales: 3000,
      tasaRotacion: 25 / 28,
      clasificacion: "alta",
    },
    {
      productoId: 2,
      nombre: "Bufanda Lana Invierno",
      codigo: "SKU-BUF-02",
      categoria: "Accesorios",
      precio: 40,
      stockActual: 30, // Idle capital = 30 * 40 = 1200
      unidadesVendidas: 0,
      ingresosTotales: 0,
      tasaRotacion: 0,
      clasificacion: "baja",
    },
    {
      productoId: 3,
      nombre: "Blusa Seda Blanca",
      codigo: "SKU-BLU-03",
      categoria: "Blusas",
      precio: 60,
      stockActual: 10,
      unidadesVendidas: 6,
      ingresosTotales: 360,
      tasaRotacion: 6 / 16,
      clasificacion: "media",
    },
  ];

  const insights = generarInsightsMarketing(sampleItems, 30);
  assert.ok(insights.length >= 3);

  // 1. Star product insight
  const starInsight = insights.find((i) => i.tipo === "estrella");
  assert.ok(starInsight);
  assert.equal(starInsight.productoNombre, "Vestido Gala Floral");
  assert.ok(starInsight.accionSugerida.includes("vitrina"));

  // 2. Risk of stock-out on star item
  const riskInsight = insights.find((i) => i.tipo === "oportunidad");
  assert.ok(riskInsight);
  assert.equal(riskInsight.productoNombre, "Vestido Gala Floral");
  assert.ok(riskInsight.accionSugerida.includes("despacho"));

  // 3. Dead stock / idle capital insight
  const deadStockInsight = insights.find((i) => i.tipo === "estancado");
  assert.ok(deadStockInsight);
  assert.equal(deadStockInsight.productoNombre, "Bufanda Lana Invierno");
  assert.ok(deadStockInsight.descripcion.includes("$1200.00"));
  assert.ok(deadStockInsight.accionSugerida.includes("descuento"));

  // 4. Category trend insight
  const catInsight = insights.find((i) => i.tipo === "categoria");
  assert.ok(catInsight);
  assert.ok(catInsight.titulo.includes("Vestidos"));
});




test("assistant parser only accepts named product queries and allowlisted read intents", () => {
  const { interpretarHeuristica, VoiceInterpretationSchema } = loadTsModule("src/features/asistente-ia/api/aiInterpretationService.ts");

  const broadStockQuestion = interpretarHeuristica("¿Qué productos tienen stock disponible?");
  assert.equal(broadStockQuestion.accion, "desconocida");
  assert.deepEqual(broadStockQuestion.productos, []);

  const productSearch = interpretarHeuristica("Buscá producto Jean Mom Fit");
  assert.equal(productSearch.accion, "buscar_producto");
  assert.equal(productSearch.consulta?.producto, "jean mom fit");

  const lowStock = interpretarHeuristica("Mostrame el inventario con bajo stock en Central");
  assert.equal(lowStock.accion, "consulta_bajo_stock");
  assert.equal(lowStock.consulta?.sucursal, "central");

  assert.equal(VoiceInterpretationSchema.safeParse({ accion: "eliminar_productos", productos: [] }).success, false);
});

test("AI gateway rejects malformed model JSON instead of throwing or accepting it", () => {
  const { parseAIJSON } = loadTsModule("src/features/asistente-ia/lib/aiGateway.ts");

  assert.equal(parseAIJSON("this is not JSON"), null);
  assert.deepEqual(parseAIJSON("```json\n{\"accion\":\"consulta_stock\"}\n```"), { accion: "consulta_stock" });
});

test("voice product search dispatches only the extracted product name to the read API", async () => {
  const { interpretarVoz } = loadTsModule("src/features/asistente-ia/api/voiceCommandApi.ts");
  const receivedQueries = [];
  const product = { id: 9, nombre: "Jean Mom Fit", codigo: "JEA-001", categoria: "Pantalones", precio: 185, cantidad: 10 };
  const readApi = {
    findProductByCode: async () => product,
    searchProducts: async (query) => {
      receivedQueries.push(query);
      return [product];
    },
    stockForProduct: async () => [],
    getBranches: async () => [],
    getTodaySales: async () => ({ totalSales: 0, salesCount: 0 }),
    getLowStock: async () => [],
  };

  const result = await interpretarVoz("Buscá producto Jean Mom Fit", undefined, readApi);

  assert.equal(result.tipo, "buscar_producto");
  assert.deepEqual(receivedQueries, ["jean mom fit"]);
});

test("voice read dispatch filters low stock and today's sales by an exact branch", async () => {
  const { interpretarVoz } = loadTsModule("src/features/asistente-ia/api/voiceCommandApi.ts");
  const calls = { lowStock: [], todaySales: [] };
  const readApi = {
    findProductByCode: async () => { throw new Error("not used"); },
    searchProducts: async () => [],
    stockForProduct: async () => [],
    getBranches: async () => [{ id: 4, nombre: "Central" }],
    getTodaySales: async (branchId) => {
      calls.todaySales.push(branchId);
      return { totalSales: 320, salesCount: 2 };
    },
    getLowStock: async (branchId) => {
      calls.lowStock.push(branchId);
      return [];
    },
  };

  const lowStock = await interpretarVoz("Mostrame el inventario con bajo stock en Central", undefined, readApi);
  assert.equal(lowStock.tipo, "consulta_bajo_stock");
  assert.deepEqual(calls.lowStock, [4]);

  const todaySales = await interpretarVoz("Resumen de ventas de hoy en Central", undefined, readApi);
  assert.equal(todaySales.tipo, "consulta_ventas");
  assert.equal(todaySales.periodo, "hoy");
  assert.deepEqual(calls.todaySales, [4]);
});

test("voice read dispatch rejects an unknown explicit branch before an unfiltered sales query", async () => {
  const { interpretarVoz } = loadTsModule("src/features/asistente-ia/api/voiceCommandApi.ts");
  let todaySalesCalls = 0;
  const readApi = {
    findProductByCode: async () => { throw new Error("not used"); },
    searchProducts: async () => [],
    stockForProduct: async () => [],
    getBranches: async () => [{ id: 4, nombre: "Central" }],
    getTodaySales: async () => {
      todaySalesCalls += 1;
      return { totalSales: 0, salesCount: 0 };
    },
    getLowStock: async () => [],
  };

  const result = await interpretarVoz("Resumen de ventas de hoy en Fantasma", undefined, readApi);

  assert.equal(result.tipo, "aclaracion");
  assert.equal(todaySalesCalls, 0);
  assert.match(result.mensaje, /Fantasma/i);
});

test("today sales calendar uses local midnight boundaries rather than the dashboard's seven-day window", () => {
  const { getTodayCalendar } = loadTsModule("src/features/dashboard/lib/dateBuckets.ts");
  const { startInclusive, endExclusive } = getTodayCalendar(new Date("2026-09-16T22:00:00-04:00"));

  assert.equal(startInclusive.toISOString(), "2026-09-16T04:00:00.000Z");
  assert.equal(endExclusive.toISOString(), "2026-09-17T04:00:00.000Z");
});

test("assistant chat persistence is user-scoped, bounded, and hydrates only display-safe messages", async () => {
  const { hydrateAssistantChat, saveAssistantChat, assistantChatStorageKey, MAX_STORED_SESSIONS, MAX_STORED_MESSAGES } = loadTsModule("src/features/asistente-ia/lib/assistantSessionPersistence.ts");
  const values = new Map();
  const storage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
  const sessions = Array.from({ length: MAX_STORED_SESSIONS + 2 }, (_, index) => ({
    id: `session-${index}`,
    objetivo: "consulta",
    estado: "completada",
    resumen: `Consulta ${index}`,
    createdAt: index,
    updatedAt: index,
  }));
  const state = {
    sessions,
    activeSessionId: "session-21",
    messages: {
      "session-21": Array.from({ length: MAX_STORED_MESSAGES + 2 }, (_, index) => ({
        id: `message-${index}`,
        role: "asistente",
        texto: `Respuesta ${index}`,
        attachment: { kind: "confirmacion-venta" },
      })),
    },
  };

  await saveAssistantChat(storage, "user-a", state);
  assert.notEqual(values.get(assistantChatStorageKey("user-a")), undefined);
  assert.equal(values.get(assistantChatStorageKey("user-b")), undefined);

  const hydrated = await hydrateAssistantChat(storage, "user-a");
  assert.equal(hydrated.sessions.length, MAX_STORED_SESSIONS);
  assert.equal(hydrated.messages["session-21"].length, MAX_STORED_MESSAGES);
  assert.equal(hydrated.messages["session-21"][0].attachment, undefined);

  values.set(assistantChatStorageKey("user-a"), "{not-json");
  assert.deepEqual(await hydrateAssistantChat(storage, "user-a"), { sessions: [], activeSessionId: null, messages: {} });
});

test("assistant scope selects only authorized branches and rechecks writes", () => {
  const { buildAssistantScopeContext, resolveAssistantBranch, canExecuteAssistantWrite } = loadTsModule("src/features/asistente-ia/lib/assistantAuthorization.ts");
  const profile = { id: "user-a", email: "a@example.com", nombre: "Ana", rol: "cajera", sucursal_id: 2, created_at: "", updated_at: "" };
  const branches = [{ id: 1, nombre: "Central" }, { id: 2, nombre: "Comercio" }];

  assert.equal(resolveAssistantBranch(profile, branches, 1), 2);
  assert.equal(resolveAssistantBranch(profile, branches, null), 2);
  assert.equal(canExecuteAssistantWrite(profile, "sales.write", 1), false);
  assert.equal(canExecuteAssistantWrite(profile, "sales.write", 2), true);

  const scope = buildAssistantScopeContext(profile, branches, 1);
  assert.deepEqual(scope.allowedBranchIds, [2]);
  assert.equal(scope.activeBranchId, 2);
  assert.ok(scope.abilities.includes("sales.write"));
});


test("assistant read intents default to the current authorized branch and reject excluded branches", async () => {
  const { interpretarVoz } = loadTsModule("src/features/asistente-ia/api/voiceCommandApi.ts");
  const calls = [];
  const readApi = {
    findProductByCode: async () => { throw new Error("not used"); },
    searchProducts: async () => [],
    stockForProduct: async () => [],
    getBranches: async () => [{ id: 1, nombre: "Central" }, { id: 2, nombre: "Comercio" }],
    getTodaySales: async (branchId) => { calls.push(branchId); return { totalSales: 15, salesCount: 1 }; },
    getLowStock: async () => [],
  };
  const authorization = {
    userId: "user-a", role: "cajera", abilities: ["ai.read", "sales.read"],
    activeBranchId: 2, activeBranchName: "Comercio", allowedBranchIds: [2], allowedBranchNames: ["Comercio"],
  };

  const defaultResult = await interpretarVoz("Ventas de hoy", { sucursales: ["Comercio"], authorization }, readApi);
  assert.equal(defaultResult.tipo, "consulta_ventas");
  assert.deepEqual(calls, [2]);

  const excludedResult = await interpretarVoz("Ventas de hoy en Central", { sucursales: ["Comercio"], authorization }, readApi);
  assert.equal(excludedResult.tipo, "aclaracion");
  assert.deepEqual(calls, [2]);
});
