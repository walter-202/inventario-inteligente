import type { Producto } from "../../../shared/types/domain";

export type ProductMatch =
  | { kind: "match"; product: Producto }
  | { kind: "none" }
  | { kind: "ambiguous"; products: Producto[] };

function normalize(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Normaliza códigos dictados por voz: el STT suele devolver "jea 001",
 * "gea-001" o "jea guion 001" en lugar de "JEA-001".
 */
export function normalizarCodigoSKU(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/\b(guion|guión|dash|menos)\b/gi, "-")
    .replace(/-+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

/** ¿Parece un SKU/código (letras+números) y no una palabra suelta? */
export function pareceSKU(value: string): boolean {
  const normalized = normalizarCodigoSKU(value);
  return /[a-z]/.test(normalized) && /\d/.test(normalized) && normalized.length >= 3 && /^[a-z0-9-]+$/.test(normalized);
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
  const normalizedCode = normalizarCodigoSKU(normalized);
  const byNormalizedCode = candidates.filter((product) => normalizarCodigoSKU(product.codigo) === normalizedCode);
  if (byNormalizedCode.length === 1) return { kind: "match", product: byNormalizedCode[0] };
  if (byNormalizedCode.length > 1) return { kind: "ambiguous", products: byNormalizedCode };

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
