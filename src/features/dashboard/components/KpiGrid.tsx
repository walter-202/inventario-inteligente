import { BarChart3, Boxes, CircleAlert, ShoppingCart } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Badge, Card, Text } from "react-native-paper";
import type { DashboardMetrics } from "../../../shared/types/domain";
import { formatearPrecio } from "../../../shared/lib/utils";
import { colors, spacing } from "../../../shared/theme";

export function KpiGrid({ metrics }: { metrics: DashboardMetrics }) {
  const cards = [
    { label: "Ventas últimos 7 días", value: formatearPrecio(metrics.totalSales), icon: BarChart3, tint: colors.primarySoft },
    { label: "Operaciones de venta", value: String(metrics.salesCount), icon: ShoppingCart, tint: colors.secondarySoft },
    { label: "Unidades en stock", value: String(metrics.stockUnits), icon: Boxes, tint: colors.tertiarySoft },
    { label: "Productos con stock bajo", value: String(metrics.lowStockCount), icon: CircleAlert, tint: colors.warningSoft },
  ];
  return <View style={styles.grid}>{cards.map(({ label, value, icon: Icon, tint }) => <Card key={label} mode="outlined" style={styles.card}><Card.Content style={styles.content}><View style={styles.topRow}><View style={[styles.icon, { backgroundColor: tint }]}><Icon size={18} color={colors.primary} /></View><Badge style={styles.badge}>Real</Badge></View><Text variant="bodySmall" style={styles.label}>{label}</Text><Text variant="titleLarge" style={styles.value}>{value}</Text></Card.Content></Card>)}</View>;
}

const styles = StyleSheet.create({ grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md }, card: { width: "47%", flexGrow: 1 }, content: { gap: spacing.sm }, topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, icon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" }, badge: { backgroundColor: colors.successSoft, color: colors.success, paddingHorizontal: 6 }, label: { color: colors.textSecondary }, value: { color: colors.textPrimary, fontWeight: "700" } });
