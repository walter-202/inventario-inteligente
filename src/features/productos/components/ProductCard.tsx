import { Barcode, ChevronRight, Tag } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Card, Text, useTheme } from "react-native-paper";
import type { Producto } from "../../../shared/types/domain";
import { formatearPrecio } from "../../../shared/lib/utils";
import { colors, spacing } from "../../../shared/theme";

export function ProductCard({ producto, onPress }: { producto: Producto; onPress?: () => void }) {
  const theme = useTheme();
  return (
    <Card style={styles.card} mode="outlined" onPress={onPress}>
      <Card.Content style={styles.content}>
        <View style={styles.copy}>
          <Text variant="titleMedium" style={styles.name} numberOfLines={2}>{producto.nombre}</Text>
          <View style={styles.meta}><Barcode size={14} color={theme.colors.onSurfaceVariant} /><Text variant="bodySmall">{producto.codigo}</Text></View>
          <View style={styles.meta}><Tag size={14} color={theme.colors.onSurfaceVariant} /><Text variant="bodySmall">{producto.categoria}</Text></View>
        </View>
        <View style={styles.priceCol}>
          <Text variant="titleMedium" style={{ color: theme.colors.primary, fontWeight: "700" }}>{formatearPrecio(producto.precio)}</Text>
          {onPress ? <ChevronRight size={18} color={colors.textMuted} /> : null}
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  content: { flexDirection: "row", gap: spacing.md },
  copy: { flex: 1, gap: 4 },
  name: { fontWeight: "700" },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  priceCol: { alignItems: "flex-end", justifyContent: "space-between", paddingVertical: 2 },
});
