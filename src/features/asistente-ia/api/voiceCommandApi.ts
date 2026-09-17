import type { Producto } from "../../../shared/types/domain";
import { buscarProductoPorCodigo, obtenerProductos } from "../../productos/api/productosApi";
import { ProductoNoEncontradoError } from "../../productos/lib/productLookupErrors";
import { matchProduct, normalizarCodigoSKU, pareceSKU } from "../lib/productMatching";
import type { IntentoDesambiguacion } from "../lib/chatSession";
import { interpretarTextoVoz, esFraseDeCorreccion, extraerCantidad, extraerFraseCorregida, limpiarNombreProducto, type ProductoInterpretado } from "./aiInterpretationService";
import { obtenerStockMultiSucursal } from "../../inventario/api/inventarioApi";
import { obtenerDashboardMetrics } from "../../dashboard/api/dashboardApi";
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

export type ResultadoInterpretacion =
  | { tipo: "aclaracion"; mensaje: string; pasosPensamiento?: string[] }
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
      tipo: "consulta_ventas";
      filtroSucursal?: string;
      totalVentas: number;
      cantidadVentas: number;
      periodo: string;
      mensaje: string;
      pasosPensamiento?: string[];
    };

type CoincidenciaProducto =
  | { kind: "match"; product: Producto }
  | { kind: "candidatos"; products: Producto[] }
  | { kind: "none" };

async function resolverCoincidencia(text: string): Promise<CoincidenciaProducto> {
  const query = text.trim();
  if (!query) return { kind: "none" };

  // Vía rápida SKU: "jea 001" del STT → "JEA-001" → lookup exacto por código.
  // Evita traer páginas de fuzzy cuando el usuario dictó el código.
  if (pareceSKU(query)) {
    const candidatosCodigo = Array.from(new Set([
      normalizarCodigoSKU(query).toUpperCase(),
      query.trim().toUpperCase(),
    ]));
    for (const codigo of candidatosCodigo) {
      try {
        const product = await buscarProductoPorCodigo(codigo);
        return { kind: "match", product };
      } catch (error) {
        if (!(error instanceof ProductoNoEncontradoError)) {
          throw new InterpretacionError("No se pudo buscar el producto. Revisá tu conexión y volvé a intentar.");
        }
      }
    }
  }

  let products: Producto[] = [];
  let page = 1;

  try {
    while (true) {
      const result = await obtenerProductos({ q: query, page });
      products.push(...result.data);
      if (result.current_page >= result.last_page) break;
      page += 1;
    }
  } catch {
    throw new InterpretacionError("No se pudo buscar el producto. Revisá tu conexión y volvé a intentar.");
  }

  const match = matchProduct(products, query);
  if (match.kind === "match") return { kind: "match", product: match.product };
  if (match.kind === "ambiguous") return { kind: "candidatos", products: match.products };
  return { kind: "none" };
}

/** Compat: un solo producto o null (la ambigüedad se resuelve vía `desambiguacion`). */
async function resolveProduct(text: string): Promise<Producto | null> {
  const coincidencia = await resolverCoincidencia(text);
  if (coincidencia.kind === "match") return coincidencia.product;
  return null;
}

function validateItems(response: { accion?: string; productos?: ProductoInterpretado[] }) {
  if (response.accion !== "venta" || !response.productos?.length) return undefined;
  const valid = response.productos.filter((item) => item.producto.trim() && Number.isInteger(item.cantidad) && item.cantidad > 0);
  return valid.length === response.productos.length ? valid : undefined;
}

/** Contexto conversacional: último producto mencionado, para resolver correcciones ("sino 5"). */
export interface VozContexto {
  ultimoProductoNombre?: string;
}

/**
 * Arma la respuesta de stock para un producto ya elegido (vía directa o tras
 * desambiguar en el chat). Solo lectura: desglose por sucursal + mensaje.
 */
export async function consultarStockDe(
  product: Producto,
  sucursalMencionada?: string,
): Promise<Extract<ResultadoInterpretacion, { tipo: "consulta_stock" }>> {
  const multiStock = await obtenerStockMultiSucursal();
  const productRows = multiStock.filter((item) => item.producto_id === product.id);

  const desglose: StockSucursalDetalle[] = productRows.map((item) => ({
    sucursalId: item.sucursal_id,
    sucursalNombre: item.sucursal.nombre,
    cantidad: item.cantidad,
  }));

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

export async function interpretarVoz(texto: string, contexto?: VozContexto): Promise<ResultadoInterpretacion> {
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
        const product = await resolveProduct(contexto.ultimoProductoNombre);
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
    response = await interpretarTextoVoz(phrase);
  } catch {
    throw new InterpretacionError("No se pudo interpretar la operación.");
  }

  // 1. Stock inquiry
  if (response.accion === "consulta_stock") {
    const rawQuery = response.consulta?.producto?.trim() || response.productos?.[0]?.producto?.trim();
    const query = rawQuery ? limpiarNombreProducto(rawQuery) : "";
    if (!query) {
      return {
        tipo: "aclaracion",
        mensaje: "¿De qué producto querés consultar el stock disponible?",
        pasosPensamiento: ["Detectada consulta de stock sin nombre de producto"],
      };
    }
    const coincidencia = await resolverCoincidencia(query);
    if (coincidencia.kind === "candidatos") {
      return {
        tipo: "desambiguacion",
        texto: query,
        candidatos: coincidencia.products,
        intento: { accion: "consulta_stock", sucursal: response.consulta?.sucursal ?? undefined },
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
    const stockResultado = await consultarStockDe(coincidencia.product, response.consulta?.sucursal ?? undefined);
    return {
      ...stockResultado,
      pasosPensamiento: [
        "Intención identificada: consulta de existencias",
        `Producto resuelto: ${coincidencia.product.nombre} (${coincidencia.product.codigo})`,
        `Consultado inventario en sucursales: ${stockResultado.stockTotal} unidades totales`,
      ],
    };
  }

  // 2. Sales inquiry
  if (response.accion === "consulta_ventas") {
    const sucursalFiltro = response.consulta?.sucursal?.toLowerCase().trim();
    let targetSucursalId: number | undefined = undefined;
    let targetSucursalNombre = "";

    if (sucursalFiltro) {
      const branches = await obtenerSucursales();
      const matched = branches.find((b) => b.nombre.toLowerCase().includes(sucursalFiltro));
      if (matched) {
        targetSucursalId = matched.id;
        targetSucursalNombre = matched.nombre;
      }
    }

    const metrics = await obtenerDashboardMetrics(targetSucursalId);
    const sucursalText = targetSucursalNombre ? `en ${targetSucursalNombre}` : "en todas las sucursales";
    const mensaje = `Ventas de hoy ${sucursalText}: Bs ${metrics.totalSales.toFixed(2)} (${metrics.salesCount} transacción${metrics.salesCount === 1 ? "" : "es"}).`;

    return {
      tipo: "consulta_ventas",
      filtroSucursal: targetSucursalNombre || undefined,
      totalVentas: metrics.totalSales,
      cantidadVentas: metrics.salesCount,
      periodo: "hoy",
      mensaje,
      pasosPensamiento: [
        "Intención identificada: resumen de ventas de la jornada",
        `Filtro de sucursal: ${targetSucursalNombre || "Consolidado todas las sucursales"}`,
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
      const coincidencia = await resolverCoincidencia(nombreLimpio);
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
