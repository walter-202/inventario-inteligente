import { supabase } from "./supabase";
import {
  interpretarTextoVoz,
  ProductoInterpretado,
  RespuestaInterpretacion,
} from "../services/aiInterpretationService";

export interface Producto {
  id: number;
  nombre: string;
  codigo: string;
  categoria: string;
  precio: number;
  cantidad: number;
}

export interface ProductosRespuesta {
  data: Producto[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  next_page_url: string | null;
  prev_page_url: string | null;
}

export interface ProductosParams {
  q?: string;
  categoria?: string;
  page?: number;
}

export interface NuevoProductoParams {
  nombre: string;
  codigo: string;
  categoria: string;
  precio: number;
  cantidad: number;
  sucursal_id: number;
}

export interface ProductoRegistrado {
  producto: Producto;
  sucursal: Sucursal;
  cantidad_inicial: number;
  mensaje: string;
}

export interface Sucursal {
  id: number;
  nombre: string;
  direccion?: string;
  ciudad?: string;
}

export interface InventarioItem {
  id: number;
  producto_id: number;
  sucursal_id: number;
  cantidad: number;
  producto: {
    id: number;
    nombre: string;
    codigo: string;
    categoria?: string;
  };
  sucursal: {
    id: number;
    nombre: string;
  };
}

export interface LineaVenta {
  producto_id: number;
  cantidad: number;
  precio?: number;
}

export interface RegistrarVentaParams {
  sucursal_id: number;
  metodo_pago: string;
  productos: LineaVenta[];
}

export interface DetalleVenta {
  id?: number;
  producto_id: number;
  cantidad: number;
  precio: number;
  subtotal?: number;
}

export interface VentaRegistrada {
  id: number;
  sucursal_id: number;
  fecha: string;
  metodo_pago: string;
  total: number;
  detalles: DetalleVenta[];
}

export interface MovimientoBaseParams {
  producto_id: number;
  cantidad: number;
  observacion?: string;
}

export interface MovimientoSucursalParams extends MovimientoBaseParams {
  sucursal_id: number;
}

export interface MovimientoTransferenciaParams extends MovimientoBaseParams {
  sucursal_origen_id: number;
  sucursal_destino_id: number;
}

export interface MovimientoRegistrado {
  id: number;
  producto_id: number;
  sucursal_id: number;
  sucursal_destino_id?: number | null;
  tipo: string;
  cantidad: number;
  observacion?: string | null;
}

export { ProductoInterpretado, RespuestaInterpretacion };

// --- PRODUCTOS ---

export async function obtenerProductos(
  params: ProductosParams = {}
): Promise<ProductosRespuesta> {
  const page = params.page && params.page > 0 ? params.page : 1;
  const perPage = 15;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabase
    .from("productos")
    .select("*", { count: "exact" })
    .order("nombre", { ascending: true });

  if (params.q && params.q.trim().length > 0) {
    const q = params.q.trim();
    query = query.or(
      `nombre.ilike.%${q}%,codigo.ilike.%${q}%,categoria.ilike.%${q}%`
    );
  }

  if (params.categoria && params.categoria.trim().length > 0) {
    query = query.eq("categoria", params.categoria.trim());
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  const total = count ?? (data?.length || 0);
  const lastPage = Math.max(1, Math.ceil(total / perPage));

  return {
    data: (data || []) as Producto[],
    current_page: page,
    last_page: lastPage,
    per_page: perPage,
    total,
    next_page_url: page < lastPage ? `?page=${page + 1}` : null,
    prev_page_url: page > 1 ? `?page=${page - 1}` : null,
  };
}

export async function registrarProducto(
  params: NuevoProductoParams
): Promise<ProductoRegistrado> {
  const { data, error } = await supabase.rpc("registrar_producto_con_stock", {
    p_nombre: params.nombre,
    p_codigo: params.codigo,
    p_categoria: params.categoria,
    p_precio: params.precio,
    p_cantidad: params.cantidad,
    p_sucursal_id: params.sucursal_id,
  });

  if (error) {
    if (error.code === "23505" || error.message.includes("unique")) {
      throw new Error("El código ingresado ya existe. Ingresa un código diferente.");
    }
    throw new Error(error.message);
  }

  return data as unknown as ProductoRegistrado;
}

export async function buscarProductoPorCodigo(
  codigo: string
): Promise<Producto> {
  const { data, error } = await supabase
    .from("productos")
    .select("*")
    .eq("codigo", codigo.trim())
    .single();

  if (error || !data) {
    throw new Error("Producto no encontrado.");
  }

  return data as Producto;
}

// --- SUCURSALES ---

export async function obtenerSucursales(): Promise<Sucursal[]> {
  const { data, error } = await supabase
    .from("sucursales")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as Sucursal[];
}

// --- INVENTARIO ---

export async function obtenerInventario(
  sucursalId: number
): Promise<InventarioItem[]> {
  const { data, error } = await supabase
    .from("inventarios")
    .select(`
      id,
      producto_id,
      sucursal_id,
      cantidad,
      producto:productos(id, nombre, codigo, categoria),
      sucursal:sucursales(id, nombre)
    `)
    .eq("sucursal_id", sucursalId);

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((item: any) => ({
    id: item.id,
    producto_id: item.producto_id,
    sucursal_id: item.sucursal_id,
    cantidad: item.cantidad,
    producto: Array.isArray(item.producto) ? item.producto[0] : item.producto,
    sucursal: Array.isArray(item.sucursal) ? item.sucursal[0] : item.sucursal,
  })) as InventarioItem[];
}

// --- VENTAS ---

export async function registrarVenta(
  params: RegistrarVentaParams
): Promise<VentaRegistrada> {
  const { data, error } = await supabase.rpc("registrar_venta", {
    p_sucursal_id: params.sucursal_id,
    p_metodo_pago: params.metodo_pago,
    p_productos: params.productos as any,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as VentaRegistrada;
}

// --- MOVIMIENTOS ---

export async function registrarEntrada(
  params: MovimientoSucursalParams
): Promise<MovimientoRegistrado> {
  const { data, error } = await supabase.rpc("registrar_movimiento_entrada", {
    p_producto_id: params.producto_id,
    p_sucursal_id: params.sucursal_id,
    p_cantidad: params.cantidad,
    p_observacion: params.observacion ?? "",
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as MovimientoRegistrado;
}

export async function registrarSalida(
  params: MovimientoSucursalParams
): Promise<MovimientoRegistrado> {
  const { data, error } = await supabase.rpc("registrar_movimiento_salida", {
    p_producto_id: params.producto_id,
    p_sucursal_id: params.sucursal_id,
    p_cantidad: params.cantidad,
    p_observacion: params.observacion ?? "",
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as MovimientoRegistrado;
}

export async function registrarTransferencia(
  params: MovimientoTransferenciaParams
): Promise<MovimientoRegistrado> {
  const { data, error } = await supabase.rpc("registrar_movimiento_transferencia", {
    p_producto_id: params.producto_id,
    p_sucursal_origen_id: params.sucursal_origen_id,
    p_sucursal_destino_id: params.sucursal_destino_id,
    p_cantidad: params.cantidad,
    p_observacion: params.observacion ?? "",
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as MovimientoRegistrado;
}

// --- VOZ / IA ---

export async function interpretarTexto(
  texto: string
): Promise<RespuestaInterpretacion> {
  return interpretarTextoVoz(texto);
}

// --- ERROR HELPER ---

export function extraerMensajeError(
  error: unknown,
  mensajePorDefecto: string
): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as any).message);
  }
  return mensajePorDefecto;
}