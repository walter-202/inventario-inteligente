import { Card, Text } from "react-native-paper";
import { StyleSheet, View } from "react-native";
import type { InventarioItem } from "../../../shared/types/domain";
import { StatusBadge } from "../../../shared/components/StatusBadge";
import { colors, spacing } from "../../../shared/theme";

export function InventarioCard({ item, onPress }: { item: InventarioItem; onPress?: () => void }) {
  const status = item.cantidad <= 0 ? "danger" : item.cantidad <= 5 ? "warning" : "success";
  return <Card mode="outlined" style={styles.card} onPress={onPress}><Card.Content style={styles.content}><View style={styles.copy}><Text variant="titleMedium" numberOfLines={2}>{item.producto.nombre}</Text><Text variant="bodySmall" style={styles.muted}>{item.producto.codigo} · {item.sucursal.nombre}</Text></View><View style={styles.stock}><Text variant="headlineSmall" style={styles.amount}>{item.cantidad}</Text><StatusBadge label={item.cantidad <= 0 ? "Sin stock" : item.cantidad <= 5 ? "Bajo" : "Disponible"} status={status} /></View></Card.Content></Card>;
}

const styles = StyleSheet.create({ card: { marginBottom: spacing.md }, content: { flexDirection: "row", alignItems: "center", gap: spacing.md }, copy: { flex: 1, gap: spacing.xs }, muted: { color: colors.textSecondary }, stock: { alignItems: "flex-end", gap: spacing.xs }, amount: { color: colors.textPrimary, fontWeight: "700" } });
