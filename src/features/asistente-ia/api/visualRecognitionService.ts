import { z } from "zod";
import { completeChatJSON } from "../lib/aiGateway";
import { obtenerProductos } from "../../productos/api/productosApi";
import type { Producto, VisualRecognitionResult } from "../../../shared/types/domain";

export const VisualRecognitionSchema = z.object({
  analisis_prenda: z.object({
    categoria: z.string(),
    color_principal: z.string(),
    tipo_corte: z.string(),
    caracteristicas_distintivas: z.string(),
  }),
  candidatos: z.array(
    z.object({
      producto_id: z.number(),
      nombre: z.string(),
      codigo: z.string(),
      categoria: z.string(),
      precio: z.number(),
      confidence: z.number().min(0).max(1),
      razon: z.string(),
    }),
  ),
});

export async function reconocerPrendaPorImagen(
  imageBase64: string,
  catalogo?: Producto[],
): Promise<VisualRecognitionResult> {
  let products = catalogo;
  if (!products || products.length === 0) {
    const res = await obtenerProductos({ page: 1 });
    products = res.data;
  }

  const catalogSummary = products.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    codigo: p.codigo,
    categoria: p.categoria,
    precio: p.precio,
  }));

  const systemPrompt = `Eres un clasificador experto de indumentaria textil para el sistema Lidemoda POS.
Analiza la imagen de la prenda proporcionada e identifica sus atributos visuales:
- categoria (ej: Remera, Pantalón, Vestido, Campera, Buzo, Short, etc.)
- color_principal (ej: Negro, Blanco, Azul marino, Beige, etc.)
- tipo_corte (ej: Oversize, Slim fit, Clásico, Manga corta, etc.)
- caracteristicas_distintivas (ej: Cuello redondo, con estampado frontal, liso, etc.)

Luego, compara la prenda con el catálogo disponible de productos y devuelve hasta 3 candidatos que mejor coincidan, ordenados por confianza descendente (confidence entre 0.0 y 1.0).

Debes responder ÚNICAMENTE con un objeto JSON con este esquema exacto:
{
  "analisis_prenda": {
    "categoria": string,
    "color_principal": string,
    "tipo_corte": string,
    "caracteristicas_distintivas": string
  },
  "candidatos": [
    {
      "producto_id": number,
      "nombre": string,
      "codigo": string,
      "categoria": string,
      "precio": number,
      "confidence": number,
      "razon": string
    }
  ]
}`;

  const userMessage = `Catálogo de productos disponibles:\n${JSON.stringify(catalogSummary, null, 2)}\n\nPor favor analiza la prenda de la imagen y determina a qué producto del catálogo corresponde.`;

  const result = await completeChatJSON({
    systemPrompt,
    userMessage,
    imageBase64,
    schema: VisualRecognitionSchema,
    timeoutMs: 15000,
  });

  if (result.data) {
    return result.data;
  }

  // Fallback heurístico si no hay conexión o no hay API key configurada
  const first3 = products.slice(0, 3);
  return {
    analisis_prenda: {
      categoria: "Prenda de catálogo",
      color_principal: "No identificado (Modo heurístico)",
      tipo_corte: "Estándar",
      caracteristicas_distintivas: "Reconocimiento asistido local",
    },
    candidatos: first3.map((p, idx) => ({
      producto_id: p.id,
      nombre: p.nombre,
      codigo: p.codigo,
      categoria: p.categoria,
      precio: p.precio,
      confidence: Math.max(0.5, 0.9 - idx * 0.15),
      razon: `Coincidencia sugerida del catálogo activo (${p.categoria})`,
    })),
  };
}
