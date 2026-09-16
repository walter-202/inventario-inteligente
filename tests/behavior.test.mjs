import assert from "node:assert/strict";
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
