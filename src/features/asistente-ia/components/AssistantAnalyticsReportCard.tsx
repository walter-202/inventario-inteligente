import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Surface, Text } from "react-native-paper";
import { colors, spacing } from "../../../shared/theme";
import { formatearPrecio } from "../../../shared/lib/utils";
import type { AssistantAnalysisReport } from "../api/assistantAnalyticsApi";
import { compartirInformeExcel, compartirInformePdf } from "../api/analyticsReportExport";

type ChartPoint = { label: string; value: number; displayValue: string };

function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 0 }).format(value);
}

function groupLabel(groupBy: string): string {
  const labels: Record<string, string> = {
    dia: "día",
    producto: "producto",
    categoria: "categoría",
    metodo_pago: "medio de pago",
    sucursal: "sucursal",
  };
  return labels[groupBy] ?? groupBy;
}

function getChartPoints(report: AssistantAnalysisReport): ChartPoint[] {
  const { analysis } = report;
  if (analysis.dataset === "sales") {
    return analysis.rows.slice(0, 6).map((row) => ({
      label: row.key,
      value: row.revenue,
      displayValue: formatearPrecio(row.revenue),
    }));
  }
  return analysis.rows.slice(0, 6).map((row) => ({
    label: row.key,
    value: row.stock_units,
    displayValue: `${formatNumber(row.stock_units)} uds`,
  }));
}

function ReportMetrics({ report }: { report: AssistantAnalysisReport }) {
  const { analysis } = report;
  const metrics = analysis.dataset === "sales"
    ? [
        { label: "Ingresos", value: formatearPrecio(analysis.summary.revenue) },
        { label: "Ventas", value: formatNumber(analysis.summary.transactions) },
        { label: "Unidades", value: formatNumber(analysis.summary.units) },
        { label: "Ticket promedio", value: formatearPrecio(analysis.summary.average_ticket) },
      ]
    : [
        { label: "Unidades en stock", value: formatNumber(analysis.summary.stock_units) },
        { label: "Productos", value: formatNumber(analysis.summary.products) },
        { label: "Bajo mínimo", value: formatNumber(analysis.summary.below_minimum) },
        { label: "Valor a precio de catálogo", value: formatearPrecio(analysis.summary.estimated_value) },
      ];

  return (
    <View style={styles.metrics}>
      {metrics.map((metric) => (
        <View key={metric.label} style={styles.metric}>
          <Text variant="labelSmall" style={styles.metricLabel}>{metric.label}</Text>
          <Text variant="titleSmall" style={styles.metricValue}>{metric.value}</Text>
        </View>
      ))}
    </View>
  );
}

function AnalysisBars({ points, dataset }: { points: ChartPoint[]; dataset: "sales" | "inventory" }) {
  const maximum = Math.max(0, ...points.map((point) => point.value));
  if (!points.length) {
    return <Text variant="bodySmall" style={styles.empty}>No hay filas para graficar con estos filtros.</Text>;
  }

  return (
    <View style={styles.chart}>
      <Text variant="labelMedium" style={styles.sectionTitle}>
        {dataset === "sales" ? "Ingresos por grupo" : "Unidades por grupo"}
      </Text>
      {points.map((point) => {
        const percentage = maximum > 0 ? Math.max(4, (point.value / maximum) * 100) : 0;
        return (
          <View key={point.label} style={styles.chartRow}>
            <Text variant="labelSmall" numberOfLines={1} style={styles.chartLabel}>{point.label}</Text>
            <View style={styles.track}>
              <View
                style={[
                  styles.bar,
                  dataset === "inventory" ? styles.inventoryBar : null,
                  { width: `${percentage}%` },
                ]}
              />
            </View>
            <Text variant="labelSmall" numberOfLines={1} style={styles.chartValue}>{point.displayValue}</Text>
          </View>
        );
      })}
    </View>
  );
}

function PeriodComparison({ report }: { report: AssistantAnalysisReport }) {
  const analysis = report.analysis;
  if (analysis.dataset !== "sales" || !analysis.previous_summary) return null;
  const previous = analysis.previous_summary.revenue;
  const current = analysis.summary.revenue;
  const change = previous > 0 ? ((current - previous) / previous) * 100 : null;
  const period = analysis.previous_from && analysis.previous_to
    ? `${analysis.previous_from}–${analysis.previous_to}`
    : "período anterior";
  const changeText = change === null
    ? "No hay base anterior para calcular la variación porcentual."
    : `${change > 0 ? "+" : ""}${change.toFixed(1)}% frente al período anterior.`;

  return (
    <View style={styles.comparison}>
      <Text variant="labelSmall" style={styles.metricLabel}>Comparación de ingresos · {period}</Text>
      <Text variant="bodySmall" style={styles.comparisonValue}>
        {formatearPrecio(previous)} → {formatearPrecio(current)} · {changeText}
      </Text>
    </View>
  );
}

export function AssistantAnalyticsReportCard({
  reports,
  conclusion,
}: {
  reports: AssistantAnalysisReport[];
  conclusion: string;
}) {
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportReport = async (format: "excel" | "pdf") => {
    if (exporting) return;
    setExporting(format);
    setError(null);
    try {
      if (format === "excel") await compartirInformeExcel(reports, conclusion);
      else await compartirInformePdf(reports, conclusion);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo exportar el informe.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <Surface style={styles.card} elevation={0}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text variant="titleSmall" style={styles.title}>Análisis con datos de Supabase</Text>
          <Text variant="bodySmall" style={styles.subtitle}>
            {reports.length} informe{reports.length === 1 ? "" : "s"} · listo para revisar y compartir
          </Text>
        </View>
        <Text style={styles.sparkle}>✦</Text>
      </View>

      {reports.map((report, index) => {
        const { analysis } = report;
        const title = analysis.dataset === "sales"
          ? `Ventas · ${groupLabel(analysis.group_by)}`
          : `Inventario · ${groupLabel(analysis.group_by)}`;
        const subtitle = analysis.dataset === "sales"
          ? `${analysis.from} a ${analysis.to} · ${report.scopeLabel}`
          : `Existencias actuales · ${report.scopeLabel}`;

        return (
          <View key={`${analysis.dataset}-${index}`} style={styles.report}>
            <View>
              <Text variant="titleSmall" style={styles.reportTitle}>{title}</Text>
              <Text variant="labelSmall" style={styles.subtitle}>{subtitle}</Text>
            </View>
            <ReportMetrics report={report} />
            <PeriodComparison report={report} />
            <AnalysisBars points={getChartPoints(report)} dataset={analysis.dataset} />
            <Text variant="labelSmall" style={styles.note}>
              Los indicadores resumen cubren el filtro completo; el gráfico muestra hasta 6 grupos y el detalle exportado hasta 20.
            </Text>
            {analysis.dataset === "inventory" ? (
              <Text variant="labelSmall" style={styles.note}>
                El valor estimado usa el precio del catálogo, no el costo de compra.
              </Text>
            ) : null}
          </View>
        );
      })}

      <View style={styles.actions}>
        <Button
          compact
          mode="outlined"
          disabled={exporting !== null || reports.length === 0}
          loading={exporting === "excel"}
          onPress={() => void exportReport("excel")}
          style={styles.actionButton}
        >
          Excel (.xlsx)
        </Button>
        <Button
          compact
          mode="outlined"
          disabled={exporting !== null || reports.length === 0}
          loading={exporting === "pdf"}
          onPress={() => void exportReport("pdf")}
          style={styles.actionButton}
        >
          Informe PDF
        </Button>
      </View>
      {error ? <Text variant="labelSmall" style={styles.error}>{error}</Text> : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md,
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerCopy: { flex: 1, gap: 2 },
  title: { color: colors.textPrimary, fontWeight: "700" },
  sparkle: { color: colors.primary, fontSize: 21, fontWeight: "700" },
  report: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  reportTitle: { color: colors.textPrimary, fontWeight: "700" },
  subtitle: { color: colors.textSecondary },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  metric: { width: "48%", minHeight: 50, justifyContent: "center", padding: spacing.sm, borderRadius: 9, backgroundColor: colors.background },
  metricLabel: { color: colors.textSecondary },
  metricValue: { color: colors.textPrimary, fontWeight: "700" },
  comparison: { padding: spacing.sm, borderRadius: 9, backgroundColor: colors.accentSoft, gap: 2 },
  comparisonValue: { color: colors.textPrimary, lineHeight: 18 },
  chart: { gap: spacing.xs },
  sectionTitle: { color: colors.textPrimary, fontWeight: "700", marginBottom: 2 },
  chartRow: { minHeight: 23, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  chartLabel: { width: "28%", color: colors.textSecondary },
  track: { height: 10, flex: 1, overflow: "hidden", backgroundColor: colors.accentSoft, borderRadius: 8 },
  bar: { height: "100%", backgroundColor: colors.accent, borderRadius: 8 },
  inventoryBar: { backgroundColor: colors.primary },
  chartValue: { width: "29%", textAlign: "right", color: colors.textPrimary },
  note: { color: colors.textSecondary, fontStyle: "italic" },
  empty: { color: colors.textSecondary, paddingVertical: spacing.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  actionButton: { borderRadius: 9 },
  error: { color: colors.danger },
});
