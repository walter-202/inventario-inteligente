import { z } from "zod";
import type { ModelMessage } from "ai";
import { generateStructuredOutput, listAssistantModels, ASSISTANT_CONFIG_MESSAGE } from "../lib/aiSdkProviders";
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

const INSTRUCTIONS = [
  "Sos un clasificador experto de indumentaria textil para el sistema Lidemoda POS.",
  "Analizá la imagen de la prenda e identificá categoria, color_principal, tipo_corte y caracteristicas_distintivas.",
  "Compará con el catálogo y devolvé hasta 3 candidatos ordenados por confianza (0.0 a 1.0).",
  "producto_id, nombre, codigo, categoria y precio deben coincidir con el catálogo. No inventes productos.",
  "Si no hay coincidencia razonable, devolvé candidatos vacío y describí igual la prenda.",
].join("\n");

function imageFilePart(imageBase64: string): { type: "file"; mediaType: "image/jpeg"; data: string } {
  const comma = imageBase64.indexOf(",");
  const data =
    imageBase64.startsWith("data:") && comma >= 0 ? imageBase64.slice(comma + 1) : imageBase64;
  return { type: "file", mediaType: "image/jpeg", data };
}

function filterCatalogMatches(
  result: VisualRecognitionResult,
  products: Producto[],
): VisualRecognitionResult {
  const byId = new Map(products.map((product) => [product.id, product]));
  return {
    analisis_prenda: result.analisis_prenda,
    candidatos: result.candidatos.filter((candidate) => byId.has(candidate.producto_id)).slice(0, 3),
  };
}

export async function reconocerPrendaPorImagen(
  imageBase64: string,
  catalogo?: Producto[],
): Promise<VisualRecognitionResult> {
  const models = await listAssistantModels();
  if (models.length === 0) {
    throw new Error(ASSISTANT_CONFIG_MESSAGE);
  }

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

  const messages: ModelMessage[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Catálogo de productos disponibles:\n${JSON.stringify(catalogSummary)}\n\nAnalizá la prenda de la imagen y determiná a qué producto del catálogo corresponde.`,
        },
        imageFilePart(imageBase64),
      ],
    },
  ];

  const parsed = await generateStructuredOutput({
    schema: VisualRecognitionSchema,
    instructions: INSTRUCTIONS,
    messages,
    timeoutMs: 20_000,
  });

  return filterCatalogMatches(parsed, products);
}
