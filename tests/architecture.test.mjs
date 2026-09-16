import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname.replace(/^\/(\w):/, "$1:");
const file = (relative) => join(root, relative.replaceAll("/", "\\"));

test("feature-driven structure contains requested slices", () => {
  const expected = [
    "src/features/dashboard/components/KpiGrid.tsx",
    "src/features/dashboard/components/SalesWeeklyChart.tsx",
    "src/features/dashboard/components/LowStockList.tsx",
    "src/features/productos/components/ProductForm.tsx",
    "src/features/productos/components/BarcodeScannerView.tsx",
    "src/features/inventario/components/TransferModal.tsx",
    "src/features/ventas/components/SaleSummaryModal.tsx",
    "src/features/asistente-ia/components/RegistroVozDrawer.tsx",
    "src/shared/components/AppHeader.tsx",
  ];
  for (const path of expected) assert.equal(existsSync(file(path)), true, path);
});

test("routes stay free of direct Supabase queries", () => {
  const routes = ["src/app/_layout.tsx", "src/app/(tabs)/index.tsx", "src/app/(tabs)/productos.tsx", "src/app/(tabs)/inventario.tsx", "src/app/(tabs)/ventas.tsx", "src/app/(tabs)/mas.tsx", "src/app/escanear.tsx", "src/app/registrar-producto.tsx", "src/app/movimientos.tsx", "src/app/nueva-venta.tsx", "src/app/registro-voz.tsx"];
  for (const path of routes) assert.doesNotMatch(readFileSync(file(path), "utf8"), /supabase\.(from|rpc)\(/, path);
});
