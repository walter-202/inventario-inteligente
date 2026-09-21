import { z } from "zod";
import { supabase } from "../../../shared/lib/supabase";
import type {
  AlertaStockItem,
  Producto,
  StockAlertLevel,
  SugerenciaReabastecimiento,
} from "../../../shared/types/domain";

export function calcularNivelStock(cantidad: number, stockMinimo = 5): StockAlertLevel {
  if (cantidad <= 0) return "critico";
  if (cantidad <= stockMinimo) return "bajo";
  return "optimo";
}

export async function obtenerAlertasStock(sucursalId?: number): Promise<AlertaStockItem[]> {
  // 1. Fetch inventories joined with products and branches
  let query = supabase
    .from("inventarios")
    .select(
      "id, producto_id, sucursal_id, cantidad, productos(id, nombre, codigo, categoria, stock_minimo), sucursales(id, nombre)",
    )
    .order("cantidad", { ascending: true });

  if (sucursalId !== undefined) {
    query = query.eq("sucursal_id", z.number().int().positive().parse(sucursalId));
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const raw = (data ?? []) as any[];

  // Also query Central Warehouse stock to inform manager of immediate availability
  const { data: centralRows } = await supabase
    .from("inventarios")
    .select("producto_id, sucursal_id, cantidad, sucursales(id, nombre)")
    .ilike("sucursales.nombre", "%central%");

  const centralStockMap = new Map<number, { cantidad: number; sucursalId: number }>();
  if (centralRows) {
    for (const cr of centralRows) {
      if (cr.sucursales) {
        centralStockMap.set(cr.producto_id, {
          cantidad: cr.cantidad,
          sucursalId: cr.sucursal_id,
        });
      }
    }
  }

  const alerts: AlertaStockItem[] = [];

  for (const row of raw) {
    const minThreshold = row.productos?.stock_minimo ?? 5;
    const currentQty = row.cantidad ?? 0;

    if (currentQty <= minThreshold) {
      const centralInfo = centralStockMap.get(row.producto_id);
      alerts.push({
        id: row.id,
        producto_id: row.producto_id,
        producto_nombre: row.productos?.nombre ?? `Producto #${row.producto_id}`,
        producto_codigo: row.productos?.codigo ?? `COD-${row.producto_id}`,
        categoria: row.productos?.categoria ?? "General",
        sucursal_id: row.sucursal_id,
        sucursal_nombre: row.sucursales?.nombre ?? `Sucursal ${row.sucursal_id}`,
        cantidad_actual: currentQty,
        stock_minimo: minThreshold,
        deficit: Math.max(0, minThreshold - currentQty),
        nivel: calcularNivelStock(currentQty, minThreshold),
        stock_central_disponible: centralInfo?.cantidad ?? 0,
        almacen_central_id: centralInfo?.sucursalId,
      });
    }
  }

  // Sort: criticos first, then by highest deficit
  return alerts.sort((a, b) => {
    if (a.nivel === "critico" && b.nivel !== "critico") return -1;
    if (b.nivel === "critico" && a.nivel !== "critico") return 1;
    return b.deficit - a.deficit;
  });
}

export async function obtenerSugerenciasReabastecimiento(
  sucursalDestinoId?: number,
): Promise<SugerenciaReabastecimiento[]> {
  // 1. Fetch low stock alerts
  const alerts = await obtenerAlertasStock(sucursalDestinoId);
  if (alerts.length === 0) return [];

  // 2. Fetch all inventory to locate surplus
  const { data: allStock, error: stockErr } = await supabase
    .from("inventarios")
    .select("producto_id, sucursal_id, cantidad, sucursales(id, nombre)")
    .order("cantidad", { ascending: false });

  if (stockErr) throw new Error(stockErr.message);

  const stockByProductAndBranch = new Map<string, { cantidad: number; sucursalNombre: string }>();
  for (const s of allStock ?? []) {
    stockByProductAndBranch.set(`${s.producto_id}_${s.sucursal_id}`, {
      cantidad: s.cantidad,
      sucursalNombre: (s.sucursales as any)?.nombre ?? `Sucursal ${s.sucursal_id}`,
    });
  }

  const suggestions: SugerenciaReabastecimiento[] = [];

  for (const alert of alerts) {
    // If this alert is already in central, we cannot replenish from central to central
    // Look for a source branch with surplus (priority: Central, then any other branch with > min stock)
    let bestSourceBranchId: number | null = null;
    let bestSourceName = "";
    let availableAtSource = 0;

    // Check central first if destination is not central
    if (alert.almacen_central_id && alert.almacen_central_id !== alert.sucursal_id) {
      const centralStock = alert.stock_central_disponible ?? 0;
      if (centralStock > 0) {
        bestSourceBranchId = alert.almacen_central_id;
        const info = stockByProductAndBranch.get(`${alert.producto_id}_${alert.almacen_central_id}`);
        bestSourceName = info?.sucursalNombre ?? "Almacén Central";
        availableAtSource = centralStock;
      }
    }

    // If no central stock, check other branches with available surplus
    if (!bestSourceBranchId) {
      for (const [key, val] of stockByProductAndBranch.entries()) {
        const [pId, sId] = key.split("_").map(Number);
        if (pId === alert.producto_id && sId !== alert.sucursal_id && val.cantidad > alert.stock_minimo) {
          if (val.cantidad > availableAtSource) {
            availableAtSource = val.cantidad;
            bestSourceBranchId = sId;
            bestSourceName = val.sucursalNombre;
          }
        }
      }
    }

    if (bestSourceBranchId && availableAtSource > 0) {
      // Calculate suggested transfer quantity: fill deficit + safety margin (capped by available source stock)
      const targetReplenish = alert.deficit + Math.max(5, alert.stock_minimo);
      const suggestedQty = Math.max(1, Math.min(targetReplenish, availableAtSource));

      const urgencia: SugerenciaReabastecimiento["urgencia"] =
        alert.cantidad_actual === 0
          ? "urgente"
          : alert.cantidad_actual <= Math.ceil(alert.stock_minimo / 2)
          ? "alta"
          : "media";

      const justificacion =
        alert.cantidad_actual === 0
          ? `Stock agotado (0 unids) en ${alert.sucursal_nombre}. Se recomienda transferir de inmediato ${suggestedQty} unids desde ${bestSourceName} (${availableAtSource} unids disponibles).`
          : `Existencias por debajo del umbral mínimo (${alert.cantidad_actual}/${alert.stock_minimo} unids) en ${alert.sucursal_nombre}. ${bestSourceName} cuenta con ${availableAtSource} unids para reabastecer.`;

      suggestions.push({
        id: `sug_${alert.producto_id}_${alert.sucursal_id}_${bestSourceBranchId}`,
        producto_id: alert.producto_id,
        producto_nombre: alert.producto_nombre,
        producto_codigo: alert.producto_codigo,
        sucursal_origen_id: bestSourceBranchId,
        sucursal_origen_nombre: bestSourceName,
        sucursal_destino_id: alert.sucursal_id,
        sucursal_destino_nombre: alert.sucursal_nombre,
        cantidad_sugerida: suggestedQty,
        stock_origen_disponible: availableAtSource,
        stock_destino_actual: alert.cantidad_actual,
        stock_destino_minimo: alert.stock_minimo,
        urgencia,
        justificacion,
      });
    }
  }

  // Sort by urgency
  const urgencyWeight = { urgente: 3, alta: 2, media: 1 };
  return suggestions.sort((a, b) => urgencyWeight[b.urgencia] - urgencyWeight[a.urgencia]);
}

export async function configurarStockMinimo(
  productoId: number,
  stockMinimo: number,
): Promise<Producto> {
  const pId = z.number().int().positive().parse(productoId);
  const minVal = z.number().int().nonnegative().parse(stockMinimo);

  const { data, error } = await supabase
    .from("productos")
    .update({ stock_minimo: minVal, updated_at: new Date().toISOString() })
    .eq("id", pId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Producto;
}
