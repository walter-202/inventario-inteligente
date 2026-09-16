import type { Producto } from "../../../shared/types/domain";

export type ProductMatch =
  | { kind: "match"; product: Producto }
  | { kind: "none" }
  | { kind: "ambiguous"; products: Producto[] };

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function uniqueProducts(products: Producto[]) {
  return Array.from(new Map(products.map((product) => [product.id, product])).values());
}

/**
 * Resolve exact identifiers before fuzzy results. A fuzzy result is safe only
 * when it leaves one product; silently choosing the first result can create a
 * sale for the wrong SKU.
 */
export function matchProduct(products: Producto[], text: string): ProductMatch {
  const normalized = normalize(text);
  if (!normalized) return { kind: "none" };

  const candidates = uniqueProducts(products);
  const exactCode = candidates.filter((product) => normalize(product.codigo) === normalized);
  if (exactCode.length === 1) return { kind: "match", product: exactCode[0] };
  if (exactCode.length > 1) return { kind: "ambiguous", products: exactCode };

  const exactName = candidates.filter((product) => normalize(product.nombre) === normalized);
  if (exactName.length === 1) return { kind: "match", product: exactName[0] };
  if (exactName.length > 1) return { kind: "ambiguous", products: exactName };

  if (candidates.length === 1) return { kind: "match", product: candidates[0] };
  if (candidates.length > 1) return { kind: "ambiguous", products: candidates };
  return { kind: "none" };
}
