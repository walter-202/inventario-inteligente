import { z } from "zod";
import { supabase } from "../../../shared/lib/supabase";
import { fetchAllPages } from "../../../shared/lib/pagination";
import { ProductoLookupError, ProductoNoEncontradoError } from "../lib/productLookupErrors";
import type { Database } from "../../../shared/types/database.types";
import type {
  NuevoProductoParams,
  Producto,
  ProductoRegistrado,
  ProductosParams,
  ProductosRespuesta,
} from "../../../shared/types/domain";

const productInputSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio.").max(255),
  codigo: z.string().trim().min(1, "El código es obligatorio.").max(255),
  codigo_barra: z.string().trim().max(255).optional().nullable(),
  categoria: z.string().trim().min(1, "La categoría es obligatoria.").max(255),
  subcategoria: z.string().trim().max(255).optional().nullable(),
  precio: z.number().finite().nonnegative("El precio debe ser mayor o igual a 0."),
  cantidad: z.number().int().nonnegative("La cantidad debe ser un entero mayor o igual a 0."),
  sucursal_id: z.number().int().positive(),
});

export const ProductoInputSchema = productInputSchema;

type RegistrarProductoRpcPayload = {
  p_nombre: string;
  p_codigo: string;
  p_categoria: string;
  p_precio: number;
  p_cantidad: number;
  p_sucursal_id: number;
  p_codigo_barra: string | null;
  p_subcategoria: string | null;
};

type RegistrarProductoRpcPayloadV7 = Omit<RegistrarProductoRpcPayload, "p_subcategoria">;

function buildRegistrarProductoPayloadV7(input: z.infer<typeof productInputSchema>): RegistrarProductoRpcPayloadV7 {
  return {
    p_nombre: input.nombre,
    p_codigo: input.codigo,
    p_categoria: input.categoria,
    p_precio: input.precio,
    p_cantidad: input.cantidad,
    p_sucursal_id: input.sucursal_id,
    p_codigo_barra: input.codigo_barra?.trim() || null,
  };
}

function buildRegistrarProductoPayloadV8(input: z.infer<typeof productInputSchema>): RegistrarProductoRpcPayload {
  return {
    ...buildRegistrarProductoPayloadV7(input),
    p_subcategoria: input.subcategoria?.trim() || null,
  };
}

function shouldRetryRegistrarProductoRpc(error: { message?: string } | null): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("could not find the function")
    || message.includes("could not choose the best candidate function");
}

function mapRegistrarProductoError(error: { code?: string; message?: string }): Error {
  const message = error.message ?? "No se pudo registrar el producto.";
  if (error.code === "23505" || message.includes("unique")) {
    return new Error("El código ingresado ya existe. Ingresa un código diferente.");
  }
  if (message.includes("ROLE_NOT_ALLOWED")) {
    return new Error("Tu rol no puede registrar productos. Solo el rol Almacén puede dar de alta en catálogo.");
  }
  if (message.includes("BRANCH_NOT_ALLOWED")) {
    return new Error("No podés registrar stock inicial en esa sucursal con tu usuario actual.");
  }
  if (message.includes("Could not choose the best candidate function")) {
    return new Error(
      "La base de datos tiene funciones duplicadas para registrar productos. Ejecutá la migración más reciente con supabase db push.",
    );
  }
  return new Error(message);
}

export async function obtenerProductos(params: ProductosParams = {}): Promise<ProductosRespuesta> {
  const page = params.page && params.page > 0 ? params.page : 1;
  const perPage = 15;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  let query = supabase
    .from("productos")
    .select("*", { count: "exact" })
    .order("nombre", { ascending: true })
    .order("id", { ascending: true });
  if (params.q?.trim()) {
    const q = params.q.trim();
    query = query.or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%,codigo_barra.ilike.%${q}%,categoria.ilike.%${q}%`);
  }
  if (params.categoria?.trim()) query = query.eq("categoria", params.categoria.trim());
  const { data, error, count } = await query.range(from, to);
  if (error) throw new Error(error.message);
  const total = count ?? data?.length ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  return {
    data: (data ?? []) as Producto[],
    current_page: page,
    last_page: lastPage,
    per_page: perPage,
    total,
    next_page_url: page < lastPage ? `?page=${page + 1}` : null,
    prev_page_url: page > 1 ? `?page=${page - 1}` : null,
  };
}

export async function registrarProducto(params: NuevoProductoParams): Promise<ProductoRegistrado> {
  const input = productInputSchema.parse(params);
  let response = await supabase.rpc("registrar_producto_con_stock", buildRegistrarProductoPayloadV8(input));
  if (response.error && shouldRetryRegistrarProductoRpc(response.error)) {
    response = await supabase.rpc("registrar_producto_con_stock", buildRegistrarProductoPayloadV7(input));
  }
  const { data, error } = response;
  if (error) throw mapRegistrarProductoError(error);
  return data as unknown as ProductoRegistrado;
}

export async function buscarProductoPorCodigo(codigo: string): Promise<Producto> {
  const normalized = z.string().trim().min(1).parse(codigo);
  const { data, error } = await supabase
    .from("productos")
    .select("*")
    .or(`codigo.eq.${normalized},codigo_barra.eq.${normalized}`)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new ProductoLookupError(error.message);
  }
  if (!data) throw new ProductoNoEncontradoError();
  return data as Producto;
}

export async function buscarProductoPorId(id: number): Promise<Producto> {
  const productId = z.number().int().positive().parse(id);
  const { data, error } = await supabase.from("productos").select("*").eq("id", productId).single();
  if (error) {
    if (error.code === "PGRST116") throw new ProductoNoEncontradoError();
    throw new ProductoLookupError(error.message);
  }
  if (!data) throw new ProductoNoEncontradoError();
  return data as Producto;
}

export async function buscarProductosAsistente(query: string, limite = 10): Promise<Producto[]> {
  const q = query.trim();
  if (!q) return [];

  // Búsqueda rápida por código exacto o prefijo (soporta SKU y código de barras)
  const { data: codeMatches, error: codeErr } = await supabase
    .from("productos")
    .select("*")
    .or(`codigo.ilike.${q}%,codigo.ilike.%${q}%,codigo_barra.ilike.${q}%,codigo_barra.ilike.%${q}%`)
    .limit(limite);

  if (codeErr) throw new Error(codeErr.message);
  if (codeMatches && codeMatches.length > 0) {
    return codeMatches as Producto[];
  }

  // Búsqueda por nombre o categoría
  const { data: textMatches, error: textErr } = await supabase
    .from("productos")
    .select("*")
    .or(`nombre.ilike.%${q}%,categoria.ilike.%${q}%`)
    .limit(limite);

  if (textErr) throw new Error(textErr.message);
  return (textMatches ?? []) as Producto[];
}

export async function obtenerCategoriasProductos(): Promise<string[]> {
  const rows = await fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from("productos")
      .select("categoria")
      .order("categoria", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
  return Array.from(new Set(rows.map((row) => row.categoria))).sort((a, b) => a.localeCompare(b, "es"));
}

export const ActualizarProductoSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio.").max(255),
  codigo: z.string().trim().min(1, "El código es obligatorio.").max(255),
  codigo_barra: z.string().trim().max(255).optional().nullable(),
  categoria: z.string().trim().min(1, "La categoría es obligatoria.").max(255),
  subcategoria: z.string().trim().max(255).optional().nullable(),
  precio: z.number().finite().nonnegative("El precio debe ser mayor o igual a 0."),
  stock_minimo: z.number().int().nonnegative("El stock mínimo debe ser mayor o igual a 0.").optional(),
});

export type ActualizarProductoParams = z.infer<typeof ActualizarProductoSchema>;

export async function actualizarProducto(id: number, params: ActualizarProductoParams): Promise<Producto> {
  const productId = z.number().int().positive().parse(id);
  const input = ActualizarProductoSchema.parse(params);
  const updatePayload: Database["public"]["Tables"]["productos"]["Update"] = {
    nombre: input.nombre,
    codigo: input.codigo,
    categoria: input.categoria,
    precio: input.precio,
    updated_at: new Date().toISOString(),
  };
  if (input.codigo_barra !== undefined) {
    updatePayload.codigo_barra = input.codigo_barra;
  }
  if (input.subcategoria !== undefined) {
    updatePayload.subcategoria = input.subcategoria;
  }
  if (input.stock_minimo !== undefined) {
    updatePayload.stock_minimo = input.stock_minimo;
  }

  const { data, error } = await supabase
    .from("productos")
    .update(updatePayload)
    .eq("id", productId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505" || error.message.includes("unique")) {
      throw new Error("El código SKU ya existe en otro producto.");
    }
    throw new Error(error.message);
  }
  return data as Producto;
}

export interface StockSucursalProducto {
  sucursalId: number;
  sucursalNombre: string;
  cantidad: number;
}

export async function obtenerStockProducto(productoId: number): Promise<StockSucursalProducto[]> {
  const id = z.number().int().positive().parse(productoId);
  const { data, error } = await supabase
    .from("inventarios")
    .select("sucursal_id, cantidad, sucursal:sucursales(id, nombre)")
    .eq("producto_id", id)
    .order("sucursal_id", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => {
    const sucursal = Array.isArray(row.sucursal) ? row.sucursal[0] : row.sucursal;
    return {
      sucursalId: row.sucursal_id,
      sucursalNombre: sucursal?.nombre ?? `Sucursal ${row.sucursal_id}`,
      cantidad: row.cantidad ?? 0,
    };
  });
}

export interface MovimientoHistorial {
  id: number;
  tipo: "entrada" | "salida" | "transferencia" | string;
  cantidad: number;
  observacion: string;
  fecha: string;
  sucursalOrigenNombre: string;
  sucursalDestinoNombre: string | null;
}

export async function obtenerHistorialProducto(productoId: number): Promise<MovimientoHistorial[]> {
  const id = z.number().int().positive().parse(productoId);
  const { data, error } = await supabase
    .from("movimientos")
    .select(`
      id,
      tipo,
      cantidad,
      observacion,
      created_at,
      sucursal:sucursales!movimientos_sucursal_id_fkey(nombre),
      sucursal_destino:sucursales!movimientos_sucursal_destino_id_fkey(nombre)
    `)
    .eq("producto_id", id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => {
    const sucursal = Array.isArray(row.sucursal) ? row.sucursal[0] : row.sucursal;
    const sucursalDestino = Array.isArray(row.sucursal_destino) ? row.sucursal_destino[0] : row.sucursal_destino;
    return {
      id: row.id,
      tipo: row.tipo,
      cantidad: row.cantidad,
      observacion: row.observacion || "",
      fecha: row.created_at,
      sucursalOrigenNombre: sucursal?.nombre ?? "Desconocida",
      sucursalDestinoNombre: sucursalDestino?.nombre ?? null,
    };
  });
}
