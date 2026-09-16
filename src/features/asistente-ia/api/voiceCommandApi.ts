import type { Producto } from "../../../shared/types/domain";
import { obtenerProductos } from "../../productos/api/productosApi";
import { matchProduct } from "../lib/productMatching";
import { interpretarTextoVoz, type ProductoInterpretado } from "./aiInterpretationService";
import { obtenerStockMultiSucursal } from "../../inventario/api/inventarioApi";
import { obtenerDashboardMetrics } from "../../dashboard/api/dashboardApi";
import { obtenerSucursales } from "../../../shared/api/sucursalesApi";

export class InterpretacionError extends Error { constructor(message: string) { super(message); this.name = "InterpretacionError"; } }
export interface LineaInterpretada { producto: Producto; cantidadSolicitada: number }

export interface StockSucursalDetalle {
  sucursalId: number;
  sucursalNombre: string;
  cantidad: number;
}

export type ResultadoInterpretacion =
  | { tipo: "aclaracion"; mensaje: string }
  | { tipo: "venta"; lineas: LineaInterpretada[] }
  | {
      tipo: "consulta_stock";
      producto: Producto;
      filtroSucursal?: string;
      desglose: StockSucursalDetalle[];
      stockTotal: number;
      mensaje: string;
    }
  | {
      tipo: "consulta_ventas";
      filtroSucursal?: string;
      totalVentas: number;
      cantidadVentas: number;
      periodo: string;
      mensaje: string;
    };

async function resolveProduct(text: string) {
  const products: Producto[] = [];
  let page = 1;

  while (true) {
    const result = await obtenerProductos({ q: text.trim(), page });
    products.push(...result.data);
    if (result.current_page >= result.last_page) break;
    page += 1;
  }

  const match = matchProduct(products, text);
  if (match.kind === "match") return match.product;
  if (match.kind === "ambiguous") {
    throw new InterpretacionError(
      `Se encontraron varias coincidencias para "${text}". Indicá el código o el nombre completo para confirmar.`,
    );
  }
  return null;
}

function validateItems(response: { accion?: string; productos?: ProductoInterpretado[] }) {
  if (response.accion !== "venta" || !response.productos?.length) return undefined;
  const valid = response.productos.filter((item) => item.producto.trim() && Number.isInteger(item.cantidad) && item.cantidad > 0);
  return valid.length === response.productos.length ? valid : undefined;
}

export async function interpretarVoz(texto: string): Promise<ResultadoInterpretacion> {
  const phrase = texto.trim();
  if (!phrase) return { tipo: "aclaracion", mensaje: "Primero reconocé o escribí la operación que querés registrar." };
  if (phrase.length > 500) return { tipo: "aclaracion", mensaje: "El texto reconocido es muy largo. Corregilo o reducilo y volvé a intentar." };
  let response;
  try {
    response = await interpretarTextoVoz(phrase);
  } catch {
    throw new InterpretacionError("No se pudo interpretar la operación.");
  }

  // 1. Stock inquiry
  if (response.accion === "consulta_stock") {
    const query = response.consulta?.producto?.trim() || response.productos?.[0]?.producto?.trim();
    if (!query) {
      return { tipo: "aclaracion", mensaje: "¿De qué producto querés consultar el stock disponible?" };
    }
    const product = await resolveProduct(query);
    if (!product) {
      throw new InterpretacionError(`No se encontró el producto "${query}". Corregí el nombre o indicá el código SKU.`);
    }

    const multiStock = await obtenerStockMultiSucursal();
    const productRows = multiStock.filter((item) => item.producto_id === product.id);

    const desglose: StockSucursalDetalle[] = productRows.map((item) => ({
      sucursalId: item.sucursal_id,
      sucursalNombre: item.sucursal.nombre,
      cantidad: item.cantidad,
    }));

    const stockTotal = desglose.reduce((sum, item) => sum + item.cantidad, 0);
    const sucursalFiltro = response.consulta?.sucursal?.toLowerCase().trim();

    let mensaje = "";
    if (sucursalFiltro) {
      const matched = desglose.find((b) => b.sucursalNombre.toLowerCase().includes(sucursalFiltro));
      if (matched) {
        mensaje = `Hay ${matched.cantidad} unidad(es) de "${product.nombre}" en sucursal ${matched.sucursalNombre}. (Stock global: ${stockTotal} uds).`;
      } else {
        mensaje = `No hay stock registrado en "${response.consulta?.sucursal}". Total en otras sucursales: ${stockTotal} uds.`;
      }
    } else {
      const listado = desglose.map((b) => `${b.sucursalNombre}: ${b.cantidad} uds`).join(", ");
      mensaje = `Stock total de "${product.nombre}": ${stockTotal} unidades (${listado || "Sin stock"}).`;
    }

    return {
      tipo: "consulta_stock",
      producto: product,
      filtroSucursal: response.consulta?.sucursal ?? undefined,
      desglose,
      stockTotal,
      mensaje,
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
    };
  }

  // 3. POS sale order
  if (response.accion === "venta") {
    const items = validateItems(response);
    if (!items) return { tipo: "aclaracion", mensaje: "No se pudo identificar claramente la operación o los productos. Corregí el texto y volvé a intentar." };
    const lines: LineaInterpretada[] = [];
    for (const item of items) {
      const product = await resolveProduct(item.producto);
      if (!product) throw new InterpretacionError(`No se encontró el producto "${item.producto}". Corregí el texto y volvé a intentar.`);
      lines.push({ producto: product, cantidadSolicitada: item.cantidad });
    }
    return lines.length ? { tipo: "venta", lineas: lines } : { tipo: "aclaracion", mensaje: "No se pudo identificar ningún producto. Corregí el texto y volvé a intentar." };
  }

  return { tipo: "aclaracion", mensaje: "No se pudo identificar la operación. Podés registrar una venta, consultar el stock de una prenda o consultar las ventas de hoy." };
}
