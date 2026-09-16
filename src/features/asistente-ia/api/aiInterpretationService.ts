import { z } from "zod";
import { completeChatJSON } from "../lib/aiGateway";

export const VoiceInterpretationSchema = z.object({
  accion: z.enum(["venta", "consulta_stock", "consulta_ventas", "desconocida"]),
  productos: z.array(z.object({ producto: z.string().trim().min(1), cantidad: z.number().int().positive() })).default([]),
  consulta: z.object({
    producto: z.string().nullable().optional(),
    sucursal: z.string().nullable().optional(),
    periodo: z.string().nullable().optional(),
  }).optional(),
});
export type ProductoInterpretado = z.infer<typeof VoiceInterpretationSchema>["productos"][number];
export type RespuestaInterpretacion = z.infer<typeof VoiceInterpretationSchema>;

const numberWords: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

const KNOWN_BRANCHES = [
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

function extractSucursalMention(text: string): string | null {
  const normalized = text.toLowerCase();
  for (const branch of KNOWN_BRANCHES) {
    if (normalized.includes(branch)) return branch;
  }
  return null;
}

export function interpretarHeuristica(texto: string): RespuestaInterpretacion {
  const normalized = texto.toLowerCase().trim();

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
    const sucursal = extractSucursalMention(normalized);
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
    const sucursal = extractSucursalMention(normalized);
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

  // 3. POS sale intent (e.g. "vender dos chompas", "lleva un vestido")
  const saleWords = ["vender", "venta", "lleva", "cobrar", "anotar", "pedido", "registrar"];
  const hasSaleIntent = saleWords.some((word) => normalized.includes(word));
  const regex = /(?:(?:vender|venta|lleva|anotar|cobrar|registrar)\s+)?(?:(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+)?([a-záéíóúñ\s-]+?)(?=(?:,|\sy\s|\scon\s|$))/gi;
  const products: ProductoInterpretado[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalized)) !== null) {
    const name = (match[2] ?? "").replace(/^(de|los|las|el|la|unos|unas)\s+/i, "").replace(/\s+(por favor|gracias|rápido)$/i, "").trim();
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

/**
 * Interprets voice text for point-of-sale commands and Q&A via the multi-provider AI Gateway
 * with local heuristic fallback.
 */
export async function interpretarTextoVoz(texto: string): Promise<RespuestaInterpretacion> {
  const phrase = texto.trim();
  if (!phrase) return { accion: "desconocida", productos: [] };

  try {
    const prompt = `Eres el asistente inteligente de voz de Lidemoda (tienda de moda boliviana).
Analiza la frase y responde ÚNICAMENTE un objeto JSON válido con este esquema exacto:
{
  "accion": "venta" | "consulta_stock" | "consulta_ventas" | "desconocida",
  "productos": [{"producto": "nombre o código", "cantidad": 1}],
  "consulta": {
    "producto": "nombre o código del producto consultado o null",
    "sucursal": "nombre de la sucursal mencionada (ej: Central, San Miguel, Calacoto, Comercio, Ceja) o null",
    "periodo": "hoy" | "semana" | "mes" | null
  }
}
Reglas:
- Si el usuario pide vender, cobrar o llevar prendas: accion="venta", productos=[...].
- Si el usuario pregunta por stock, existencia o disponibilidad (ej: "¿cuánto stock hay de X?", "¿cuántas chompas quedan en San Miguel?"): accion="consulta_stock", consulta.producto=nombre/código, consulta.sucursal=sucursal o null.
- Si el usuario pregunta por ventas del día o dinero recaudado (ej: "¿cuánto vendimos hoy?", "resumen de ventas"): accion="consulta_ventas", consulta.periodo="hoy", consulta.sucursal=sucursal o null.
- Si la frase no es ninguna de las anteriores: accion="desconocida", productos=[].`;

    const result = await completeChatJSON({
      systemPrompt: prompt,
      userMessage: `Frase: "${phrase}"`,
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

  return interpretarHeuristica(phrase);
}
