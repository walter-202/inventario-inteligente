import { z } from "zod";
import { supabase } from "../../../shared/lib/supabase";
import { PAYMENT_METHODS, type RegistrarVentaParams, type VentaRegistrada, type VentaResumen } from "../../../shared/types/domain";

const saleInputSchema = z.object({
  sucursal_id: z.number().int().positive(),
  metodo_pago: z.enum(PAYMENT_METHODS),
  productos: z.array(z.object({
    producto_id: z.number().int().positive(),
    cantidad: z.number().int().positive(),
    precio: z.number().finite().nonnegative().optional(),
  })).min(1),
});

export const RegistrarVentaSchema = saleInputSchema;

export async function obtenerVentas(sucursalId?: number): Promise<VentaResumen[]> {
  let query = supabase
    .from("ventas")
    .select("id, sucursal_id, fecha, total, metodo_pago")
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);
  if (sucursalId !== undefined) query = query.eq("sucursal_id", z.number().int().positive().parse(sucursalId));
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as VentaResumen[];
}

export async function registrarVenta(params: RegistrarVentaParams): Promise<VentaRegistrada> {
  const input = saleInputSchema.parse(params);
  const { data, error } = await supabase.rpc("registrar_venta", {
    p_sucursal_id: input.sucursal_id,
    p_metodo_pago: input.metodo_pago,
    p_productos: input.productos,
  });
  if (error) throw new Error(error.message);
  return data as unknown as VentaRegistrada;
}
