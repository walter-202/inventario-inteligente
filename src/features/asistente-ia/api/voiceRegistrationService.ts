import { z } from "zod";
import { generateStructuredOutput } from "../lib/aiSdkProviders";

/**
 * Schema for AI-parsed product registration fields.
 * The model extracts whatever it can from natural speech; missing fields stay null.
 */
export const RegistroProductoSchema = z.object({
  nombre: z.string().trim().min(1).nullable(),
  codigo: z.string().trim().min(1).nullable(),
  codigo_barra: z.string().trim().min(1).nullable(),
  categoria: z.string().trim().min(1).nullable(),
  precio: z.number().finite().nonnegative().nullable(),
  cantidad: z.number().int().nonnegative().nullable(),
});

export type RegistroProductoParsed = z.infer<typeof RegistroProductoSchema>;

const EMPTY_REGISTRO: RegistroProductoParsed = {
  nombre: null,
  codigo: null,
  codigo_barra: null,
  categoria: null,
  precio: null,
  cantidad: null,
};

const INSTRUCTIONS = [
  "Sos un asistente de registro de catálogo para Lidemoda, una empresa de moda y ropa.",
  "El usuario dicta por voz los datos de un producto nuevo.",
  "Extraé todos los campos que puedas del texto dictado.",
  "Si un campo no se menciona, usá null. No inventes SKU, precio ni cantidad.",
  "nombre: nombre de la prenda (ej: Blusa de seda roja).",
  "codigo: SKU interno si lo menciona (ej: BLU-001).",
  "codigo_barra: EAN/UPC numérico si lo menciona.",
  "categoria: categoría (ej: belleza, accesorios, hogar, regalos, novedades).",
  "precio: número en BOB/Bs si lo menciona.",
  "cantidad: stock inicial entero si lo menciona.",
].join("\n");

/**
 * Interprets voice text for product registration via generateText + Output.object.
 * Does not write to the catalog; the form / propose_product_registration card still confirms.
 */
export async function interpretarRegistroProducto(texto: string): Promise<RegistroProductoParsed> {
  const phrase = texto.trim();
  if (!phrase) return EMPTY_REGISTRO;

  return generateStructuredOutput({
    schema: RegistroProductoSchema,
    instructions: INSTRUCTIONS,
    messages: [{ role: "user", content: `Texto dictado: "${phrase}"` }],
    timeoutMs: 20_000,
  });
}
