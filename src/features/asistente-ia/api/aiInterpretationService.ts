import { z } from "zod";
import { completeChatJSON } from "../lib/aiGateway";

export const VoiceInterpretationSchema = z.object({
  accion: z.enum([
    "venta",
    "consulta_stock",
    "consulta_ventas",
    "registro_producto",
    "conversacion",
    "desconocida",
  ]),
  productos: z.array(z.object({ producto: z.string().trim().min(1), cantidad: z.number().int().positive() })).default([]),
  consulta: z.object({
    producto: z.string().nullable().optional(),
    sucursal: z.string().nullable().optional(),
    periodo: z.string().nullable().optional(),
  }).optional(),
  respuestaConversacional: z.string().optional(),
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
    .replace(RELLENO_PRODUCTO, " ")
    .replace(COLA_ACCION, " ")
    .replace(/^(de|del|los|las|el|la|unos|unas)\s+/i, "")
    .replace(/\s+(por favor|gracias|rápido|rapido|nomas|nomás)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const KNOWN_BRANCHES = [
  "san miguel",
  "calacoto",
  "comercio",
  "ceja",
  "central",
  "montenegro",
  "miraflores",
  "sopocachi",
  "equipetrol",
];

function extractSucursalMention(text: string, branches: string[] = KNOWN_BRANCHES): string | null {
  const normalized = text.toLowerCase();
  for (const branch of branches) {
    if (normalized.includes(branch.toLowerCase())) return branch;
  }
  return null;
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

  // 2. Stock query intent (e.g. "¿cuánto stock queda de Jean Mom Fit?", "¿cuántas chompas quedan en San Miguel?")
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
      clean = clean.replace(new RegExp(`(?:¿)?\\s*${word}\\s*(?:de|del|en|para)?`, "gi"), " ");
    }
    if (sucursal) {
      clean = clean.replace(new RegExp(`(?:en|de|la sucursal|sucursal)?\\s*${sucursal}`, "gi"), " ");
    }
    clean = clean
      .replace(/[¿?]/g, "")
      .replace(/^(de|del|los|las|el|la|unos|unas)\s+/gi, "")
      .replace(/\s+(por favor|gracias)$/gi, "")
      .trim();

    return VoiceInterpretationSchema.parse({
      accion: "consulta_stock",
      productos: clean ? [{ producto: clean, cantidad: 1 }] : [],
      consulta: {
        producto: clean || null,
        sucursal,
        periodo: null,
      },
    });
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
    if (name.length <= 2 || saleWords.includes(name)) continue;
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

  try {
    const prompt = `Eres el asistente inteligente de Lidemoda (tienda de moda boliviana).
Tu objetivo es ayudar a los vendedores a registrar ventas, consultar stock por sucursales, ver ventas de la jornada o responder dudas del sistema.
IMPORTANTE: Mantené el hilo de la conversación previa. Si el usuario hace una pregunta de seguimiento ("¿y en Calacoto?", "vendé 2 de esas", "a cuánto está?"), utilizá el contexto y entidades mencionadas en los mensajes anteriores.

Sucursales registradas: ${branchesList}.

Respondé ÚNICAMENTE un objeto JSON válido con este esquema exacto:
{
  "accion": "venta" | "consulta_stock" | "consulta_ventas" | "registro_producto" | "conversacion" | "desconocida",
  "productos": [{"producto": "nombre o código", "cantidad": 1}],
  "consulta": {
    "producto": "nombre o código del producto consultado o null",
    "sucursal": "nombre de la sucursal mencionada o null",
    "periodo": "hoy" | "semana" | "mes" | null
  },
  "respuestaConversacional": "Mensaje amable cuando accion='conversacion' o para acompañar la acción"
}
Reglas:
- Si el usuario pide vender, cobrar o llevar prendas: accion="venta", productos=[...]. Si no repite el producto pero venían hablando de uno, usa ese producto previo.
- Si la frase trae una CORRECCIÓN ("sino", "mejor", "cambia", "eran 2"): interpretá la última cantidad o producto deseado.
- Ignorá palabras de relleno: "unidades", "piezas", "de venta".
- Si consulta stock, existencias o si queda alguna prenda: accion="consulta_stock", consulta.producto=nombre/código, consulta.sucursal=sucursal o null. Si solo dice "¿y en Central?", conserva el producto anterior y cambia la sucursal.
- Si consulta ventas del día o recaudación: accion="consulta_ventas", consulta.periodo="hoy", consulta.sucursal=sucursal o null.
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
