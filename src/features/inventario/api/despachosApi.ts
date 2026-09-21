import { z } from "zod";
import { supabase } from "../../../shared/lib/supabase";
import type {
  ConfirmarRecepcionParams,
  EmitirDespachoParams,
  EstadoDespacho,
  OrdenDespacho,
} from "../../../shared/types/domain";

export const EmitirDespachoSchema = z.object({
  producto_id: z.number().int().positive(),
  sucursal_origen_id: z.number().int().positive(),
  sucursal_destino_id: z.number().int().positive(),
  cantidad: z.number().int().positive("La cantidad a despachar debe ser mayor o igual a 1."),
  observacion: z.string().trim().max(500).optional(),
}).refine((v) => v.sucursal_origen_id !== v.sucursal_destino_id, {
  message: "La sucursal de origen y destino deben ser diferentes.",
  path: ["sucursal_destino_id"],
});

export const ConfirmarRecepcionSchema = z.object({
  orden_id: z.number().int().positive(),
  cantidad_recibida: z.number().int().positive("La cantidad recibida debe ser mayor o igual a 1."),
  observacion: z.string().trim().max(500).optional(),
});

const despachosSelect = `
  id,
  numero_guia,
  sucursal_origen_id,
  sucursal_destino_id,
  producto_id,
  cantidad_despachada,
  cantidad_recibida,
  estado,
  fecha_despacho,
  fecha_recepcion,
  observacion,
  created_at,
  producto:productos(id, nombre, codigo, categoria),
  sucursal_origen:sucursales!sucursal_origen_id(id, nombre),
  sucursal_destino:sucursales!sucursal_destino_id(id, nombre)
`;

function normalizeDespachoRow(item: any): OrdenDespacho {
  return {
    id: item.id,
    numero_guia: item.numero_guia,
    sucursal_origen_id: item.sucursal_origen_id,
    sucursal_destino_id: item.sucursal_destino_id,
    producto_id: item.producto_id,
    cantidad_despachada: item.cantidad_despachada,
    cantidad_recibida: item.cantidad_recibida,
    estado: item.estado,
    fecha_despacho: item.fecha_despacho,
    fecha_recepcion: item.fecha_recepcion,
    observacion: item.observacion,
    created_at: item.created_at,
    producto: Array.isArray(item.producto) ? item.producto[0] : item.producto,
    sucursal_origen: Array.isArray(item.sucursal_origen) ? item.sucursal_origen[0] : item.sucursal_origen,
    sucursal_destino: Array.isArray(item.sucursal_destino) ? item.sucursal_destino[0] : item.sucursal_destino,
  };
}

export async function obtenerOrdenesDespacho(filtros: {
  sucursalDestinoId?: number;
  sucursalOrigenId?: number;
  estado?: EstadoDespacho;
} = {}): Promise<OrdenDespacho[]> {
  let query = supabase
    .from("ordenes_despacho")
    .select(despachosSelect)
    .order("id", { ascending: false });

  if (filtros.sucursalDestinoId !== undefined) {
    query = query.eq("sucursal_destino_id", filtros.sucursalDestinoId);
  }
  if (filtros.sucursalOrigenId !== undefined) {
    query = query.eq("sucursal_origen_id", filtros.sucursalOrigenId);
  }
  if (filtros.estado !== undefined) {
    query = query.eq("estado", filtros.estado);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizeDespachoRow);
}

export async function emitirOrdenDespacho(params: EmitirDespachoParams): Promise<any> {
  const input = EmitirDespachoSchema.parse(params);
  const { data, error } = await supabase.rpc("emitir_orden_despacho", {
    p_producto_id: input.producto_id,
    p_sucursal_origen_id: input.sucursal_origen_id,
    p_sucursal_destino_id: input.sucursal_destino_id,
    p_cantidad: input.cantidad,
    p_observacion: input.observacion ?? "",
  });

  if (error) throw new Error(error.message);
  return data;
}

export async function confirmarRecepcionDespacho(params: ConfirmarRecepcionParams): Promise<any> {
  const input = ConfirmarRecepcionSchema.parse(params);
  const { data, error } = await supabase.rpc("confirmar_recepcion_despacho", {
    p_orden_id: input.orden_id,
    p_cantidad_recibida: input.cantidad_recibida,
    p_observacion: input.observacion ?? "",
  });

  if (error) throw new Error(error.message);
  return data;
}
