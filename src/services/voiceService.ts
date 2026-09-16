import axios from "axios";
import {
  obtenerProductos,
  interpretarTexto,
  type Producto,
  type ProductoInterpretado,
} from "@/lib/api";

const MENSAJE_CONEXION =
  "No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.";

export class InterpretacionError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "InterpretacionError";
  }
}

export interface LineaInterpretada {
  producto: Producto;
  cantidadSolicitada: number;
}

export type ResultadoInterpretacion =
  | { tipo: "aclaracion"; mensaje: string }
  | { tipo: "venta"; lineas: LineaInterpretada[] };

function resolverProductoCoincidencia(
  productos: Producto[],
  texto: string
): Producto | undefined {
  const q = texto.trim().toLowerCase();
  const porCodigo = productos.find(
    (p) => p.codigo.toLowerCase() === q
  );
  if (porCodigo) return porCodigo;
  return productos.find((p) => p.nombre.toLowerCase() === q);
}

async function resolverProducto(texto: string): Promise<Producto | null> {
  const q = texto.trim();
  if (!q) return null;

  const resultado = await obtenerProductos({ q, page: 1 });
  const data = resultado.data ?? [];

  if (data.length === 0) return null;

  const coincidencia = resolverProductoCoincidencia(data, q);
  if (coincidencia) return coincidencia;

  return data[0];
}

function validarInterpretacion(
  respuesta: {
    accion?: string;
    productos?: ProductoInterpretado[];
  }
): ProductoInterpretado[] | undefined {
  if (respuesta.accion !== "venta") return undefined;
  if (!Array.isArray(respuesta.productos) || respuesta.productos.length === 0) {
    return undefined;
  }

  const validos: ProductoInterpretado[] = [];
  for (const item of respuesta.productos) {
    const nombre = String(item?.producto ?? "").trim();
    const cantidad = Number(item?.cantidad);
    if (!nombre || !Number.isInteger(cantidad) || cantidad < 1) {
      return undefined;
    }
    validos.push({ producto: nombre, cantidad });
  }
  return validos;
}

async function buscarProductosInterpretados(
  productos: ProductoInterpretado[]
): Promise<LineaInterpretada[]> {
  const lineas: LineaInterpretada[] = [];

  for (const item of productos) {
    const producto = await resolverProducto(item.producto);
    if (!producto) {
      throw new InterpretacionError(
        `No se encontró el producto "${item.producto}". Corregí el texto y volvé a intentar.`
      );
    }
    lineas.push({ producto, cantidadSolicitada: item.cantidad });
  }

  return lineas;
}

export async function interpretarVoz(
  texto: string
): Promise<ResultadoInterpretacion> {
  const frase = texto.trim();
  if (!frase) {
    return {
      tipo: "aclaracion",
      mensaje: "Primero reconocé o escribí la operación que querés registrar.",
    };
  }
  if (frase.length > 500) {
    return {
      tipo: "aclaracion",
      mensaje:
        "El texto reconocido es muy largo. Corregilo o reducilo y volvé a intentar.",
    };
  }

  let respuesta;
  try {
    respuesta = await interpretarTexto(frase);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const msg = (
        error.response?.data as { message?: string } | undefined
      )?.message;
      if (status === 503) {
        throw new InterpretacionError(
          msg ?? "El servicio de interpretación de voz no está configurado."
        );
      }
      if (msg?.trim()) {
        throw new InterpretacionError(msg);
      }
    }
    throw new InterpretacionError(MENSAJE_CONEXION);
  }

  const productos = validarInterpretacion(respuesta ?? {});
  if (!productos) {
    return {
      tipo: "aclaracion",
      mensaje:
        "No se pudo identificar claramente la operación o los productos. Corregí el texto y volvé a intentar.",
    };
  }

  try {
    const lineas = await buscarProductosInterpretados(productos);
    if (lineas.length === 0) {
      return {
        tipo: "aclaracion",
        mensaje:
          "No se pudo identificar ningún producto. Corregí el texto y volvé a intentar.",
      };
    }
    return { tipo: "venta", lineas };
  } catch (error) {
    if (error instanceof InterpretacionError) throw error;
    throw new InterpretacionError(MENSAJE_CONEXION);
  }
}