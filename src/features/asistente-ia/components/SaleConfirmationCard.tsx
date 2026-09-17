import { StyleSheet, View } from "react-native";
import { Button, Divider, Text } from "react-native-paper";
import { colors, spacing } from "../../../shared/theme";
import { formatearPrecio } from "../../../shared/lib/utils";

export interface VentaConfirmationLine {
  producto_id: number;
  nombre: string;
  cantidad: number;
  precio: number;
}

interface SaleConfirmationCardProps {
  branchName: string;
  lines: VentaConfirmationLine[];
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onSendToCart?: () => void;
}

/** Previsualización obligatoria antes de registrar la venta (RN-03). */
export function SaleConfirmationCard({ branchName, lines, loading, onConfirm, onCancel, onSendToCart }: SaleConfirmationCardProps) {
  const total = lines.reduce((sum, line) => sum + line.cantidad * line.precio, 0);
  return (
    <View style={styles.card}>
      <Text variant="titleSmall" style={styles.title}>
        Confirmar venta · {branchName}
      </Text>
      {lines.map((line) => (
        <View key={line.producto_id} style={styles.row}>
          <Text variant="bodyMedium" style={styles.name}>
            {line.cantidad} × {line.nombre}
          </Text>
          <Text variant="bodyMedium" style={styles.price}>
            {formatearPrecio(line.cantidad * line.precio)}
          </Text>
        </View>
      ))}
      <Divider />
      <View style={styles.row}>
        <Text variant="titleSmall">Total</Text>
        <Text variant="titleMedium" style={styles.total}>
          {formatearPrecio(total)}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button onPress={onCancel} disabled={loading} compact>
          Corregir
        </Button>
        {onSendToCart ? (
          <Button mode="outlined" onPress={onSendToCart} disabled={loading} compact>
            Cargar al Carrito
          </Button>
        ) : null}
        <Button mode="contained" onPress={onConfirm} loading={loading} disabled={loading} compact>
          Confirmar Venta
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    padding: spacing.sm + 2,
    gap: spacing.xs,
  },
  title: { fontWeight: "700", color: colors.textPrimary },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  name: { flex: 1, color: colors.textPrimary },
  price: { color: colors.textSecondary, fontWeight: "600" },
  total: { color: colors.primary, fontWeight: "800" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.xs, marginTop: 2 },
});
