import type {
  AnalisisRotacionResumen,
  DashboardLowStockItem,
  DashboardMetrics,
  KardexFilterParams,
  MovimientoKardexItem,
  Producto,
  RotacionClasificacion,
  Sucursal,
} from "../../../shared/types/domain";
import { buscarProductoPorCodigo, buscarProductosAsistente } from "../../productos/api/productosApi";
import { ProductoNoEncontradoError } from "../../productos/lib/productLookupErrors";
import {
  extraTerminosBusquedaProducto,
  matchProduct,
  normalizarCodigoSKU,
  pareceSKU,
  rankProductsByQuery,
  variantesBusquedaProducto,
} from "../lib/productMatching";
import type { IntentoDesambiguacion } from "../lib/chatSession";
import type { AssistantScopeContext } from "../lib/assistantAuthorization";
import { obtenerStockDeProducto, obtenerInventario, obtenerStockMultiSucursal } from "../../inventario/api/inventarioApi";
import { obtenerAnalisisRotacion, type OpcionesAnalisisRotacion } from "../../analitica/api/rotacionApi";
import { obtenerDashboardMetrics, obtenerVentasPorPeriodo, type SalesQueryPeriod } from "../../dashboard/api/dashboardApi";
import { obtenerKardexMovimientos } from "../../inventario/api/kardexApi";
import { obtenerSucursales } from "../../../shared/api/sucursalesApi";
import type { RegistroProductoParsed } from "./voiceRegistrationService";
export type { SalesQueryPeriod } from "../../dashboard/api/dashboardApi";

export class InterpretacionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterpretacionError";
  }
}

/**
 * @deprecated Ya no se lanza: la ambigüedad se devuelve como
 * `{ tipo: "desambiguacion" }` para que el chat liste candidatos con SKU.
 * Se conserva exportada por compatibilidad con `src/lib/api.ts`.
 */
export class ProductoAmbiguoError extends InterpretacionError {
  readonly candidatos: Producto[];
  constructor(texto: string, candidatos: Producto[]) {
    const detalle = candidatos
      .slice(0, 3)
      .map((p) => `"${p.nombre}" (${p.codigo})`)
      .join(", ");
    super(`Se encontraron varias coincidencias para "${texto}" (${detalle}). Indicá el código SKU o el nombre completo para confirmar.`);
    this.name = "ProductoAmbiguoError";
    this.candidatos = candidatos;
  }
}

export interface LineaInterpretada {
  producto: Producto;
  cantidadSolicitada: number;
}

export interface StockSucursalDetalle {
  sucursalId: number;
  sucursalNombre: string;
  cantidad: number;
}

export interface StockListItem {
  productoId: number;
  nombre: string;
  codigo: string;
  categoria?: string;
  cantidad: number;
}

export interface AssistantReadApi {
  findProductByCode(codigo: string): Promise<Producto>;
  searchProducts(query: string, limit: number): Promise<Producto[]>;
  stockForProduct(productoId: number): Promise<StockSucursalDetalle[]>;
  getBranches(): Promise<Sucursal[]>;
  getSalesSummary(
    periodo: SalesQueryPeriod,
    sucursalId?: number,
    diasAtras?: number,
  ): Promise<{ totalSales: number; salesCount: number; periodo: SalesQueryPeriod; diasAtras?: number }>;
  getRotationAnalysis(options?: OpcionesAnalisisRotacion): Promise<AnalisisRotacionResumen>;
  getKardex(filters?: KardexFilterParams): Promise<MovimientoKardexItem[]>;
  getLowStock(sucursalId?: number): Promise<DashboardLowStockItem[]>;
  getStockList(sucursalId?: number): Promise<StockListItem[]>;
}

export type KardexResumen = {
  entradas: number;
  salidas: number;
  transferencias: number;
  total: number;
};

export function resumirKardex(movimientos: MovimientoKardexItem[]): KardexResumen {
  let entradas = 0;
  let salidas = 0;
  let transferencias = 0;
  for (const movimiento of movimientos) {
    if (movimiento.tipo === "entrada") entradas += movimiento.cantidad;
    else if (movimiento.tipo === "salida") salidas += movimiento.cantidad;
    else transferencias += movimiento.cantidad;
  }
  return { entradas, salidas, transferencias, total: movimientos.length };
}

async function construirStockList(sucursalId?: number): Promise<StockListItem[]> {
  const items = sucursalId === undefined
    ? await obtenerStockMultiSucursal()
    : await obtenerInventario(sucursalId);
  const agregados = new Map<number, StockListItem>();
  for (const item of items) {
    const actual = agregados.get(item.producto_id);
    if (actual) {
      actual.cantidad += item.cantidad;
    } else {
      agregados.set(item.producto_id, {
        productoId: item.producto_id,
        nombre: item.producto.nombre,
        codigo: item.producto.codigo,
        categoria: item.producto.categoria,
        cantidad: item.cantidad,
      });
    }
  }
  return Array.from(agregados.values());
}

export function mapAssistantSalesSummaryCall(
  periodo: SalesQueryPeriod,
  sucursalId?: number,
  diasAtras?: number,
  now = new Date(),
) {
  const offset = periodo === "dia" ? (diasAtras ?? 0) : 0;
  return { periodo, sucursalId, now, diasAtras: offset };
}

async function getAssistantSalesSummary(
  periodo: SalesQueryPeriod,
  sucursalId?: number,
  diasAtras?: number,
) {
  const args = mapAssistantSalesSummaryCall(periodo, sucursalId, diasAtras);
  return obtenerVentasPorPeriodo(args.periodo, args.sucursalId, args.now, args.diasAtras);
}

export { getAssistantSalesSummary };

export const defaultAssistantReadApi: AssistantReadApi = {
  findProductByCode: buscarProductoPorCodigo,
  searchProducts: buscarProductosAsistente,
  stockForProduct: obtenerStockDeProducto,
  getBranches: obtenerSucursales,
  getSalesSummary: getAssistantSalesSummary,
  getRotationAnalysis: obtenerAnalisisRotacion,
  getKardex: obtenerKardexMovimientos,
  getLowStock: async (sucursalId) => (await obtenerDashboardMetrics(sucursalId)).lowStock,
  getStockList: construirStockList,
};

export type ResultadoInterpretacion =
  | { tipo: "aclaracion"; mensaje: string; pasosPensamiento?: string[]; retryable?: boolean }
  | { tipo: "conversacion"; mensaje: string; pasosPensamiento?: string[] }
  | { tipo: "registro_producto"; datos: RegistroProductoParsed; mensaje: string; pasosPensamiento?: string[] }
  | { tipo: "venta"; lineas: LineaInterpretada[]; fueCorreccion?: boolean; pasosPensamiento?: string[] }
  | {
      tipo: "desambiguacion";
      texto: string;
      candidatos: Producto[];
      intento: IntentoDesambiguacion;
      pasosPensamiento?: string[];
    }
  | {
      tipo: "consulta_stock";
      producto: Producto;
      filtroSucursal?: string;
      desglose: StockSucursalDetalle[];
      stockTotal: number;
      mensaje: string;
      pasosPensamiento?: string[];
    }
  | {
      tipo: "buscar_producto";
      consulta: string;
      productos: Producto[];
      lineas: [];
      fueCorreccion?: false;
      mensaje: string;
      pasosPensamiento?: string[];
    }
  | {
      tipo: "consulta_bajo_stock";
      filtroSucursal?: string;
      productos: DashboardLowStockItem[];
      lineas: [];
      fueCorreccion?: false;
      mensaje: string;
      pasosPensamiento?: string[];
    }
  | {
      tipo: "listar_inventario";
      filtroSucursal?: string;
      minStock: number;
      productos: StockListItem[];
      lineas: [];
      fueCorreccion?: false;
      mensaje: string;
      pasosPensamiento?: string[];
    }
  | {
      tipo: "consulta_ventas";
      filtroSucursal?: string;
      totalVentas: number;
      cantidadVentas: number;
      periodo: SalesQueryPeriod;
      diasAtras?: number;
      mensaje: string;
      pasosPensamiento?: string[];
    }
  | {
      tipo: "consulta_rotacion";
      filtroSucursal?: string;
      diasAnalizados: number;
      totalUnidadesVendidas: number;
      totalIngresos: number;
      capitalInmovilizado: number;
      productosAltaRotacion: number;
      productosMediaRotacion: number;
      productosBajaRotacion: number;
      items: Array<{
        nombre: string;
        codigo: string;
        unidadesVendidas: number;
        stockActual: number;
        clasificacion: RotacionClasificacion;
      }>;
      insights: Array<{ titulo: string; descripcion: string; accionSugerida: string }>;
      categorias: Array<{ categoria: string; unidadesVendidas: number; porcentajeVentas: number }>;
      mensaje: string;
      pasosPensamiento?: string[];
    }
  | {
      tipo: "consulta_kardex";
      filtroSucursal?: string;
      productoNombre?: string;
      productoCodigo?: string;
      tipoMovimiento: "entrada" | "salida" | "todas";
      movimientos: Array<{
        fecha: string;
        productoNombre: string;
        productoCodigo: string;
        sucursalNombre: string;
        tipo: MovimientoKardexItem["tipo"];
        subtipo?: MovimientoKardexItem["subtipo"];
        cantidad: number;
        saldoResultante?: number;
        observacion?: string;
      }>;
      resumen: KardexResumen;
      mensaje: string;
      pasosPensamiento?: string[];
    };

export type CoincidenciaProducto =
  | { kind: "match"; product: Producto }
  | { kind: "candidatos"; products: Producto[] }
  | { kind: "none" };

export async function searchProductsWithVariants(
  query: string,
  readApi: AssistantReadApi,
  limit = 12,
): Promise<Producto[]> {
  const seen = new Map<number, Producto>();
  let foundPhrase = false;

  for (const term of variantesBusquedaProducto(query)) {
    const products = await readApi.searchProducts(term, limit);
    for (const product of products) seen.set(product.id, product);
    if (products.length > 0) foundPhrase = true;
  }

  if (!foundPhrase) {
    const tokenLimit = Math.max(limit, 24);
    for (const term of extraTerminosBusquedaProducto(query)) {
      const products = await readApi.searchProducts(term, tokenLimit);
      for (const product of products) seen.set(product.id, product);
    }
  }

  const ranked = rankProductsByQuery([...seen.values()], query);
  if (ranked.length > 0) return ranked.slice(0, limit);
  return [...seen.values()].slice(0, limit);
}

export async function resolverCoincidencia(text: string, readApi: AssistantReadApi): Promise<CoincidenciaProducto> {
  const query = text.trim();
  if (!query) return { kind: "none" };

  if (pareceSKU(query)) {
    const candidatosCodigo = Array.from(new Set([
      normalizarCodigoSKU(query).toUpperCase(),
      query.trim().toUpperCase(),
    ]));
    for (const codigo of candidatosCodigo) {
      try {
        const product = await readApi.findProductByCode(codigo);
        return { kind: "match", product };
      } catch (error) {
        if (!(error instanceof ProductoNoEncontradoError)) {
          throw new InterpretacionError("No se pudo buscar el producto. Revisá tu conexión y volvé a intentar.");
        }
      }
    }
  }

  let products: Producto[] = [];
  try {
    products = await searchProductsWithVariants(query, readApi, 12);
  } catch {
    throw new InterpretacionError("No se pudo buscar el producto. Revisá tu conexión y volvé a intentar.");
  }

  const match = matchProduct(products, query);
  if (match.kind === "match") return { kind: "match", product: match.product };
  if (match.kind === "ambiguous") return { kind: "candidatos", products: match.products };
  return { kind: "none" };
}

export type SucursalResuelta =
  | { kind: "sin_filtro" }
  | { kind: "resuelta"; sucursal: Sucursal }
  | { kind: "desconocida"; solicitada: string };

function normalizarSucursal(nombre: string): string {
  return nombre.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export async function resolverSucursalSolicitada(
  sucursal: string | null | undefined,
  readApi: AssistantReadApi,
  allowedBranchIds?: number[],
): Promise<SucursalResuelta> {
  const solicitada = sucursal?.trim();
  if (!solicitada) return { kind: "sin_filtro" };
  const branches = (await readApi.getBranches()).filter((branch) => !allowedBranchIds || allowedBranchIds.includes(branch.id));
  const encontrada = branches.find((branch) => normalizarSucursal(branch.nombre) === normalizarSucursal(solicitada));
  return encontrada ? { kind: "resuelta", sucursal: encontrada } : { kind: "desconocida", solicitada };
}

export async function resolveScopedBranch(
  sucursal: string | null | undefined,
  readApi: AssistantReadApi,
  scope?: AssistantScopeContext,
): Promise<
  | { kind: "ok"; branchId: number | undefined; branchName: string | undefined }
  | { kind: "unknown"; solicitada: string }
> {
  const resolved = await resolverSucursalSolicitada(sucursal, readApi, scope?.allowedBranchIds);
  if (resolved.kind === "desconocida") return { kind: "unknown", solicitada: resolved.solicitada };
  if (resolved.kind === "resuelta") {
    return { kind: "ok", branchId: resolved.sucursal.id, branchName: resolved.sucursal.nombre };
  }
  return { kind: "ok", branchId: scope?.activeBranchId ?? undefined, branchName: undefined };
}

/**
 * Arma la respuesta de stock para un producto ya elegido (vía directa o tras
 * desambiguar en el chat). Consulta indexada; no descarga todo el inventario.
 */
export async function consultarStockDe(
  product: Producto,
  sucursalMencionada?: string,
  readApi: AssistantReadApi = defaultAssistantReadApi,
  allowedBranchIds?: number[],
): Promise<Extract<ResultadoInterpretacion, { tipo: "consulta_stock" }>> {
  const desglose = (await readApi.stockForProduct(product.id)).filter((item) => !allowedBranchIds || allowedBranchIds.includes(item.sucursalId));
  const stockTotal = desglose.reduce((sum, item) => sum + item.cantidad, 0);
  const sucursalFiltro = sucursalMencionada?.toLowerCase().trim();

  let mensaje = "";
  if (sucursalFiltro) {
    const matched = desglose.find((b) => b.sucursalNombre.toLowerCase().includes(sucursalFiltro));
    if (matched) {
      mensaje = `Hay ${matched.cantidad} unidad(es) de "${product.nombre}" en sucursal ${matched.sucursalNombre}. (Stock global: ${stockTotal} uds).`;
    } else {
      mensaje = `No hay stock registrado en "${sucursalMencionada}". Total en otras sucursales: ${stockTotal} uds.`;
    }
  } else {
    const listado = desglose.map((b) => `${b.sucursalNombre}: ${b.cantidad} uds`).join(", ");
    mensaje = `Stock total de "${product.nombre}": ${stockTotal} unidades (${listado || "Sin stock"}).`;
  }

  return {
    tipo: "consulta_stock",
    producto: product,
    filtroSucursal: sucursalMencionada ?? undefined,
    desglose,
    stockTotal,
    mensaje,
  };
}

function mapKardexMovimiento(item: MovimientoKardexItem) {
  return {
    fecha: item.fecha,
    productoNombre: item.producto_nombre,
    productoCodigo: item.producto_codigo,
    sucursalNombre: item.sucursal_nombre,
    tipo: item.tipo,
    subtipo: item.subtipo,
    cantidad: item.cantidad,
    saldoResultante: item.saldo_resultante,
    observacion: item.observacion ?? undefined,
  };
}

export function buildConsultaKardexResult(input: {
  movimientos: MovimientoKardexItem[];
  filtroSucursal?: string;
  producto?: Pick<Producto, "nombre" | "codigo">;
  tipoMovimiento: "entrada" | "salida" | "todas";
}): Extract<ResultadoInterpretacion, { tipo: "consulta_kardex" }> {
  const resumen = resumirKardex(input.movimientos);
  const productoTexto = input.producto ? ` de "${input.producto.nombre}"` : "";
  const sucursalTexto = input.filtroSucursal ? ` en ${input.filtroSucursal}` : "";
  const tipoTexto =
    input.tipoMovimiento === "todas"
      ? ""
      : input.tipoMovimiento === "entrada"
        ? " (solo entradas)"
        : " (solo salidas)";
  const mensaje = resumen.total
    ? `Encontré ${resumen.total} movimiento${resumen.total === 1 ? "" : "s"}${productoTexto}${sucursalTexto}${tipoTexto}.`
    : `No hay movimientos registrados${productoTexto}${sucursalTexto}${tipoTexto}.`;

  return {
    tipo: "consulta_kardex",
    filtroSucursal: input.filtroSucursal,
    productoNombre: input.producto?.nombre,
    productoCodigo: input.producto?.codigo,
    tipoMovimiento: input.tipoMovimiento,
    movimientos: input.movimientos.map(mapKardexMovimiento),
    resumen,
    mensaje,
  };
}

export async function consultarKardexDe(
  producto: Producto,
  options: {
    sucursal?: string;
    tipo?: "entrada" | "salida" | "todas";
    limite?: number;
  },
  readApi: AssistantReadApi,
  scope: AssistantScopeContext,
): Promise<Extract<ResultadoInterpretacion, { tipo: "consulta_kardex" }>> {
  const branch = await resolveScopedBranch(options.sucursal, readApi, scope);
  if (branch.kind === "unknown") {
    throw new InterpretacionError(`No reconozco la sucursal "${branch.solicitada}".`);
  }
  const tipoMovimiento = options.tipo ?? "todas";
  const movimientos = await readApi.getKardex({
    producto_id: producto.id,
    sucursal_id: branch.branchId,
    tipo: tipoMovimiento,
    limite: options.limite ?? 15,
  });
  return buildConsultaKardexResult({
    movimientos,
    filtroSucursal: branch.branchName,
    producto,
    tipoMovimiento,
  });
}
