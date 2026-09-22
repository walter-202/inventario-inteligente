import type { DashboardLowStockItem, DashboardMetrics, Producto, Sucursal } from "../../../shared/types/domain";
import { buscarProductoPorCodigo, buscarProductosAsistente } from "../../productos/api/productosApi";
import { ProductoNoEncontradoError } from "../../productos/lib/productLookupErrors";
import { matchProduct, normalizarCodigoSKU, pareceSKU } from "../lib/productMatching";
import type { IntentoDesambiguacion } from "../lib/chatSession";
import type { AssistantScopeContext } from "../lib/assistantAuthorization";
import {
  interpretarTextoVoz,
  esFraseDeCorreccion,
  extraerCantidad,
  extraerFraseCorregida,
  limpiarNombreProducto,
  esConsultaProductoEspecifica,
  type ProductoInterpretado,
} from "./aiInterpretationService";
import { obtenerStockDeProducto } from "../../inventario/api/inventarioApi";
import { obtenerDashboardMetrics, obtenerVentasDeHoy } from "../../dashboard/api/dashboardApi";
import { obtenerSucursales } from "../../../shared/api/sucursalesApi";

import { interpretarRegistroProducto, type RegistroProductoParsed } from "./voiceRegistrationService";

export class InterpretacionError extends Error { constructor(message: string) { super(message); this.name = "InterpretacionError"; } }

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
export interface LineaInterpretada { producto: Producto; cantidadSolicitada: number }

export interface StockSucursalDetalle {
  sucursalId: number;
  sucursalNombre: string;
  cantidad: number;
}

export interface AssistantReadApi {
  findProductByCode(codigo: string): Promise<Producto>;
  searchProducts(query: string, limit: number): Promise<Producto[]>;
  stockForProduct(productoId: number): Promise<StockSucursalDetalle[]>;
  getBranches(): Promise<Sucursal[]>;
  getTodaySales(sucursalId?: number): Promise<Pick<DashboardMetrics, "totalSales" | "salesCount">>;
  getLowStock(sucursalId?: number): Promise<DashboardLowStockItem[]>;
}

const defaultAssistantReadApi: AssistantReadApi = {
  findProductByCode: buscarProductoPorCodigo,
  searchProducts: buscarProductosAsistente,
  stockForProduct: obtenerStockDeProducto,
  getBranches: obtenerSucursales,
  getTodaySales: obtenerVentasDeHoy,
  getLowStock: async (sucursalId) => (await obtenerDashboardMetrics(sucursalId)).lowStock,
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
      // The current screen has no renderer for this future read result yet.
      // An empty sale payload prevents it from becoming a write during that handoff.
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
      tipo: "consulta_ventas";
      filtroSucursal?: string;
      totalVentas: number;
      cantidadVentas: number;
      periodo: "hoy";
      mensaje: string;
      pasosPensamiento?: string[];
    };

type CoincidenciaProducto =
  | { kind: "match"; product: Producto }
  | { kind: "candidatos"; products: Producto[] }
  | { kind: "none" };

async function resolverCoincidencia(text: string, readApi: AssistantReadApi): Promise<CoincidenciaProducto> {
  const query = text.trim();
  if (!query) return { kind: "none" };

  // Vía rápida SKU: "jea 001" del STT → "JEA-001" → lookup exacto por código.
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

/** Compat: un solo producto o null (la ambigüedad se resuelve vía `desambiguacion`). */
async function resolveProduct(text: string, readApi: AssistantReadApi): Promise<Producto | null> {
  const coincidencia = await resolverCoincidencia(text, readApi);
  if (coincidencia.kind === "match") return coincidencia.product;
  return null;
}

function validateItems(response: { accion?: string; productos?: ProductoInterpretado[] }) {
  if (response.accion !== "venta" || !response.productos?.length) return undefined;
  const valid = response.productos.filter((item) => item.producto.trim() && Number.isInteger(item.cantidad) && item.cantidad > 0);
  return valid.length === response.productos.length ? valid : undefined;
}

/** Contexto conversacional: último producto mencionado, historial y sucursales disponibles. */
export interface VozContexto {
  ultimoProductoNombre?: string;
  historial?: Array<{ role: "usuario" | "asistente"; texto: string }>;
  sucursales?: string[];
  /** Authoritative local scope, supplied to the model as context but never as authority. */
  authorization?: AssistantScopeContext;
}

type SucursalResuelta =
  | { kind: "sin_filtro" }
  | { kind: "resuelta"; sucursal: Sucursal }
  | { kind: "desconocida"; solicitada: string };

function normalizarSucursal(nombre: string): string {
  return nombre.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function resolverSucursalSolicitada(
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

/**
 * Arma la respuesta de stock para un producto ya elegido (vía directa o tras
 * desambiguar en el chat). Consulta directa indexada sin descargar todo el inventario.
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

export async function interpretarVoz(
  texto: string,
  contexto?: VozContexto,
  readApi: AssistantReadApi = defaultAssistantReadApi,
): Promise<ResultadoInterpretacion> {
  const phrase = texto.trim();
  if (!phrase) {
    return {
      tipo: "aclaracion",
      mensaje: "Primero reconocé o escribí la operación que querés registrar.",
      pasosPensamiento: ["Mensaje vacío", "Esperando comando del usuario"],
    };
  }
  if (phrase.length > 500) {
    return {
      tipo: "aclaracion",
      mensaje: "El texto reconocido es muy largo. Corregilo o reducilo y volvé a intentar.",
      pasosPensamiento: ["Texto excede longitud máxima", "Solicitando síntesis al usuario"],
    };
  }

  // Corrección con contexto ("sino corrige a 5", "mejor 3", "5"): reutiliza el
  // último producto y solo cambia la cantidad, sin pasar por la IA.
  // Si la corrección nombra otro producto ("sino 3 chompas"), sigue la vía normal.
  if (contexto?.ultimoProductoNombre && esFraseDeCorreccion(phrase)) {
    const frase = extraerFraseCorregida(phrase);
    const sinCantidad = limpiarNombreProducto(frase.replace(/\d+/g, " "))
      .replace(/\b(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!sinCantidad) {
      const cantidad = extraerCantidad(frase) ?? extraerCantidad(phrase);
      if (cantidad) {
        const product = await resolveProduct(contexto.ultimoProductoNombre, readApi);
        if (product) {
          return {
            tipo: "venta",
            lineas: [{ producto: product, cantidadSolicitada: cantidad }],
            fueCorreccion: true,
            pasosPensamiento: [
              "Detectado marcador de corrección en lenguaje natural",
              `Mantenido producto previo: ${product.nombre} (${product.codigo})`,
              `Actualizada cantidad a: ${cantidad} unidades`,
            ],
          };
        }
      }
    }
  }

  let response;
  try {
    response = await interpretarTextoVoz(phrase, {
      historial: contexto?.historial,
      sucursales: contexto?.sucursales,
      authorization: contexto?.authorization,
    });
  } catch {
    throw new InterpretacionError("No se pudo interpretar la operación.");
  }

  // 0. Conversational intent (saludos, asistencia general, dudas)
  if (response.accion === "conversacion") {
    return {
      tipo: "conversacion",
      mensaje: response.respuestaConversacional || "¡Hola! Estoy listo para ayudarte a registrar ventas, consultar stock de prendas en sucursales o revisar las ventas de hoy. ¿En qué te ayudo?",
      pasosPensamiento: ["Interacción conversacional fluida"],
    };
  }

  // 1. Product search: only a named product term reaches the catalog API.
  if (response.accion === "buscar_producto") {
    const query = response.consulta?.producto?.trim() ?? "";
    if (!esConsultaProductoEspecifica(query)) {
      return {
        tipo: "aclaracion",
        mensaje: "Indicá el nombre o código del producto que querés buscar.",
        pasosPensamiento: ["Búsqueda de catálogo sin término de producto específico"],
      };
    }
    const productos = await readApi.searchProducts(query, 12);
    return {
      tipo: "buscar_producto",
      consulta: query,
      productos,
      lineas: [],
      mensaje: productos.length
        ? `Encontré ${productos.length} producto${productos.length === 1 ? "" : "s"} para "${query}".`
        : `No encontré productos para "${query}". Probá con el nombre completo o el código SKU.`,
      pasosPensamiento: ["Intención identificada: búsqueda de catálogo", `Consulta acotada: "${query}"`],
    };
  }

  // 2. Stock inquiry
  if (response.accion === "consulta_stock") {
    const rawQuery = response.consulta?.producto?.trim() || response.productos?.[0]?.producto?.trim();
    const query = rawQuery ? limpiarNombreProducto(rawQuery) : "";
    if (!esConsultaProductoEspecifica(query)) {
      return {
        tipo: "aclaracion",
        mensaje: "¿De qué producto querés consultar el stock disponible?",
        pasosPensamiento: ["Detectada consulta de stock sin nombre de producto específico"],
      };
    }
    const sucursal = await resolverSucursalSolicitada(response.consulta?.sucursal, readApi, contexto?.authorization?.allowedBranchIds);
    if (sucursal.kind === "desconocida") {
      return {
        tipo: "aclaracion",
        mensaje: `No reconozco la sucursal "${sucursal.solicitada}". Indicá una sucursal registrada para aplicar el filtro.`,
        pasosPensamiento: ["Filtro de sucursal no reconocido", "Consulta de inventario no ejecutada"],
      };
    }
    const coincidencia = await resolverCoincidencia(query, readApi);
    if (coincidencia.kind === "candidatos") {
      return {
        tipo: "desambiguacion",
        texto: query,
        candidatos: coincidencia.products,
        intento: { accion: "consulta_stock", sucursal: sucursal.kind === "resuelta" ? sucursal.sucursal.nombre : undefined },
        pasosPensamiento: [
          `Búsqueda de "${query}" en catálogo`,
          `Múltiples opciones encontradas (${coincidencia.products.length} productos)`,
          "Requiere selección para consultar stock exacto",
        ],
      };
    }
    if (coincidencia.kind === "none") {
      throw new InterpretacionError(`No se encontró el producto "${query}". Corregí el nombre o indicá el código SKU.`);
    }
    const stockResultado = await consultarStockDe(
      coincidencia.product,
      sucursal.kind === "resuelta" ? sucursal.sucursal.nombre : undefined,
      readApi,
      contexto?.authorization?.allowedBranchIds,
    );
    return {
      ...stockResultado,
      pasosPensamiento: [
        "Intención identificada: consulta de existencias",
        `Producto resuelto: ${coincidencia.product.nombre} (${coincidencia.product.codigo})`,
        `Consultado inventario en sucursales: ${stockResultado.stockTotal} unidades totales`,
      ],
    };
  }

  // 3. Low-stock inventory inquiry
  if (response.accion === "consulta_bajo_stock") {
    const sucursal = await resolverSucursalSolicitada(response.consulta?.sucursal, readApi, contexto?.authorization?.allowedBranchIds);
    if (sucursal.kind === "desconocida") {
      return {
        tipo: "aclaracion",
        mensaje: `No reconozco la sucursal "${sucursal.solicitada}". Indicá una sucursal registrada para aplicar el filtro.`,
        pasosPensamiento: ["Filtro de sucursal no reconocido", "Consulta de inventario bajo no ejecutada"],
      };
    }
    const productos = await readApi.getLowStock(sucursal.kind === "resuelta" ? sucursal.sucursal.id : contexto?.authorization?.activeBranchId ?? undefined);
    const filtroSucursal = sucursal.kind === "resuelta" ? sucursal.sucursal.nombre : undefined;
    return {
      tipo: "consulta_bajo_stock",
      filtroSucursal,
      productos,
      lineas: [],
      mensaje: productos.length
        ? `Hay ${productos.length} producto${productos.length === 1 ? "" : "s"} con stock bajo${filtroSucursal ? ` en ${filtroSucursal}` : ""}.`
        : `No hay productos con stock bajo${filtroSucursal ? ` en ${filtroSucursal}` : ""}.`,
      pasosPensamiento: ["Intención identificada: inventario con stock bajo", `Filtro de sucursal: ${filtroSucursal ?? "Consolidado todas las sucursales"}`],
    };
  }

  // 4. Today's sales inquiry
  if (response.accion === "consulta_ventas") {
    const sucursal = await resolverSucursalSolicitada(response.consulta?.sucursal, readApi, contexto?.authorization?.allowedBranchIds);
    if (sucursal.kind === "desconocida") {
      return {
        tipo: "aclaracion",
        mensaje: `No reconozco la sucursal "${sucursal.solicitada}". Indicá una sucursal registrada para aplicar el filtro.`,
        pasosPensamiento: ["Filtro de sucursal no reconocido", "Consulta de ventas no ejecutada"],
      };
    }
    const metrics = await readApi.getTodaySales(sucursal.kind === "resuelta" ? sucursal.sucursal.id : contexto?.authorization?.activeBranchId ?? undefined);
    const filtroSucursal = sucursal.kind === "resuelta" ? sucursal.sucursal.nombre : undefined;
    const sucursalText = filtroSucursal ? `en ${filtroSucursal}` : "en todas las sucursales";
    const mensaje = `Ventas de hoy ${sucursalText}: Bs ${metrics.totalSales.toFixed(2)} (${metrics.salesCount} transacción${metrics.salesCount === 1 ? "" : "es"}).`;
    return {
      tipo: "consulta_ventas",
      filtroSucursal,
      totalVentas: metrics.totalSales,
      cantidadVentas: metrics.salesCount,
      periodo: "hoy",
      mensaje,
      pasosPensamiento: [
        "Intención identificada: resumen de ventas de la jornada",
        `Filtro de sucursal: ${filtroSucursal ?? "Consolidado todas las sucursales"}`,
        `Calculadas ${metrics.salesCount} ventas por Bs ${metrics.totalSales.toFixed(2)}`,
      ],
    };
  }

  // 2b. Catalog registration (dar de alta una prenda)
  if (response.accion === "registro_producto") {
    const datos = await interpretarRegistroProducto(phrase);
    const camposExtraidos = [
      datos.nombre ? `nombre "${datos.nombre}"` : null,
      datos.codigo ? `SKU ${datos.codigo}` : null,
      datos.categoria ? `categoría ${datos.categoria}` : null,
      datos.precio !== null ? `precio Bs ${datos.precio}` : null,
      datos.cantidad !== null ? `stock inicial ${datos.cantidad}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const mensaje = camposExtraidos
      ? `Reconocí estos datos para el nuevo producto: ${camposExtraidos}. Podés confirmar el alta o completarla en el formulario.`
      : "Detecté la intención de dar de alta un producto en catálogo. Revisá y confirmá los datos en la tarjeta a continuación:";

    return {
      tipo: "registro_producto",
      datos,
      mensaje,
      pasosPensamiento: [
        "Detectada intención: alta de nuevo producto en catálogo",
        `Entidades extraídas: ${camposExtraidos || "formulario limpio para completar"}`,
        "Generada tarjeta de previsualización para confirmación humana obligatoria (RN-03)",
      ],
    };
  }

  // 3. POS sale order
  if (response.accion === "venta") {
    const items = validateItems(response);
    if (!items) {
      return {
        tipo: "aclaracion",
        mensaje: "No se pudo identificar claramente la operación o los productos. Corregí el texto y volvé a intentar.",
        pasosPensamiento: ["Texto de venta ambiguo o sin productos estructurados"],
      };
    }
    const lines: LineaInterpretada[] = [];
    for (const item of items) {
      const nombreLimpio = limpiarNombreProducto(item.producto);
      if (!nombreLimpio) {
        return {
          tipo: "aclaracion",
          mensaje: `Entendí la cantidad (${item.cantidad}) pero no el producto. Escribí el nombre o el código SKU, por ejemplo "Vender ${item.cantidad} Jean Mom Fit".`,
          pasosPensamiento: [`Cantidad identificada (${item.cantidad}) pero falta nombre del producto`],
        };
      }
      const coincidencia = await resolverCoincidencia(nombreLimpio, readApi);
      if (coincidencia.kind === "candidatos") {
        return {
          tipo: "desambiguacion",
          texto: nombreLimpio,
          candidatos: coincidencia.products,
          intento: { accion: "venta", cantidad: item.cantidad },
          pasosPensamiento: [
            `Búsqueda textual: "${nombreLimpio}"`,
            `Encontradas ${coincidencia.products.length} alternativas coincidentes en catálogo`,
            "Esperando confirmación del producto específico",
          ],
        };
      }
      if (coincidencia.kind === "none") {
        throw new InterpretacionError(`No se encontró el producto "${nombreLimpio}". Corregí el texto y volvé a intentar.`);
      }
      lines.push({ producto: coincidencia.product, cantidadSolicitada: item.cantidad });
    }
    return lines.length
      ? {
          tipo: "venta",
          lineas: lines,
          pasosPensamiento: [
            `Intención identificada: orden de venta para ${lines.length} producto${lines.length === 1 ? "" : "s"}`,
            ...lines.map((l) => `Resuelto: ${l.cantidadSolicitada} × ${l.producto.nombre} (${l.producto.codigo})`),
            "Generando tarjeta de confirmación obligatoria con cálculo determinista (RN-03, RN-05)",
          ],
        }
      : {
          tipo: "aclaracion",
          mensaje: "No se pudo identificar ningún producto. Corregí el texto y volvé a intentar.",
          pasosPensamiento: ["No se encontraron productos coincidentes"],
        };
  }

  return { tipo: "aclaracion", mensaje: "No se pudo identificar la operación. Podés registrar una venta, consultar el stock de una prenda o consultar las ventas de hoy." };
}
