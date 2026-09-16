import { StyleSheet, View } from "react-native";
import { Card, Text } from "react-native-paper";
import type { DashboardLowStockItem } from "../../../shared/types/domain";
import { StatusBadge } from "../../../shared/components/StatusBadge";
import { colors, spacing } from "../../../shared/theme";

export function LowStockList({ items }: { items: DashboardLowStockItem[] }) {
  return <Card mode="outlined" style={styles.card}><Card.Title title="Próximos a agotarse" subtitle="Inventario real por sucursal" />{items.length === 0 ? <Card.Content><Text style={styles.empty}>No hay productos bajo el umbral operativo.</Text></Card.Content> : <Card.Content style={styles.list}>{items.slice(0, 10).map((item) => <View key={item.id} style={styles.row}><View style={styles.copy}><Text variant="titleSmall" numberOfLines={1}>{item.producto.nombre}</Text><Text variant="bodySmall" style={styles.muted}>{item.sucursal.nombre} · {item.producto.codigo}</Text></View><StatusBadge label={`${item.cantidad} u.`} status={item.cantidad <= 0 ? "danger" : "warning"} /></View>)}</Card.Content>}</Card>;
}

const styles = StyleSheet.create({ card: { marginTop: spacing.lg }, list: { gap: spacing.md }, row: { flexDirection: "row", alignItems: "center", gap: spacing.md }, copy: { flex: 1, gap: 2 }, muted: { color: colors.textSecondary }, empty: { color: colors.textSecondary } });
