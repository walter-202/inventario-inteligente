import type { Producto } from "../../../shared/types/domain";
import { obtenerProductos } from "../../productos/api/productosApi";
import { matchProduct } from "../lib/productMatching";
import { interpretarTextoVoz, type ProductoInterpretado } from "./aiInterpretationService";

export class InterpretacionError extends Error { constructor(message: string) { super(message); this.name = "InterpretacionError"; } }
export interface LineaInterpretada { producto: Producto; cantidadSolicitada: number }
export type ResultadoInterpretacion = { tipo: "aclaracion"; mensaje: string } | { tipo: "venta"; lineas: LineaInterpretada[] };

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
  try { response = await interpretarTextoVoz(phrase); } catch { throw new InterpretacionError("No se pudo interpretar la operación."); }
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
