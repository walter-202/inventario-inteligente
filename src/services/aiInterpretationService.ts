export interface ProductoInterpretado {
  producto: string;
  cantidad: number;
}

export interface RespuestaInterpretacion {
  accion: "venta" | "desconocida";
  productos: ProductoInterpretado[];
}

/**
 * Heurística en español para interpretar frases de venta de ropa (Lidemoda).
 * Funciona offline o como fallback cuando no hay clave de API externa configurada.
 */
function interpretarHeuristica(texto: string): RespuestaInterpretacion {
  const normalizado = texto.toLowerCase().trim();

  // Palabras clave de intención de venta
  const palabrasVenta = ["vender", "venta", "lleva", "cobrar", "anotar", "pedido", "registrar"];
  const tieneIntencion = palabrasVenta.some((p) => normalizado.includes(p));

  // Mapa de números en palabras a dígitos
  const numerosTexto: Record<string, number> = {
    un: 1,
    una: 1,
    uno: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
  };

  // Patrón para capturar: [cantidad o palabra de cantidad] [nombre del producto]
  // Ejemplo: "vender 2 jeans mom fit", "tres chompas de alpaca", "1 vestido"
  const regexItem =
    /(?:(?:vender|venta|lleva|anotar|cobrar|registrar)\s+)?(?:(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+)?([a-záéíóúñ\s-]+?)(?=(?:,|\sy\s|\scon\s|$))/gi;

  const productos: ProductoInterpretado[] = [];
  let match: RegExpExecArray | null;

  while ((match = regexItem.exec(normalizado)) !== null) {
    const rawCantidad = match[1];
    let nombreProd = match[2]?.trim() || "";

    // Limpiar palabras vacías
    nombreProd = nombreProd
      .replace(/^(de|los|las|el|la|unos|unas)\s+/i, "")
      .replace(/\s+(por favor|gracias|rápido)$/i, "")
      .trim();

    if (nombreProd.length > 2 && !palabrasVenta.includes(nombreProd)) {
      let cantidad = 1;
      if (rawCantidad) {
        if (!isNaN(Number(rawCantidad))) {
          cantidad = parseInt(rawCantidad, 10);
        } else if (numerosTexto[rawCantidad.toLowerCase()]) {
          cantidad = numerosTexto[rawCantidad.toLowerCase()];
        }
      }
      productos.push({
        producto: nombreProd,
        cantidad: Math.max(1, cantidad),
      });
    }
  }

  if (productos.length > 0) {
    return {
      accion: "venta",
      productos,
    };
  }

  return {
    accion: tieneIntencion ? "venta" : "desconocida",
    productos: [],
  };
}

/**
 * Interpreta texto natural por voz o teclado.
 * Si EXPO_PUBLIC_GEMINI_API_KEY existe, consulta Gemini 2.0 Flash;
 * si no, o si falla la red, ejecuta el motor heurístico offline sin romper la app.
 */
export async function interpretarTextoVoz(texto: string): Promise<RespuestaInterpretacion> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

  if (apiKey) {
    try {
      const prompt = `Eres un asistente de punto de venta en español para Lidemoda (tienda de moda/ropa en La Paz y El Alto). Interpreta la frase del usuario y responde SOLO JSON válido, sin markdown ni texto adicional.
Reglas:
- Si la frase describe una venta, responde: {"accion":"venta","productos":[{"producto":"<nombre o codigo del producto>","cantidad":<entero positivo>}]}
- Usa el nombre o código real del producto tal como aparece en la frase.
- Si la cantidad no es clara, usa 1.
- Si no se puede determinar que sea una venta o los productos no están claros, responde: {"accion":"desconocida","productos":[]}

Frase del usuario: "${texto}"`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (response.ok) {
        const json = await response.json();
        const contentText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (contentText) {
          const parsed = JSON.parse(contentText);
          if (parsed && parsed.accion === "venta" && Array.isArray(parsed.productos)) {
            return {
              accion: "venta",
              productos: parsed.productos.map((p: any) => ({
                producto: String(p.producto || ""),
                cantidad: Number(p.cantidad) || 1,
              })),
            };
          }
        }
      }
    } catch (e) {
      console.warn("Gemini API fallback to local interpreter:", e);
    }
  }

  return interpretarHeuristica(texto);
}
