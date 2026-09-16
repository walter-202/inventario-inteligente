import { z } from "zod";
import { completeChatJSON } from "../lib/aiGateway";

/**
 * Schema for AI-parsed product registration fields.
 * The model extracts whatever it can from natural speech; missing fields stay null.
 */
export const RegistroProductoSchema = z.object({
  nombre: z.string().trim().min(1).nullable().catch(null),
  codigo: z.string().trim().min(1).nullable().catch(null),
  categoria: z.string().trim().min(1).nullable().catch(null),
  precio: z.number().finite().nonnegative().nullable().catch(null),
  cantidad: z.number().int().nonnegative().nullable().catch(null),
});

export type RegistroProductoParsed = z.infer<typeof RegistroProductoSchema>;

const SYSTEM_PROMPT = [
  "Eres un asistente de registro de catálogo para Lidemoda, una empresa de moda y ropa.",
  "El usuario va a dictar por voz los datos de un nuevo producto a registrar.",
  "Extrae TODOS los campos que puedas del texto dictado:",
  '- nombre: nombre del producto (ej: "Blusa de seda roja")',
  '- codigo: código/SKU del producto si lo menciona (ej: "BLU-001")',
  '- categoria: categoría del producto (ej: "Blusas", "Pantalones", "Accesorios")',
  "- precio: precio numérico en BOB/Bs si lo menciona",
  "- cantidad: cantidad inicial de stock si la menciona",
  "",
  "Si un campo no se menciona, pon null.",
  "Responde SOLO JSON válido con esta estructura exacta:",
  '{"nombre":string|null,"codigo":string|null,"categoria":string|null,"precio":number|null,"cantidad":number|null}',
].join("\n");

/**
 * Heuristic fallback: tries to extract product fields from natural language
 * without AI. Very basic — catches common patterns like
 * "registrar blusa roja código BLU-001 precio 150 cantidad 20 categoría blusas"
 */
export function interpretarHeuristicaRegistro(texto: string): RegistroProductoParsed {
  const normalized = texto.toLowerCase().trim();

  let codigo: string | null = null;
  const codigoMatch = normalized.match(/(?:c[oó]digo|sku|c[oó]d)\s+([a-záéíóúñ0-9-]+)/i);
  if (codigoMatch) codigo = codigoMatch[1]!.toUpperCase();

  let precio: number | null = null;
  const precioMatch = normalized.match(/(?:precio|cuesta|vale|a)\s+(\d+(?:[.,]\d+)?)\s*(?:bs|bob|bolivianos)?/i);
  if (precioMatch) precio = Number(precioMatch[1]!.replace(",", "."));

  let cantidad: number | null = null;
  const cantidadMatch = normalized.match(/(?:cantidad|stock|unidades?)\s+(\d+)/i);
  if (cantidadMatch) cantidad = Number(cantidadMatch[1]);

  let categoria: string | null = null;
  const catMatch = normalized.match(/(?:categor[ií]a|tipo)\s+([a-záéíóúñ\s]+?)(?=(?:\s+(?:precio|cantidad|c[oó]digo|stock))|$)/i);
  if (catMatch) categoria = catMatch[1]!.trim().replace(/^\w/, (c) => c.toUpperCase());

  // Name: everything that's left after removing extracted fields
  let nameText = normalized;
  const removePatterns = [
    /(?:registrar|agregar|añadir|nuevo|nueva|producto)\s*/gi,
    /(?:c[oó]digo|sku|c[oó]d)\s+[a-záéíóúñ0-9-]+/gi,
    /(?:precio|cuesta|vale|a)\s+\d+(?:[.,]\d+)?\s*(?:bs|bob|bolivianos)?/gi,
    /(?:cantidad|stock|unidades?)\s+\d+/gi,
    /(?:categor[ií]a|tipo)\s+[a-záéíóúñ\s]+?(?=(?:\s+(?:precio|cantidad|c[oó]digo|stock))|$)/gi,
  ];
  for (const pattern of removePatterns) nameText = nameText.replace(pattern, "");
  const nombre = nameText.trim().replace(/^\w/, (c) => c.toUpperCase()) || null;

  return { nombre, codigo, categoria, precio, cantidad };
}

/**
 * Interprets voice text for product registration via the multi-provider AI Gateway
 * (with automatic heuristic fallback).
 */
export async function interpretarRegistroProducto(texto: string): Promise<RegistroProductoParsed> {
  const phrase = texto.trim();
  if (!phrase) return { nombre: null, codigo: null, categoria: null, precio: null, cantidad: null };

  try {
    const result = await completeChatJSON({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: `Texto dictado: "${phrase}"`,
      schema: RegistroProductoSchema,
    });

    if (result.provider !== "heuristic" && result.data) {
      const parsed = RegistroProductoSchema.safeParse(result.data);
      if (parsed.success) {
        return parsed.data;
      }
    }
  } catch (error) {
    console.warn("AI Gateway error for product registration, using heuristic fallback", error);
  }

  return interpretarHeuristicaRegistro(phrase);
}
