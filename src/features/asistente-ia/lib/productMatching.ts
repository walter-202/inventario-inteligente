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

const STOPWORDS_BUSQUEDA = new Set([
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "de",
  "del",
  "al",
  "a",
  "en",
  "con",
  "por",
  "para",
  "y",
  "o",
  "u",
  "the",
  "of",
  "and",
]);

function foldDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function stemSpanishToken(word: string): string {
  const lower = word.toLocaleLowerCase("es");
  if (lower.endsWith("es") && lower.length > 4) return lower.slice(0, -2);
  if (lower.endsWith("s") && lower.length > 3) return lower.slice(0, -1);
  return lower;
}

/**
 * Spanish plurals from speech ("labiales", "sombras") otherwise miss "Labial" / "Sombra".
 */
export function variantesBusquedaProducto(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const variants = new Set<string>([trimmed]);
  const stemmed = trimmed
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLocaleLowerCase("es");
      if (lower.endsWith("es") && lower.length > 4) return word.slice(0, -2);
      if (lower.endsWith("s") && lower.length > 3) return word.slice(0, -1);
      return word;
    })
    .join(" ");
  if (stemmed !== trimmed) variants.add(stemmed);
  return [...variants];
}

/** Palabras distintivas: sin de/para y en singular (sombra, ceja, adhesivo, pestaña, agenda). */
export function tokensBusquedaProducto(query: string): string[] {
  const tokens = query
    .trim()
    .toLocaleLowerCase("es")
    .split(/[^a-z0-9áéíóúüñ]+/i)
    .map(stemSpanishToken)
    .filter((token) => token.length >= 3 && !STOPWORDS_BUSQUEDA.has(token) && !STOPWORDS_BUSQUEDA.has(foldDiacritics(token)));
  return [...new Set(tokens)];
}

/**
 * Extra ILIKE terms when the full phrase misses: `sombra%ceja` matches
 * "Sombra para cejas Delicacy" even if the user said "delicadas".
 */
export function extraTerminosBusquedaProducto(query: string): string[] {
  const tokens = tokensBusquedaProducto(query);
  const extra: string[] = [];
  if (tokens.length >= 2) extra.push(`${tokens[0]}%${tokens[1]}`);
  extra.push(...tokens);
  return extra;
}

export function escapeIlikeQuery(value: string): string {
  return value.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenMatchesNombre(nombre: string, token: string): boolean {
  const nameLower = nombre.toLocaleLowerCase("es");
  const nameFold = foldDiacritics(nameLower);
  const folded = foldDiacritics(token);
  if (nameLower.includes(token) || nameFold.includes(folded)) return true;

  const nameTokens = tokensBusquedaProducto(nombre);
  if (nameTokens.some((item) => item === token || item.startsWith(token) || token.startsWith(item))) return true;
  const nameFolds = nameTokens.map(foldDiacritics);
  if (nameFolds.some((item) => item === folded || item.startsWith(folded) || folded.startsWith(item))) return true;

  if (folded.length >= 5) {
    const prefix = folded.slice(0, 5);
    if (nameFold.includes(prefix) || nameFolds.some((item) => item.startsWith(prefix))) return true;
  }
  return false;
}

export function contarAciertosNombre(nombre: string, query: string): number {
  return tokensBusquedaProducto(query).filter((token) => tokenMatchesNombre(nombre, token)).length;
}

export function rankProductsByQuery(products: Producto[], query: string): Producto[] {
  const tokens = tokensBusquedaProducto(query);
  if (tokens.length === 0) return uniqueProducts(products);

  const minHits = tokens.length <= 2 ? tokens.length : Math.ceil(tokens.length * 0.66);
  const scored = uniqueProducts(products)
    .map((product) => ({ product, hits: contarAciertosNombre(product.nombre, query) }))
    .filter((entry) => entry.hits >= minHits)
    .sort((left, right) => right.hits - left.hits || left.product.nombre.localeCompare(right.product.nombre, "es"));

  if (scored.length === 0) return [];
  const bestHits = scored[0].hits;
  return scored.filter((entry) => entry.hits === bestHits).map((entry) => entry.product);
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
  const nameContains = candidates.filter((product) => {
    const name = normalize(product.nombre);
    return name === normalized || name.includes(normalized);
  });
  if (nameContains.length === 1) return { kind: "match", product: nameContains[0] };
  if (nameContains.length > 1) return { kind: "ambiguous", products: nameContains };
  if (exactName.length === 1) return { kind: "match", product: exactName[0] };
  if (exactName.length > 1) return { kind: "ambiguous", products: exactName };

  const ranked = rankProductsByQuery(candidates, text);
  if (ranked.length === 1) return { kind: "match", product: ranked[0] };
  if (ranked.length > 1) return { kind: "ambiguous", products: ranked };
  if (candidates.length === 1) return { kind: "match", product: candidates[0] };
  return { kind: "none" };
}
