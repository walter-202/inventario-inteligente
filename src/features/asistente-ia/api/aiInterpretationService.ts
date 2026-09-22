import { z } from "zod";
import { completeChatJSON } from "../lib/aiGateway";
import type { AssistantScopeContext } from "../lib/assistantAuthorization";

const BROAD_PRODUCT_QUERY_TOKENS = new Set([
  "que", "qué", "cual", "cuál", "cuales", "cuáles", "cuanto", "cuánto", "cuantos", "cuántos",
  "hay", "tiene", "tienen", "tenemos", "producto", "productos", "prenda", "prendas",
  "articulo", "artículos", "articulo", "articulos", "todo", "todos", "todas", "disponible",
  "disponibles", "existencia", "existencias", "inventario", "catalogo", "catálogo", "en", "de",
  "la", "el", "los", "las", "un", "una", "por", "favor",
  "dime", "decime", "mis", "tu", "sus", "muestra", "mostrar", "listar", "lista",
  "mayor", "menor", "unidades", "unidad", "cantidad", "quiero", "ver", "sobre", "cada",
  "algun", "alguna", "alguno", "algunos", "algunas",
]);

/** Only named product terms can cross the assistant-to-catalog boundary. */
export function esConsultaProductoEspecifica(texto: string | null | undefined): texto is string {
  const tokens = (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[a-z0-9]+/g) ?? [];
  return tokens.some(
    (token) =>
      token.length > 1 &&
      !/^\d+$/.test(token) &&
      !BROAD_PRODUCT_QUERY_TOKENS.has(token),
  );
}

const ConsultaSchema = z.object({
  producto: z.string().trim().min(1).nullable().optional(),
  sucursal: z.string().trim().min(1).nullable().optional(),
  periodo: z.literal("hoy").nullable().optional(),
  min_stock: z.number().int().nonnegative().nullable().optional(),
}).strict();

export const VoiceInterpretationSchema = z.object({
  accion: z.enum([
    "venta",
    "buscar_producto",
    "consulta_stock",
    "consulta_bajo_stock",
    "listar_inventario",
    "consulta_ventas",
    "registro_producto",
    "conversacion",
    "desconocida",
  ]),
  productos: z.array(z.object({ producto: z.string().trim().min(1), cantidad: z.number().int().positive() }).strict()).default([]),
  consulta: ConsultaSchema.optional(),
  respuestaConversacional: z.string().trim().min(1).optional(),
}).strict().superRefine((intent, context) => {
  if (intent.accion === "buscar_producto" || intent.accion === "consulta_stock") {
    const product = intent.consulta?.producto ?? intent.productos[0]?.producto;
    if (!esConsultaProductoEspecifica(product)) {
      context.addIssue({
        code: "custom",
        path: ["consulta", "producto"],
        message: "A named product is required for this read intent.",
      });
    }
  }
  if (intent.accion === "consulta_bajo_stock" && intent.consulta?.producto) {
    context.addIssue({
      code: "custom",
      path: ["consulta", "producto"],
      message: "Low-stock queries do not accept a product filter.",
    });
  }
  if (intent.accion === "listar_inventario" && intent.consulta?.producto) {
    context.addIssue({
      code: "custom",
      path: ["consulta", "producto"],
      message: "Inventory listing does not accept a product filter.",
    });
  }
  if (intent.accion === "consulta_ventas" && intent.consulta?.periodo !== "hoy") {
    context.addIssue({
      code: "custom",
      path: ["consulta", "periodo"],
      message: "Only today's sales are allowlisted.",
    });
  }
});
export type ProductoInterpretado = z.infer<typeof VoiceInterpretationSchema>["productos"][number];
export type RespuestaInterpretacion = z.infer<typeof VoiceInterpretationSchema>;

const numberWords: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

/** Marcadores de corrección en lenguaje natural: "sino corrige a 5", "mejor 3", "no, eran 2". */
const MARCADORES_CORRECCION = [
  "si no",
  "sino",
  "mejor",
  "corrige",
  "corrígeme",
  "corrigeme",
  "cambia",
  "cámbialo",
  "digo",
  "perdon",
  "perdón",
  "no eran",
  "no era",
];

/** Palabras de relleno que no son parte del nombre del producto: "5 unidades de venta". */
const RELLENO_PRODUCTO = /\b(unidades?|uds?|piezas?|prendas?|art[ií]culos?|cajas?)\b/gi;
const COLA_ACCION = /\bde\s+(ventas?|compras?|llevadas?)\b|\bpara\s+(vender|llevar|cobrar|anotar)\b/gi;

/** ¿La frase es una corrección a lo anterior? ("sino 5", "mejor 3", "no, eran 2") */
export function esFraseDeCorreccion(texto: string): boolean {
  const normalized = texto.toLowerCase();
  if (MARCADORES_CORRECCION.some((marker) => normalized.includes(marker))) return true;
  // Cantidad suelta ("5", "5 unidades") también suele ser una corrección.
  return /^\s*(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*(unidades?|uds?|piezas?|prendas?)?\s*[.,]?\s*$/i.test(texto);
}

/**
 * Si hay corrección, devuelve solo la última intención ("Vender 2000 X, sino 5"
 * → "5"). Si no hay marcador, devuelve el texto tal cual.
 */
export function extraerFraseCorregida(texto: string): string {
  const normalized = texto.toLowerCase();
  let cutIndex = -1;
  for (const marker of MARCADORES_CORRECCION) {
    const index = normalized.lastIndexOf(marker);
    if (index > cutIndex) cutIndex = index;
  }
  if (cutIndex === -1) return texto;
  const after = texto.slice(cutIndex).replace(/^[a-záéíóúñ]+\s*/i, "").trim();
  const cleaned = after.replace(/^[,.:;]\s*/, "").replace(/^(a|al|lo|la|los)\s+/i, "").trim();
  return cleaned || texto;
}

/** Extrae la primera cantidad mencionada ("corrige a 5" → 5, "mejor dos" → 2). */
export function extraerCantidad(texto: string): number | null {
  const digits = texto.match(/(\d+)/);
  if (digits) return Math.max(1, Math.floor(Number(digits[1])));
  const normalized = texto.toLowerCase();
  for (const [word, value] of Object.entries(numberWords)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(normalized)) return value;
  }
  return null;
}

/** Quita relleno del nombre ("5 unidades de venta" → ""). */
export function limpiarNombreProducto(nombre: string): string {
  return nombre
    .replace(/<[^>]*>/g, " ")
    .replace(RELLENO_PRODUCTO, " ")
    .replace(COLA_ACCION, " ")
    .replace(/^(de|del|los|las|el|la|unos|unas)\s+/i, "")
    .replace(/\s+(por favor|gracias|rápido|rapido|nomas|nomás)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @deprecated Branch names are now loaded dynamically from Supabase.
 * Kept as an empty-array default for backward compatibility with callers
 * that don't pass a branches list.
 */
export const KNOWN_BRANCHES: string[] = [];

function extractSucursalMention(text: string, branches: string[] = KNOWN_BRANCHES): string | null {
  const normalized = text.toLowerCase();
  for (const branch of branches) {
    if (normalized.includes(branch.toLowerCase())) return branch;
  }

  // Preserve an explicit but unknown branch so execution can reject it instead of
  // accidentally converting the request into an all-branches query.
  const explicit = normalized.match(/\b(?:en\s+(?:la\s+)?sucursal|sucursal|en)\s+([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,2})\s*[?!.]*$/i)?.[1]?.trim();
  if (!explicit || /^(?:todas?\s+las\s+sucursales|general|la\s+red)$/i.test(explicit)) return null;
  return explicit;
}

const LOW_STOCK_QUERY_WORDS = ["bajo stock", "stock bajo", "poco stock", "por agotarse", "por reponer", "inventario bajo"];
const PRODUCT_SEARCH_WORDS = ["buscar", "buscá", "busca", "encontrar", "encontrá", "encuentra", "mostrar", "mostrame", "muéstrame"];

/** Frases de listado amplio de inventario/productos ("dime mis productos..."). */
const LISTAR_INVENTORY_PHRASES = [
  "productos disponibles",
  "producto disponibles",
  "mis productos",
  "lista de productos",
  "listado de productos",
  "listar productos",
  "listame los productos",
  "listá los productos",
  "muestrame los productos",
  "mostrar los productos",
  "mostrame mis productos",
  "que productos tenemos",
  "qué productos tenemos",
  "que productos hay",
  "qué productos hay",
  "cuales productos hay",
  "cuáles productos hay",
  "productos con stock",
  "productos en stock",
  "productos disponibles mayor",
  "ver inventario",
  "mostrar inventario",
  "listar inventario",
  "inventario disponible",
  "tengo disponible",
  "qué tengo disponible",
];

const STOCK_AVAILABILITY_RE = /\b(disponible|disponibles|con stock|en stock|existencias?)\b/;
const STOCK_SUBJECT_RE = /\b(producto|productos|prenda|prendas|art[ií]culos?|inventario)\b/;
/** "mayor a 10", "más de 5", ">= 3", "10 o más", "al menos 7"... */
const MIN_STOCK_THRESHOLD_RE = /\b(?:mayor(?:es)?|superior(?:es)?|mas de|más de|>=?|sobre|desde|a partir de|al menos|min(?:imo|ímo)?)\s+(?:que|a|de)?\s*(\d+)\b|\b(\d+)\s*(?:o mas|o más|en adelante|o superior(?:es)?)\b/i;

function extraerUmbralMinStock(texto: string): number | null {
  const match = texto.match(MIN_STOCK_THRESHOLD_RE);
  if (!match) return null;
  const raw = match[1] ?? match[2];
  const value = Math.floor(Number(raw));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function limpiarConsultaDeProducto(texto: string): string {
  let cleaned = texto;
  for (const marker of PRODUCT_SEARCH_WORDS) cleaned = cleaned.replaceAll(marker, " ");
  return cleaned
    .replace(/\b(?:producto|productos|prenda|prendas|art[ií]culo|art[ií]culos|cat[aá]logo)\b/gi, " ")
    .replace(/\b(?:por|de|nombre|con|el|la|los|las)\b/gi, " ")
    .replace(/[¿?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function interpretarHeuristica(texto: string, branches: string[] = KNOWN_BRANCHES): RespuestaInterpretacion {
  const normalized = texto.toLowerCase().trim();

  // 0. Conversational greetings
  const saludos = ["hola", "buen dia", "buenos dias", "buenas tardes", "buenas noches", "que tal", "ayuda", "gracias"];
  if (saludos.some((s) => normalized === s || normalized.startsWith(`${s} `) || normalized.endsWith(` ${s}`))) {
    return VoiceInterpretationSchema.parse({
      accion: "conversacion",
      productos: [],
      respuestaConversacional: "¡Hola! Estoy listo para ayudarte a registrar ventas, consultar stock de prendas en sucursales o revisar las ventas de hoy. ¿En qué te ayudo?",
    });
  }

  // 1. Sales query intent (e.g. "¿cuánto se vendió hoy?", "resumen de ventas")
  const salesQueryWords = [
    "cuanto se vendio",
    "cuánto se vendió",
    "cuanto vendimos",
    "cuánto vendimos",
    "ventas de hoy",
    "resumen de ventas",
    "total vendido",
    "arqueo",
    "cuanto fue la venta",
    "cuánto fue la venta",
  ];
  if (salesQueryWords.some((word) => normalized.includes(word))) {
    const sucursal = extractSucursalMention(normalized, branches);
    return VoiceInterpretationSchema.parse({
      accion: "consulta_ventas",
      productos: [],
      consulta: {
        producto: null,
        sucursal,
        periodo: "hoy",
      },
    });
  }

  // 2. Allowlisted inventory reads. Generic questions stay unknown; they must never
  // become product-search input just because they mention stock.
  if (LOW_STOCK_QUERY_WORDS.some((word) => normalized.includes(word))) {
    return VoiceInterpretationSchema.parse({
      accion: "consulta_bajo_stock",
      productos: [],
      consulta: { producto: null, sucursal: extractSucursalMention(normalized, branches), periodo: null },
    });
  }

  // 2.5 Broad inventory listing with optional stock threshold
  // ("dime mis productos disponibles mayor a 10 unidades", "¿qué productos tenemos?")
  const umbralMinStock = extraerUmbralMinStock(normalized);
  const esListadoInventario =
    umbralMinStock !== null ||
    LISTAR_INVENTORY_PHRASES.some((phrase) => normalized.includes(phrase)) ||
    (STOCK_AVAILABILITY_RE.test(normalized) && STOCK_SUBJECT_RE.test(normalized));
  if (esListadoInventario) {
    const minStock = umbralMinStock ?? (STOCK_AVAILABILITY_RE.test(normalized) ? 1 : null);
    return VoiceInterpretationSchema.parse({
      accion: "listar_inventario",
      productos: [],
      consulta: {
        producto: null,
        sucursal: extractSucursalMention(normalized, branches),
        periodo: null,
        min_stock: minStock,
      },
    });
  }

  if (PRODUCT_SEARCH_WORDS.some((word) => normalized.includes(word))) {
    const productQuery = limpiarConsultaDeProducto(normalized);
    if (esConsultaProductoEspecifica(productQuery)) {
      return VoiceInterpretationSchema.parse({
        accion: "buscar_producto",
        productos: [],
        consulta: { producto: productQuery, sucursal: null, periodo: null },
      });
    }
  }

  // 3. Stock query intent (e.g. "¿cuánto stock queda de Jean Mom Fit?", "¿cuántas chompas quedan en San Miguel?")
  const stockQueryWords = [
    "stock",
    "cuánto queda",
    "cuanto queda",
    "cuántas quedan",
    "cuantas quedan",
    "cuántos quedan",
    "cuantos quedan",
    "cuánto hay",
    "cuanto hay",
    "cuántos hay",
    "cuantos hay",
    "disponible",
    "disponibilidad",
    "existencia",
    "quedan de",
    "hay de",
  ];
  if (stockQueryWords.some((word) => normalized.includes(word))) {
    const sucursal = extractSucursalMention(normalized, branches);
    let clean = normalized;
    for (const word of stockQueryWords) {
      clean = clean.replace(new RegExp(`(?:¿)?\\s*\\b${word}\\b\\s*(?:de|del|en|para)?`, "gi"), " ");
    }
    if (sucursal) {
      clean = clean.replace(new RegExp(`(?:en|de|la sucursal|sucursal)?\\s*${sucursal}`, "gi"), " ");
    }
    clean = clean
      .replace(/[¿?]/g, "")
      .replace(/^(de|del|los|las|el|la|unos|unas)\s+/gi, "")
      .replace(/\s+(por favor|gracias)$/gi, "")
      .trim();

    if (esConsultaProductoEspecifica(clean)) {
      return VoiceInterpretationSchema.parse({
        accion: "consulta_stock",
        productos: [{ producto: clean, cantidad: 1 }],
        consulta: {
          producto: clean,
          sucursal,
          periodo: null,
        },
      });
    }
    return VoiceInterpretationSchema.parse({ accion: "desconocida", productos: [] });
  }

  // 2b. Catalog registration intent (e.g. "quiero registrar una prenda nueva...").
  const registroMarkers = [
    "prenda nueva",
    "producto nuevo",
    "nueva prenda",
    "nuevo producto",
    "registrar prenda",
    "registrar producto",
    "crear producto",
    "dar de alta",
    "al catálogo",
    "al catalogo",
    "nuevo ingreso",
  ];
  if (registroMarkers.some((marker) => normalized.includes(marker))) {
    return VoiceInterpretationSchema.parse({
      accion: "registro_producto",
      productos: [],
      consulta: undefined,
    });
  }

  // 3. POS sale intent (e.g. "vender dos chompas", "lleva un vestido")
  const fraseVenta = extraerFraseCorregida(texto);
  const saleWords = ["vender", "venta", "lleva", "cobrar", "anotar", "pedido", "registrar"];
  const hasSaleIntent = saleWords.some((word) => fraseVenta.toLowerCase().includes(word));
  const normalizedVenta = fraseVenta.toLowerCase().trim();
  const regex = /(?:(?:vender|venta|lleva|anotar|cobrar|registrar)\s+)?(?:(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+)?([a-záéíóúñ\s-]+?)(?=(?:,|\sy\s|\scon\s|$))/gi;
  const products: ProductoInterpretado[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalizedVenta)) !== null) {
    const name = limpiarNombreProducto(match[2] ?? "");
    if (name.length <= 2 || saleWords.includes(name) || !esConsultaProductoEspecifica(name)) continue;
    const rawQuantity = match[1];
    const quantity = rawQuantity ? (Number.isNaN(Number(rawQuantity)) ? numberWords[rawQuantity] ?? 1 : Number(rawQuantity)) : 1;
    products.push({ producto: name, cantidad: Math.max(1, Math.floor(quantity)) });
  }

  return VoiceInterpretationSchema.parse({
    accion: products.length > 0 ? "venta" : hasSaleIntent ? "venta" : "desconocida",
    productos: products,
    consulta: undefined,
  });
}

export interface OpcionesInterpretacion {
  historial?: Array<{ role: "usuario" | "asistente"; texto: string }>;
  sucursales?: string[];
  authorization?: AssistantScopeContext;
}

/**
 * Interprets voice text for point-of-sale commands and Q&A via the multi-provider AI Gateway
 * with local heuristic fallback. Supports multi-turn contextual memory and dynamic branches.
 */
export async function interpretarTextoVoz(
  texto: string,
  opciones?: OpcionesInterpretacion,
): Promise<RespuestaInterpretacion> {
  const phrase = texto.trim();
  if (!phrase) return { accion: "desconocida", productos: [] };

  const branches = opciones?.sucursales && opciones.sucursales.length > 0
    ? opciones.sucursales
    : KNOWN_BRANCHES;
  const branchesList = branches.join(", ");
  const authorizationContext = opciones?.authorization;
  const scopePrompt = authorizationContext
    ? `Contexto de alcance actual (solo informativo; nunca concede permisos): usuario ${authorizationContext.userId}, rol ${authorizationContext.role}, habilidades ${authorizationContext.abilities.join(", ") || "ninguna"}, sucursal activa ${authorizationContext.activeBranchName ?? "ninguna"}, sucursales permitidas ${authorizationContext.allowedBranchNames.join(", ") || "ninguna"}.`
    : "No hay contexto de autorización disponible; no propongas operaciones de escritura.";

  try {
    const prompt = `Eres el asistente inteligente de Lidemoda (tienda de moda boliviana).
Tu objetivo es ayudar a los vendedores a registrar ventas, consultar stock por sucursales, ver ventas de la jornada o responder dudas del sistema.
IMPORTANTE: Mantené el hilo de la conversación previa. Si el usuario hace una pregunta de seguimiento ("¿y en Calacoto?", "vendé 2 de esas", "a cuánto está?"), utilizá el contexto y entidades mencionadas en los mensajes anteriores.

Sucursales registradas: ${branchesList}.
${scopePrompt}

Respondé ÚNICAMENTE un objeto JSON válido con este esquema exacto:
{
  "accion": "venta" | "buscar_producto" | "consulta_stock" | "consulta_bajo_stock" | "listar_inventario" | "consulta_ventas" | "registro_producto" | "conversacion" | "desconocida",
  "productos": [{"producto": "nombre o código", "cantidad": 1}],
  "consulta": {
    "producto": "nombre o código del producto consultado o null",
    "sucursal": "nombre de la sucursal mencionada o null",
    "periodo": "hoy" | null,
    "min_stock": número entero mínimo de unidades o null
  },
  "respuestaConversacional": "Mensaje amable cuando accion='conversacion' o para acompañar la acción"
}
Reglas:
- Si el usuario pide vender, cobrar o llevar prendas: accion="venta", productos=[...]. Si no repite el producto pero venían hablando de uno, usa ese producto previo.
- Si la frase trae una CORRECCIÓN ("sino", "mejor", "cambia", "eran 2"): interpretá la última cantidad o producto deseado.
- Ignorá palabras de relleno: "unidades", "piezas", "de venta".
- Solo estas consultas de lectura están permitidas: buscar un producto por nombre/código (accion="buscar_producto"), stock de un producto nombrado (accion="consulta_stock"), inventario bajo (accion="consulta_bajo_stock"), listar productos/inventario con umbral opcional (accion="listar_inventario", consulta.min_stock=número o null cuando piden "disponible"/"con stock") y ventas de HOY (accion="consulta_ventas", consulta.periodo="hoy"). No inventes endpoints, filtros ni operaciones.
- Si el usuario pide listar productos disponibles o con stock ("dime mis productos disponibles mayor a 10 unidades", "¿qué productos tenemos?"): accion="listar_inventario", consulta.min_stock=10 (o el número mencionado; null si no hay umbral) y consulta.producto=null. Nunca pongas la frase completa en consulta.producto.
- Nunca copies palabras residuales de una pregunta amplia (por ejemplo "qué productos tienen stock") a consulta.producto. Si falta un nombre/código específico y no es un listado, usá accion="desconocida".
- Si el usuario menciona una sucursal, devolvé el nombre completo exacto de la lista; si no está en la lista, usá accion="desconocida". La intención es una solicitud, no autorización: el sistema valida permisos y sucursal antes de consultar.
- El modelo puede proponer una operación, pero nunca concede permisos ni confirma ventas o altas. Las ventas y escrituras requieren una confirmación humana nueva y una verificación actual de permisos y sucursal fuera del modelo.
- Si quiere DAR DE ALTA una prenda nueva en catálogo: accion="registro_producto".
- Si saluda ("hola", "buen día"), agradece ("gracias", "listo") o hace una pregunta general ("¿qué podés hacer?"): accion="conversacion", respuestaConversacional="...".
- Si no es ninguna de las anteriores: accion="desconocida", productos=[].`;

    const historyMessages: Array<{ role: "user" | "assistant"; content: string }> = (opciones?.historial ?? [])
      .slice(-8)
      .map((msg) => ({
        role: msg.role === "usuario" ? "user" as const : "assistant" as const,
        content: msg.texto,
      }));

    const result = await completeChatJSON({
      systemPrompt: prompt,
      messages: [...historyMessages, { role: "user", content: `Mensaje del usuario: "${phrase}"` }],
      schema: VoiceInterpretationSchema,
    });

    if (result.provider !== "heuristic" && result.data) {
      const parsed = VoiceInterpretationSchema.safeParse(result.data);
      if (parsed.success) {
        return parsed.data;
      }
    }
  } catch (error) {
    console.warn("AI gateway fallback to local interpreter for voice pos", error);
  }

  return interpretarHeuristica(phrase, branches);
}
