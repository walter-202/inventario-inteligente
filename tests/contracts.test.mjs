import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname.replace(/^\/(\w):/, "$1:");
const read = (path) => readFileSync(join(root, path.replaceAll("/", "\\")), "utf8");

test("Supabase RPC names and payload keys remain backward compatible", () => {
  const products = read("src/features/productos/api/productosApi.ts");
  const inventory = read("src/features/inventario/api/inventarioApi.ts");
  const sales = read("src/features/ventas/api/ventasApi.ts");
  for (const token of ["registrar_producto_con_stock", "p_nombre", "p_codigo", "p_categoria", "p_precio", "p_cantidad", "p_sucursal_id"]) assert.match(products, new RegExp(token));
  for (const token of ["registrar_movimiento_entrada", "registrar_movimiento_salida", "registrar_movimiento_transferencia", "p_sucursal_origen_id", "p_sucursal_destino_id", "p_observacion"]) assert.match(inventory, new RegExp(token));
  for (const token of ["registrar_venta", "p_metodo_pago", "p_productos"]) assert.match(sales, new RegExp(token));
});

test("AI tools validate input with Zod schemas", () => {
  const tools = read("src/features/asistente-ia/lib/assistantTools.ts");
  assert.match(tools, /search_products/);
  assert.match(tools, /propose_sale/);
  assert.match(tools, /inputSchema/);
  assert.match(tools, /z\.object/);
});
