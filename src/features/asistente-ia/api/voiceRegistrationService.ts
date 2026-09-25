import { z } from "zod";
import {
  ASSISTANT_CONFIG_MESSAGE,
  generateStructuredOutput,
  listAssistantModels,
} from "../lib/aiSdkProviders";

const optionalText = z.preprocess((value) => {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}, z.string().min(1).nullable());

const optionalNumber = z.preprocess((value) => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}, z.number().finite().nonnegative().nullable());

const optionalInt = z.preprocess((value) => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}, z.number().int().nonnegative().nullable());

/**
 * Schema for AI-parsed product registration fields.
 * The model extracts whatever it can from natural speech; missing fields stay null.
 */
export const RegistroProductoSchema = z.object({
  nombre: optionalText,
  codigo: optionalText,
  codigo_barra: optionalText,
  categoria: optionalText,
  precio: optionalNumber,
  cantidad: optionalInt,
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
  "Respondé únicamente con JSON válido.",
].join("\n");

/**
 * Interprets voice text for product registration via the same BYOK AI SDK stack as the assistant.
 */
export async function interpretarRegistroProducto(texto: string): Promise<RegistroProductoParsed> {
  const phrase = texto.trim();
  if (!phrase) return EMPTY_REGISTRO;

  const models = await listAssistantModels();
  if (models.length === 0) {
    throw new Error(ASSISTANT_CONFIG_MESSAGE);
  }

  return generateStructuredOutput({
    schema: RegistroProductoSchema,
    instructions: INSTRUCTIONS,
    messages: [{ role: "user", content: `Texto dictado: "${phrase}"` }],
    timeoutMs: 20_000,
  });
}
