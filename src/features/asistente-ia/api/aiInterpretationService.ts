import { z } from "zod";
import { completeChatJSON } from "../lib/aiGateway";

export const VoiceInterpretationSchema = z.object({
  accion: z.enum(["venta", "desconocida"]),
  productos: z.array(z.object({ producto: z.string().trim().min(1), cantidad: z.number().int().positive() })),
});
export type ProductoInterpretado = z.infer<typeof VoiceInterpretationSchema>["productos"][number];
export type RespuestaInterpretacion = z.infer<typeof VoiceInterpretationSchema>;

const numberWords: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

export function interpretarHeuristica(texto: string): RespuestaInterpretacion {
  const normalized = texto.toLowerCase().trim();
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
  return VoiceInterpretationSchema.parse({ accion: products.length > 0 ? "venta" : hasSaleIntent ? "venta" : "desconocida", productos: products });
}

/**
 * Interprets voice text for point-of-sale commands via the multi-provider AI Gateway
 * with local heuristic fallback.
 */
export async function interpretarTextoVoz(texto: string): Promise<RespuestaInterpretacion> {
  const phrase = texto.trim();
  if (!phrase) return { accion: "desconocida", productos: [] };

  try {
    const prompt = 'Eres un asistente de punto de venta en español para Lidemoda. Responde SOLO JSON válido con {"accion":"venta"|"desconocida","productos":[{"producto":"nombre o código","cantidad":1}]}. Si la frase no es una venta clara, usa accion desconocida y productos vacíos.';
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
