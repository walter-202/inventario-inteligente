import type { DashboardLowStockItem, DashboardMetrics, Producto, Sucursal } from "../../../shared/types/domain";
import { buscarProductoPorCodigo, buscarProductosAsistente } from "../../productos/api/productosApi";
import { ProductoNoEncontradoError } from "../../productos/lib/productLookupErrors";
import { matchProduct, normalizarCodigoSKU, pareceSKU } from "../lib/productMatching";
import type { IntentoDesambiguacion } from "../lib/chatSession";
import type { AssistantScopeContext } from "../lib/assistantAuthorization";
import { obtenerStockDeProducto, obtenerInventario, obtenerStockMultiSucursal } from "../../inventario/api/inventarioApi";
import { obtenerDashboardMetrics, obtenerVentasDeHoy } from "../../dashboard/api/dashboardApi";
import { obtenerSucursales } from "../../../shared/api/sucursalesApi";
import type { RegistroProductoParsed } from "./voiceRegistrationService";

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
  getTodaySales(sucursalId?: number): Promise<Pick<DashboardMetrics, "totalSales" | "salesCount">>;
  getLowStock(sucursalId?: number): Promise<DashboardLowStockItem[]>;
  getStockList(sucursalId?: number): Promise<StockListItem[]>;
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

export const defaultAssistantReadApi: AssistantReadApi = {
  findProductByCode: buscarProductoPorCodigo,
  searchProducts: buscarProductosAsistente,
  stockForProduct: obtenerStockDeProducto,
  getBranches: obtenerSucursales,
  getTodaySales: obtenerVentasDeHoy,
  getLowStock: async (sucursalId) => (await obtenerDashboardMetrics(sucursalId)).lowStock,
  getStockList: construirStockList,
};

export type ResultadoInterpretacion =
  | { tipo: "aclaracion"; mensaje: string; pasosPensamiento?: string[] }
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
      periodo: "hoy";
      mensaje: string;
      pasosPensamiento?: string[];
    };

export type CoincidenciaProducto =
  | { kind: "match"; product: Producto }
  | { kind: "candidatos"; products: Producto[] }
  | { kind: "none" };

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
    products = await readApi.searchProducts(query, 12);
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
