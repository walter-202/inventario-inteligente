import { z } from "zod";
import { supabase } from "../../../shared/lib/supabase";

export type AssistantSalesGroupBy = "dia" | "producto" | "categoria" | "metodo_pago" | "sucursal";
export type AssistantInventoryGroupBy = "producto" | "categoria" | "sucursal";

export interface AssistantSalesAnalysisOptions {
  desde: string;
  hasta: string;
  groupBy: AssistantSalesGroupBy;
  sucursalId?: number;
  compararPeriodoAnterior?: boolean;
  limite?: number;
  categoria?: string;
  producto?: string;
  metodoPago?: string;
}

export interface AssistantInventoryAnalysisOptions {
  groupBy: AssistantInventoryGroupBy;
  sucursalId?: number;
  soloBajoMinimo?: boolean;
  limite?: number;
  categoria?: string;
  producto?: string;
}

export interface AssistantSalesAnalysis {
  dataset: "sales";
  from: string;
  to: string;
  group_by: AssistantSalesGroupBy;
  summary: {
    revenue: number;
    transactions: number;
    units: number;
    average_ticket: number;
  };
  previous_from: string | null;
  previous_to: string | null;
  previous_summary: {
    revenue: number;
    transactions: number;
    average_ticket: number;
  } | null;
  category_filter: string | null;
  product_query: string | null;
  payment_method: string | null;
  rows: Array<{
    key: string;
    revenue: number;
    transactions: number;
    units: number;
    average_ticket: number;
  }>;
}

export interface AssistantInventoryAnalysis {
  dataset: "inventory";
  group_by: AssistantInventoryGroupBy;
  branch_id: number | null;
  only_below_minimum: boolean;
  category_filter: string | null;
  product_query: string | null;
  summary: {
    stock_units: number;
    estimated_value: number;
    products: number;
    below_minimum: number;
  };
  rows: Array<{
    key: string;
    products: number;
    stock_units: number;
    estimated_value: number;
    below_minimum: number;
  }>;
}

export type AssistantAnalysis = AssistantSalesAnalysis | AssistantInventoryAnalysis;

export interface AssistantAnalysisReport {
  analysis: AssistantAnalysis;
  scopeLabel: string;
}

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usá fechas con formato YYYY-MM-DD.");
const numberValue = z.coerce.number().finite();

const salesAnalysisSchema = z.object({
  dataset: z.literal("sales"),
  from: dateOnly,
  to: dateOnly,
  group_by: z.enum(["dia", "producto", "categoria", "metodo_pago", "sucursal"]),
  summary: z.object({
    revenue: numberValue,
    transactions: numberValue,
    units: numberValue,
    average_ticket: numberValue,
  }),
  previous_from: dateOnly.nullable(),
  previous_to: dateOnly.nullable(),
  previous_summary: z.object({
    revenue: numberValue,
    transactions: numberValue,
    average_ticket: numberValue,
  }).nullable(),
  category_filter: z.string().nullable(),
  product_query: z.string().nullable(),
  payment_method: z.string().nullable(),
  rows: z.array(z.object({
    key: z.string(),
    revenue: numberValue,
    transactions: numberValue,
    units: numberValue,
    average_ticket: numberValue,
  })),
});

const inventoryAnalysisSchema = z.object({
  dataset: z.literal("inventory"),
  group_by: z.enum(["producto", "categoria", "sucursal"]),
  branch_id: numberValue.nullable(),
  only_below_minimum: z.boolean(),
  category_filter: z.string().nullable(),
  product_query: z.string().nullable(),
  summary: z.object({
    stock_units: numberValue,
    estimated_value: numberValue,
    products: numberValue,
    below_minimum: numberValue,
  }),
  rows: z.array(z.object({
    key: z.string(),
    products: numberValue,
    stock_units: numberValue,
    estimated_value: numberValue,
    below_minimum: numberValue,
  })),
});

const assistantAnalysisSchema = z.discriminatedUnion("dataset", [salesAnalysisSchema, inventoryAnalysisSchema]);

/** Validates persisted analytics before rendering or exporting them. */
export function parseAssistantAnalysis(value: unknown): AssistantAnalysis | null {
  const parsed = assistantAnalysisSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function inclusiveDayCount(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error("El rango de fechas de ventas no es válido.");
  }
  const days = Math.floor((end - start) / 86_400_000) + 1;
  if (days > 365) throw new Error("El análisis acepta rangos de hasta 365 días.");
  return days;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function previousPeriod(from: string, days: number): { from: string; to: string } {
  const end = new Date(`${from}T00:00:00.000Z`);
  const previousTo = new Date(end);
  previousTo.setUTCDate(previousTo.getUTCDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setUTCDate(previousFrom.getUTCDate() - days + 1);
  return { from: formatDate(previousFrom), to: formatDate(previousTo) };
}

export async function obtenerAnalisisVentasAsistente(
  options: AssistantSalesAnalysisOptions,
): Promise<AssistantSalesAnalysis> {
  const days = inclusiveDayCount(options.desde, options.hasta);
  const comparison = options.compararPeriodoAnterior ? previousPeriod(options.desde, days) : null;
  const { data, error } = await supabase.rpc("assistant_analyze_sales", {
    p_from: options.desde,
    p_to: options.hasta,
    p_group_by: options.groupBy,
    p_branch_id: options.sucursalId ?? null,
    p_limit: options.limite ?? 10,
    p_compare_from: comparison?.from ?? null,
    p_compare_to: comparison?.to ?? null,
    p_category_filter: options.categoria?.trim() || null,
    p_product_query: options.producto?.trim() || null,
    p_payment_method: options.metodoPago?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return salesAnalysisSchema.parse(data);
}

export async function obtenerAnalisisInventarioAsistente(
  options: AssistantInventoryAnalysisOptions,
): Promise<AssistantInventoryAnalysis> {
  const { data, error } = await supabase.rpc("assistant_analyze_inventory", {
    p_group_by: options.groupBy,
    p_branch_id: options.sucursalId ?? null,
    p_limit: options.limite ?? 10,
    p_only_below_minimum: options.soloBajoMinimo ?? false,
    p_category_filter: options.categoria?.trim() || null,
    p_product_query: options.producto?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return inventoryAnalysisSchema.parse(data);
}
