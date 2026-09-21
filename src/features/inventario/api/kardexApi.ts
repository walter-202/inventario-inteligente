import { z } from "zod";
import { supabase } from "../../../shared/lib/supabase";
import type { KardexFilterParams, MovimientoKardexItem } from "../../../shared/types/domain";

function classifySubtype(
  tipo: string,
  obs?: string | null,
): MovimientoKardexItem["subtipo"] {
  const o = (obs ?? "").toLowerCase();
  if (o.includes("reversión") || o.includes("anulación")) return "anulacion";
  if (o.includes("merma")) return "merma";
  if (o.includes("venta")) return "venta";
  if (o.includes("despacho") || o.includes("guía gd-")) return "despacho";
  if (o.includes("recepción") || o.includes("recepcion")) return "recepcion";
  return "ajuste";
}

export async function obtenerKardexMovimientos(
  filters: KardexFilterParams = {},
): Promise<MovimientoKardexItem[]> {
  let query = supabase
    .from("movimientos")
    .select(
      "id, producto_id, sucursal_id, sucursal_destino_id, tipo, cantidad, observacion, created_at, productos(id, nombre, codigo, categoria), sucursales!movimientos_sucursal_id_fkey(id, nombre)",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(filters.limite ?? 100);

  if (filters.sucursal_id) {
    query = query.eq("sucursal_id", filters.sucursal_id);
  }

  if (filters.producto_id) {
    query = query.eq("producto_id", filters.producto_id);
  }

  if (filters.tipo && filters.tipo !== "todas") {
    query = query.eq("tipo", filters.tipo);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rawList = (data ?? []) as any[];

  // Map to domain items
  const items: MovimientoKardexItem[] = rawList.map((row) => ({
    id: row.id,
    fecha: row.created_at,
    producto_id: row.producto_id,
    producto_nombre: row.productos?.nombre ?? `Producto #${row.producto_id}`,
    producto_codigo: row.productos?.codigo ?? `ID-${row.producto_id}`,
    sucursal_id: row.sucursal_id,
    sucursal_nombre: row.sucursales?.nombre ?? `Sucursal #${row.sucursal_id}`,
    sucursal_destino_id: row.sucursal_destino_id,
    tipo: row.tipo as "entrada" | "salida" | "transferencia",
    subtipo: classifySubtype(row.tipo, row.observacion),
    cantidad: row.cantidad,
    observacion: row.observacion,
  }));

  // If filtered by a single product, calculate running balances (Kardex chronological balance)
  if (filters.producto_id) {
    // Sort chronologically ascending to compute progressive balances
    const sortedAsc = [...items].sort(
      (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime() || a.id - b.id,
    );
    let running = 0;
    for (const item of sortedAsc) {
      if (item.tipo === "entrada") {
        running += item.cantidad;
      } else if (item.tipo === "salida") {
        running = Math.max(0, running - item.cantidad);
      }
      item.saldo_resultante = running;
    }
  }

  return items;
}
