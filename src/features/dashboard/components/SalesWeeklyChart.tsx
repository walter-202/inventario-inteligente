import { StyleSheet, View } from "react-native";
import { Card, Text } from "react-native-paper";
import type { DashboardDay } from "../../../shared/types/domain";
import { colors, spacing } from "../../../shared/theme";

export function SalesWeeklyChart({ days }: { days: DashboardDay[] }) {
  const max = Math.max(...days.map((day) => day.total), 0);
  const hasSales = days.some((day) => day.total > 0);
  return <Card mode="outlined" style={styles.card}><Card.Title title="Ventas de la semana" subtitle={hasSales ? "Datos reales de ventas registradas" : "Sin ventas registradas en los últimos 7 días"} /><Card.Content>{hasSales ? <View style={styles.chart}>{days.map((day) => <View key={day.date} style={styles.column}><Text variant="labelSmall" style={styles.amount}>{day.total > 0 ? day.total.toFixed(0) : ""}</Text><View style={styles.track}><View style={[styles.bar, day.total >= max && max > 0 ? styles.barPeak : null, { height: `${Math.max((day.total / max) * 100, day.total > 0 ? 6 : 0)}%` }]} /></View><Text variant="labelSmall">{day.label}</Text></View>)}</View> : <Text style={styles.empty}>Cuando se registren ventas aparecerán aquí.</Text>}</Card.Content></Card>;
}

const styles = StyleSheet.create({ card: { marginTop: spacing.lg }, chart: { height: 170, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.sm }, column: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: spacing.xs, height: "100%" }, amount: { color: colors.textSecondary }, track: { flex: 1, width: "100%", justifyContent: "flex-end", backgroundColor: colors.accentSoft, borderRadius: 6, overflow: "hidden" }, bar: { width: "100%", backgroundColor: colors.accent, borderRadius: 6 }, barPeak: { backgroundColor: colors.rosa }, empty: { color: colors.textSecondary, paddingVertical: spacing.lg } });
