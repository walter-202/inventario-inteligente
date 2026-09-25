import { z } from "zod";
import { supabase } from "../../../shared/lib/supabase";
import { fetchAllPages } from "../../../shared/lib/pagination";
import { obtenerInventario, obtenerStockMultiSucursal } from "../../inventario/api/inventarioApi";
import type { DashboardLowStockItem, DashboardMetrics } from "../../../shared/types/domain";
import {
  bucketSalesByLocalDay,
  getDashboardCalendar,
  getDayCalendarDaysAgo,
  getMonthCalendar,
  getTodayCalendar,
} from "../lib/dateBuckets";

export type SalesQueryPeriod = "hoy" | "semana" | "mes" | "dia";

export const SALES_PERIOD_LABELS: Record<Exclude<SalesQueryPeriod, "dia">, string> = {
  hoy: "hoy",
  semana: "los últimos 7 días",
  mes: "este mes",
};

export function formatSalesPeriodLabel(periodo: SalesQueryPeriod, diasAtras?: number): string {
  if (periodo !== "dia") return SALES_PERIOD_LABELS[periodo];
  const offset = diasAtras ?? 0;
  if (offset === 0) return "hoy";
  if (offset === 1) return "ayer";
  return `hace ${offset} días`;
}

function getPeriodCalendar(
  periodo: SalesQueryPeriod,
  now: Date,
  diasAtras = 0,
): { startInclusive: Date; endExclusive: Date } {
  if (periodo === "dia") return getDayCalendarDaysAgo(diasAtras, now);
  if (periodo === "hoy") return getTodayCalendar(now);
  if (periodo === "semana") {
    const { startInclusive, endExclusive } = getDashboardCalendar(now);
    return { startInclusive, endExclusive };
  }
  return getMonthCalendar(now);
}

/** Operational definition used by the dashboard; it never invents stock values. */
export const LOW_STOCK_THRESHOLD = 5;

const salesRowSchema = z.object({ id: z.number(), total: z.number(), fecha: z.string(), sucursal_id: z.number() });

export type SalesSummary = Pick<DashboardMetrics, "totalSales" | "salesCount"> & {
  periodo: SalesQueryPeriod;
  diasAtras?: number;
};

/** Read-only sales aggregate for assistant queries scoped to a local calendar period. */
export async function obtenerVentasPorPeriodo(
  periodo: SalesQueryPeriod,
  sucursalId?: number,
  now = new Date(),
  diasAtras = 0,
): Promise<SalesSummary> {
  const offset = periodo === "dia" ? diasAtras : 0;
  const { startInclusive, endExclusive } = getPeriodCalendar(periodo, now, offset);
  const validatedSucursalId = sucursalId === undefined
    ? undefined
    : z.number().int().positive().parse(sucursalId);
  const rows = await fetchAllPages(async (from, to) => {
    let salesQuery = supabase
      .from("ventas")
      .select("id, total, fecha, sucursal_id")
      .gte("fecha", startInclusive.toISOString())
      .lt("fecha", endExclusive.toISOString())
      .order("fecha", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (validatedSucursalId !== undefined) salesQuery = salesQuery.eq("sucursal_id", validatedSucursalId);
    const { data, error } = await salesQuery;
    if (error) throw new Error(error.message);
    return data ?? [];
  });
  const sales = rows.map((row) => salesRowSchema.parse(row));
  return {
    totalSales: sales.reduce((sum, sale) => sum + Number(sale.total), 0),
    salesCount: sales.length,
    periodo,
    ...(periodo === "dia" ? { diasAtras } : {}),
  };
}

/** @deprecated Prefer {@link obtenerVentasPorPeriodo} with periodo `"hoy"`. */
export async function obtenerVentasDeHoy(
  sucursalId?: number,
  now = new Date(),
): Promise<Pick<DashboardMetrics, "totalSales" | "salesCount">> {
  const summary = await obtenerVentasPorPeriodo("hoy", sucursalId, now);
  return { totalSales: summary.totalSales, salesCount: summary.salesCount };
}

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
