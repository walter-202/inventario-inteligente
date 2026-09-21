import { z } from "zod";
import { supabase } from "../../../shared/lib/supabase";
import {
  MOTIVOS_MERMA,
  type Merma,
  type MermaRegistrada,
  type RegistrarMermaParams,
} from "../../../shared/types/domain";

export const RegistrarMermaSchema = z.object({
  sucursal_id: z.number().int().positive("Seleccioná una sucursal válida"),
  producto_id: z.number().int().positive("Seleccioná un producto válido"),
  cantidad: z.number().int().positive("La cantidad debe ser mayor a 0"),
  motivo: z.enum(MOTIVOS_MERMA),
  observacion: z.string().max(250, "Máximo 250 caracteres").optional(),
});

export async function registrarMerma(params: RegistrarMermaParams): Promise<MermaRegistrada> {
  const input = RegistrarMermaSchema.parse(params);
  const { data, error } = await supabase.rpc("registrar_merma", {
    p_sucursal_id: input.sucursal_id,
    p_producto_id: input.producto_id,
    p_cantidad: input.cantidad,
    p_motivo: input.motivo,
    p_observacion: input.observacion?.trim() || undefined,
  });

  if (error) throw new Error(error.message);
  return data as unknown as MermaRegistrada;
}

export async function obtenerMermas(sucursalId?: number): Promise<Merma[]> {
  let query = supabase
    .from("mermas")
    .select("id, sucursal_id, producto_id, cantidad, motivo, observacion, created_at, productos(id, nombre, codigo, categoria), sucursales(id, nombre)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (sucursalId !== undefined) {
    query = query.eq("sucursal_id", z.number().int().positive().parse(sucursalId));
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    sucursal_id: row.sucursal_id,
    producto_id: row.producto_id,
    cantidad: row.cantidad,
    motivo: row.motivo,
    observacion: row.observacion,
    created_at: row.created_at,
    producto: row.productos ? {
      id: row.productos.id,
      nombre: row.productos.nombre,
      codigo: row.productos.codigo,
      categoria: row.productos.categoria,
    } : undefined,
    sucursal: row.sucursales ? {
      id: row.sucursales.id,
      nombre: row.sucursales.nombre,
    } : undefined,
  })) as Merma[];
}
