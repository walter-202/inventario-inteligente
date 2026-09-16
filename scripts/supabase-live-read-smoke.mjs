import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadTsModule } from "../tests/load-ts.mjs";

const EXPECTED_PROJECT_HOST = "ynfqpwmzhsmkhltyugow.supabase.co";
let currentStage = "startup";

function loadEnvFile(filename) {
  if (!existsSync(filename)) return;
  for (const line of readFileSync(filename, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match || match[1].startsWith("#") || process.env[match[1]] !== undefined) continue;
    const rawValue = match[2];
    process.env[match[1]] =
      (rawValue.startsWith("\"") && rawValue.endsWith("\"")) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;
  }
}

const projectRoot = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(\w):/u, "$1:"));
loadEnvFile(resolve(projectRoot, ".env.local"));
loadEnvFile(resolve(projectRoot, ".env"));

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertFiniteNumber(value, label) {
  assert(typeof value === "number" && Number.isFinite(value), `${label} must be a finite number`);
}

function assertProduct(product, label) {
  assert(isObject(product), `${label} must be an object`);
  assertFiniteNumber(product.id, `${label}.id`);
  assert(typeof product.nombre === "string", `${label}.nombre must be a string`);
  assert(typeof product.codigo === "string", `${label}.codigo must be a string`);
  assert(typeof product.categoria === "string", `${label}.categoria must be a string`);
  assertFiniteNumber(product.precio, `${label}.precio`);
  assertFiniteNumber(product.cantidad, `${label}.cantidad`);
}

function assertCatalogPage(page, label) {
  assert(isObject(page), `${label} must be an object`);
  assert(Array.isArray(page.data), `${label}.data must be an array`);
  page.data.forEach((product, index) => assertProduct(product, `${label}.data[${index}]`));
  for (const field of ["current_page", "last_page", "per_page", "total"]) {
    assert(Number.isInteger(page[field]) && page[field] >= 0, `${label}.${field} must be a non-negative integer`);
  }
  assert(page.next_page_url === null || typeof page.next_page_url === "string", `${label}.next_page_url has an invalid type`);
  assert(page.prev_page_url === null || typeof page.prev_page_url === "string", `${label}.prev_page_url has an invalid type`);
}

function assertInventory(items, label) {
  assert(Array.isArray(items), `${label} must be an array`);
  items.forEach((item, index) => {
    const itemLabel = `${label}[${index}]`;
    assert(isObject(item), `${itemLabel} must be an object`);
    for (const field of ["id", "producto_id", "sucursal_id", "cantidad"]) assertFiniteNumber(item[field], `${itemLabel}.${field}`);
    assert(isObject(item.producto), `${itemLabel}.producto must be an object`);
    assertFiniteNumber(item.producto.id, `${itemLabel}.producto.id`);
    assert(typeof item.producto.nombre === "string", `${itemLabel}.producto.nombre must be a string`);
    assert(typeof item.producto.codigo === "string", `${itemLabel}.producto.codigo must be a string`);
    assert(isObject(item.sucursal), `${itemLabel}.sucursal must be an object`);
    assertFiniteNumber(item.sucursal.id, `${itemLabel}.sucursal.id`);
    assert(typeof item.sucursal.nombre === "string", `${itemLabel}.sucursal.nombre must be a string`);
  });
}

function assertSales(sales, label) {
  assert(Array.isArray(sales), `${label} must be an array`);
  sales.forEach((sale, index) => {
    const saleLabel = `${label}[${index}]`;
    assert(isObject(sale), `${saleLabel} must be an object`);
    for (const field of ["id", "sucursal_id", "total"]) assertFiniteNumber(sale[field], `${saleLabel}.${field}`);
    assert(typeof sale.fecha === "string", `${saleLabel}.fecha must be a string`);
    assert(typeof sale.metodo_pago === "string", `${saleLabel}.metodo_pago must be a string`);
  });
}

function assertDashboard(metrics, label) {
  assert(isObject(metrics), `${label} must be an object`);
  for (const field of ["totalSales", "salesCount", "stockUnits", "lowStockCount"]) {
    assertFiniteNumber(metrics[field], `${label}.${field}`);
  }
  assert(Array.isArray(metrics.weeklySales) && metrics.weeklySales.length === 7, `${label}.weeklySales must contain seven days`);
  metrics.weeklySales.forEach((day, index) => {
    assert(isObject(day), `${label}.weeklySales[${index}] must be an object`);
    assert(typeof day.date === "string", `${label}.weeklySales[${index}].date must be a string`);
    assert(typeof day.label === "string", `${label}.weeklySales[${index}].label must be a string`);
    assertFiniteNumber(day.total, `${label}.weeklySales[${index}].total`);
    assertFiniteNumber(day.count, `${label}.weeklySales[${index}].count`);
  });
  assertInventory(metrics.lowStock, `${label}.lowStock`);
  metrics.lowStock.forEach((item, index) => assertFiniteNumber(item.threshold, `${label}.lowStock[${index}].threshold`));
}

function classifyPublicKey(key) {
  const normalized = key.trim();
  const lowered = normalized.toLowerCase();
  assert(!lowered.includes("service_role") && !lowered.includes("secret"), "Supabase key must not be a service_role or secret key");

  if (normalized.startsWith("sb_publishable_")) return "publishable";

  const parts = normalized.split(".");
  assert(parts.length === 3, "Supabase key must be an anon JWT or an sb_publishable key");
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    fail("Supabase JWT payload is not valid JSON");
  }
  assert(isObject(payload) && payload.role === "anon", "Supabase JWT must carry the anon role");
  return "anon-jwt";
}

function validateEndpoint() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  assert(typeof url === "string" && url.length > 0, "EXPO_PUBLIC_SUPABASE_URL is required in the environment or .env");
  assert(typeof anonKey === "string" && anonKey.length > 20, "EXPO_PUBLIC_SUPABASE_ANON_KEY is required in the environment or .env");
  let endpoint;
  try {
    endpoint = new URL(url);
  } catch {
    fail("EXPO_PUBLIC_SUPABASE_URL is not a valid URL");
  }
  assert(endpoint.protocol === "https:", "Supabase URL must use HTTPS");
  assert(endpoint.hostname === EXPECTED_PROJECT_HOST, "Supabase URL points to an unexpected project hostname");
  assert(endpoint.pathname === "/" && endpoint.search === "" && endpoint.hash === "", "Supabase URL must be the project origin");
  return classifyPublicKey(anonKey);
}

async function main() {
  const authKeyType = validateEndpoint();

  // Only read-only frontend API modules are loaded. Mutation modules/functions are intentionally not imported.
  const { obtenerSucursales } = loadTsModule("src/shared/api/sucursalesApi.ts");
  const { obtenerProductos, buscarProductoPorCodigo } = loadTsModule("src/features/productos/api/productosApi.ts");
  const { obtenerInventario, obtenerStockMultiSucursal } = loadTsModule("src/features/inventario/api/inventarioApi.ts");
  const { obtenerDashboardMetrics } = loadTsModule("src/features/dashboard/api/dashboardApi.ts");
  const { obtenerVentas } = loadTsModule("src/features/ventas/api/ventasApi.ts");

  currentStage = "branches";
  const branches = await obtenerSucursales();
  assert(Array.isArray(branches), "branches must be an array");
  assert(branches.length >= 2, "at least two branches are required for live validation");
  branches.forEach((branch, index) => {
    assert(isObject(branch), `branches[${index}] must be an object`);
    assertFiniteNumber(branch.id, `branches[${index}].id`);
    assert(typeof branch.nombre === "string", `branches[${index}].nombre must be a string`);
  });

  currentStage = "catalog page one";
  const firstPage = await obtenerProductos({ page: 1 });
  assertCatalogPage(firstPage, "catalog page one");
  assert(firstPage.data.length > 0, "catalog must contain at least one product for exact-code validation");
  const firstProduct = firstPage.data[0];
  const searchToken =
    firstProduct.codigo.match(/[A-Za-z0-9]+/u)?.[0] ??
    firstProduct.nombre.trim().split(/\s+/u)[0].replace(/[^\p{L}\p{N}]/gu, "");
  assert(searchToken.length > 0, "first product name must provide a search token");

  const secondaryCatalogPage = firstPage.last_page >= 2 ? 2 : 1;
  currentStage = secondaryCatalogPage === 2 ? "catalog page two" : "catalog final page";
  const secondPage = await obtenerProductos({ page: secondaryCatalogPage });
  assertCatalogPage(secondPage, "catalog secondary page");
  assert(secondPage.current_page === secondaryCatalogPage, "catalog secondary page did not retain the requested page");

  currentStage = "catalog search";
  const searchPage = await obtenerProductos({ q: searchToken });
  assertCatalogPage(searchPage, "catalog search");
  assert(searchPage.data.some((product) => product.id === firstProduct.id), "catalog search did not return the selected product");

  currentStage = "exact product code";
  const exactProduct = await buscarProductoPorCodigo(firstProduct.codigo);
  assertProduct(exactProduct, "exact product");
  assert(exactProduct.id === firstProduct.id && exactProduct.codigo === firstProduct.codigo, "exact product lookup returned a different product");

  currentStage = "branch inventory";
  const branchInventory = await obtenerInventario(branches[0].id);
  assertInventory(branchInventory, "branch inventory");

  currentStage = "all branch stock";
  const allStock = await obtenerStockMultiSucursal();
  assertInventory(allStock, "all branch stock");

  currentStage = "global dashboard";
  const globalDashboard = await obtenerDashboardMetrics();
  assertDashboard(globalDashboard, "global dashboard");

  currentStage = "branch dashboard";
  const branchDashboard = await obtenerDashboardMetrics(branches[0].id);
  assertDashboard(branchDashboard, "branch dashboard");

  currentStage = "global sales";
  const globalSales = await obtenerVentas();
  assertSales(globalSales, "global sales");

  currentStage = "branch sales";
  const branchSales = await obtenerVentas(branches[0].id);
  assertSales(branchSales, "branch sales");

  console.log(JSON.stringify({
    ok: true,
    projectHost: EXPECTED_PROJECT_HOST,
    branches: branches.length,
    catalog: {
      pageOneRows: firstPage.data.length,
      secondaryPageRows: secondPage.data.length,
      secondaryPageNumber: secondaryCatalogPage,
      secondPageAvailable: secondaryCatalogPage === 2,
      total: firstPage.total,
      searchMatches: searchPage.data.length,
      exactCodeContract: true,
    },
    inventory: { selectedBranchRows: branchInventory.length, allBranchRows: allStock.length },
    dashboard: {
      globalWeeklyDays: globalDashboard.weeklySales.length,
      globalLowStockCount: globalDashboard.lowStock.length,
      branchWeeklyDays: branchDashboard.weeklySales.length,
      branchLowStockCount: branchDashboard.lowStock.length,
    },
    sales: { globalRows: globalSales.length, selectedBranchRows: branchSales.length },
    contracts: { authKeyType, branches: true, catalog: true, inventory: true, dashboard: true, sales: true },
  }));
}

try {
  await main();
} catch (error) {
  // Keep failures useful without ever printing credentials or live business rows.
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
  console.error(JSON.stringify({ ok: false, error: "live read smoke failed", stage: currentStage, code }));
  process.exitCode = 1;
}
