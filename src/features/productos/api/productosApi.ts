import { z } from "zod";
import { supabase } from "../../../shared/lib/supabase";
import { fetchAllPages } from "../../../shared/lib/pagination";
import { ProductoLookupError, ProductoNoEncontradoError } from "../lib/productLookupErrors";
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
  categoria: z.string().trim().min(1, "La categoría es obligatoria.").max(255),
  precio: z.number().finite().nonnegative("El precio debe ser mayor o igual a 0."),
  cantidad: z.number().int().nonnegative("La cantidad debe ser un entero mayor o igual a 0."),
  sucursal_id: z.number().int().positive(),
});

export const ProductoInputSchema = productInputSchema;

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
    query = query.or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%,categoria.ilike.%${q}%`);
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
  const { data, error } = await supabase.rpc("registrar_producto_con_stock", {
    p_nombre: input.nombre,
    p_codigo: input.codigo,
    p_categoria: input.categoria,
    p_precio: input.precio,
    p_cantidad: input.cantidad,
    p_sucursal_id: input.sucursal_id,
  });
  if (error) {
    if (error.code === "23505" || error.message.includes("unique")) {
      throw new Error("El código ingresado ya existe. Ingresa un código diferente.");
    }
    throw new Error(error.message);
  }
  return data as unknown as ProductoRegistrado;
}

export async function buscarProductoPorCodigo(codigo: string): Promise<Producto> {
  const normalized = z.string().trim().min(1).parse(codigo);
  const { data, error } = await supabase.from("productos").select("*").eq("codigo", normalized).single();
  if (error) {
    if (error.code === "PGRST116") throw new ProductoNoEncontradoError();
    throw new ProductoLookupError(error.message);
  }
  if (!data) throw new ProductoNoEncontradoError();
  return data as Producto;
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
