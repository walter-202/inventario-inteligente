import { z } from "zod";

export const VoiceInterpretationSchema = z.object({
  accion: z.enum(["venta", "desconocida"]),
  productos: z.array(z.object({ producto: z.string().trim().min(1), cantidad: z.number().int().positive() })),
});
export type ProductoInterpretado = z.infer<typeof VoiceInterpretationSchema>["productos"][number];
export type RespuestaInterpretacion = z.infer<typeof VoiceInterpretationSchema>;

const numberWords: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

function interpretarHeuristica(texto: string): RespuestaInterpretacion {
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
 * Current MVP limitation: this preserves the existing direct Gemini public-key
 * integration and local fallback. A backend Edge Function is intentionally not
 * introduced here because it would change the existing contract.
 */
export async function interpretarTextoVoz(texto: string): Promise<RespuestaInterpretacion> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (apiKey) {
    try {
      const prompt = `Eres un asistente de punto de venta en español para Lidemoda. Responde SOLO JSON válido con {"accion":"venta"|"desconocida","productos":[{"producto":"nombre o código","cantidad":1}]}. Si la frase no es una venta clara, usa accion desconocida y productos vacíos. Frase: "${texto}"`;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }),
      });
      if (response.ok) {
        const json: unknown = await response.json();
        const contentText = (json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0]?.content?.parts?.[0]?.text;
        if (contentText) {
          const parsed = VoiceInterpretationSchema.safeParse(JSON.parse(contentText));
          if (parsed.success) return parsed.data;
        }
      }
    } catch (error) {
      console.warn("Gemini direct integration fallback to local interpreter", error);
    }
  }
  return interpretarHeuristica(texto);
}
