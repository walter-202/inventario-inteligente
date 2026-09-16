import { z } from "zod";
import { supabase } from "../../../shared/lib/supabase";
import { fetchAllPages } from "../../../shared/lib/pagination";
import { obtenerInventario, obtenerStockMultiSucursal } from "../../inventario/api/inventarioApi";
import type { DashboardLowStockItem, DashboardMetrics } from "../../../shared/types/domain";
import { bucketSalesByLocalDay, getDashboardCalendar } from "../lib/dateBuckets";

/** Operational definition used by the dashboard; it never invents stock values. */
export const LOW_STOCK_THRESHOLD = 5;

const salesRowSchema = z.object({ id: z.number(), total: z.number(), fecha: z.string(), sucursal_id: z.number() });

export async function obtenerDashboardMetrics(sucursalId?: number, now = new Date()): Promise<DashboardMetrics> {
  const calendar = getDashboardCalendar(now);
  const days = calendar.days;
  const firstDay = calendar.startInclusive.toISOString();
  const endExclusive = calendar.endExclusive.toISOString();
  const salesPromise = fetchAllPages(async (from, to) => {
    let salesQuery = supabase
      .from("ventas")
      .select("id, total, fecha, sucursal_id")
      .gte("fecha", firstDay)
      .lt("fecha", endExclusive)
      .order("fecha", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (sucursalId !== undefined) salesQuery = salesQuery.eq("sucursal_id", z.number().int().positive().parse(sucursalId));
    const { data, error } = await salesQuery;
    if (error) throw new Error(error.message);
    return data ?? [];
  });
  const [salesResult, inventory] = await Promise.all([
    salesPromise,
    sucursalId === undefined ? obtenerStockMultiSucursal() : obtenerInventario(sucursalId),
  ]);
  const parsedSales = salesResult.map((row) => salesRowSchema.parse(row));
  bucketSalesByLocalDay(days, parsedSales);
  const lowStock = inventory
    .filter((item) => item.cantidad <= LOW_STOCK_THRESHOLD)
    .map((item): DashboardLowStockItem => ({ ...item, threshold: LOW_STOCK_THRESHOLD }))
    .sort((a, b) => a.cantidad - b.cantidad);
  return {
    totalSales: parsedSales.reduce((sum, sale) => sum + Number(sale.total), 0),
    salesCount: parsedSales.length,
    stockUnits: inventory.reduce((sum, item) => sum + item.cantidad, 0),
    lowStockCount: lowStock.length,
    weeklySales: days,
    lowStock,
  };
}
