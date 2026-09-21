import { z } from "zod";
import { obtenerSucursales } from "../../../shared/api/sucursalesApi";
import { supabase } from "../../../shared/lib/supabase";
import { fetchAllPages } from "../../../shared/lib/pagination";
import type {
  InventarioItem,
  MovimientoRegistrado,
  MovimientoSucursalParams,
  MovimientoTransferenciaParams,
} from "../../../shared/types/domain";

const movementBaseSchema = z.object({
  producto_id: z.number().int().positive(),
  cantidad: z.number().int().positive("La cantidad debe ser mayor o igual a 1."),
  observacion: z.string().trim().max(500).optional(),
});
export const MovimientoSucursalSchema = movementBaseSchema.extend({ sucursal_id: z.number().int().positive() });
export const MovimientoTransferenciaSchema = movementBaseSchema.extend({
  sucursal_origen_id: z.number().int().positive(),
  sucursal_destino_id: z.number().int().positive(),
}).refine((value) => value.sucursal_origen_id !== value.sucursal_destino_id, {
  message: "Las sucursales de origen y destino deben ser diferentes.",
  path: ["sucursal_destino_id"],
});

const inventorySelect = `
  id,
  producto_id,
  sucursal_id,
  cantidad,
  producto:productos(id, nombre, codigo, categoria),
  sucursal:sucursales(id, nombre)
`;

function normalizeInventoryRow(item: unknown): InventarioItem {
  const row = item as {
    id: number; producto_id: number; sucursal_id: number; cantidad: number;
    producto: InventarioItem["producto"] | InventarioItem["producto"][];
    sucursal: InventarioItem["sucursal"] | InventarioItem["sucursal"][];
  };
  return {
    id: row.id,
    producto_id: row.producto_id,
    sucursal_id: row.sucursal_id,
    cantidad: row.cantidad,
    producto: Array.isArray(row.producto) ? row.producto[0] : row.producto,
    sucursal: Array.isArray(row.sucursal) ? row.sucursal[0] : row.sucursal,
  };
}

export async function obtenerInventario(sucursalId: number): Promise<InventarioItem[]> {
  const branchId = z.number().int().positive().parse(sucursalId);
  const rows = await fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from("inventarios")
      .select(inventorySelect)
      .eq("sucursal_id", branchId)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
  return rows.map(normalizeInventoryRow);
}

export async function obtenerStockDeProducto(productoId: number): Promise<Array<{
  sucursalId: number;
  sucursalNombre: string;
  cantidad: number;
}>> {
  const pId = z.number().int().positive().parse(productoId);
  const { data, error } = await supabase
    .from("inventarios")
    .select(`
      sucursal_id,
      cantidad,
      sucursal:sucursales(id, nombre)
    `)
    .eq("producto_id", pId)
    .order("sucursal_id", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    sucursalId: row.sucursal_id,
    sucursalNombre: Array.isArray(row.sucursal)
      ? row.sucursal[0]?.nombre ?? `Sucursal ${row.sucursal_id}`
      : row.sucursal?.nombre ?? `Sucursal ${row.sucursal_id}`,
    cantidad: row.cantidad,
  }));
}

export async function obtenerStockMultiSucursal(): Promise<InventarioItem[]> {
  const branches = await obtenerSucursales();
  const inventories = await Promise.all(branches.map((branch) => obtenerInventario(branch.id)));
  return inventories.flat();
}

export async function registrarEntrada(params: MovimientoSucursalParams): Promise<MovimientoRegistrado> {
  const input = MovimientoSucursalSchema.parse(params);
  const { data, error } = await supabase.rpc("registrar_movimiento_entrada", {
    p_producto_id: input.producto_id,
    p_sucursal_id: input.sucursal_id,
    p_cantidad: input.cantidad,
    p_observacion: input.observacion ?? "",
  });
  if (error) throw new Error(error.message);
  return data as unknown as MovimientoRegistrado;
}

export async function registrarSalida(params: MovimientoSucursalParams): Promise<MovimientoRegistrado> {
  const input = MovimientoSucursalSchema.parse(params);
  const { data, error } = await supabase.rpc("registrar_movimiento_salida", {
    p_producto_id: input.producto_id,
    p_sucursal_id: input.sucursal_id,
    p_cantidad: input.cantidad,
    p_observacion: input.observacion ?? "",
  });
  if (error) throw new Error(error.message);
  return data as unknown as MovimientoRegistrado;
}

export async function registrarTransferencia(params: MovimientoTransferenciaParams): Promise<MovimientoRegistrado> {
  const input = MovimientoTransferenciaSchema.parse(params);
  const { data, error } = await supabase.rpc("registrar_movimiento_transferencia", {
    p_producto_id: input.producto_id,
    p_sucursal_origen_id: input.sucursal_origen_id,
    p_sucursal_destino_id: input.sucursal_destino_id,
    p_cantidad: input.cantidad,
    p_observacion: input.observacion ?? "",
  });
  if (error) throw new Error(error.message);
  return data as unknown as MovimientoRegistrado;
}

export type MovimientoParams =
  | { tipo: "entrada"; params: MovimientoSucursalParams }
  | { tipo: "salida"; params: MovimientoSucursalParams }
  | { tipo: "transferencia"; params: MovimientoTransferenciaParams };

export async function registrarMovimiento(input: MovimientoParams): Promise<MovimientoRegistrado> {
  if (input.tipo === "entrada") return registrarEntrada(input.params);
  if (input.tipo === "salida") return registrarSalida(input.params);
  return registrarTransferencia(input.params);
}
