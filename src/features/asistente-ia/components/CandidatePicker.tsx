import { StyleSheet, View } from "react-native";
import { Button, Card, Chip, Text } from "react-native-paper";
import type { Producto } from "../../../shared/types/domain";
import { colors, spacing } from "../../../shared/theme";
import { formatearPrecio } from "../../../shared/lib/utils";

interface CandidatePickerProps {
  candidatos: Producto[];
  /** Stock en la sucursal activa por producto. */
  stockLocal: Record<number, number>;
  branchName: string;
  disabled?: boolean;
  onSelect: (producto: Producto) => void;
}

/**
 * Desambiguación: cuando el usuario dice "chompas" y hay varias, el agente
 * lista cada candidata con SKU, categoría, precio y stock para validar.
 */
export function CandidatePicker({ candidatos, stockLocal, branchName, disabled = false, onSelect }: CandidatePickerProps) {
  return (
    <View style={styles.list}>
      {candidatos.slice(0, 5).map((producto) => {
        const stock = stockLocal[producto.id] ?? 0;
        return (
          <Card key={producto.id} mode="outlined" style={styles.card}>
            <Card.Content style={styles.content}>
              <View style={styles.header}>
                <Text variant="titleSmall" style={styles.name}>
                  {producto.nombre}
                </Text>
                <Chip compact style={styles.skuChip} textStyle={styles.skuText}>
                  {producto.codigo}
                </Chip>
              </View>
              <Text variant="bodySmall" style={styles.meta}>
                {producto.categoria} · {formatearPrecio(producto.precio)}
              </Text>
              <Text variant="bodySmall" style={[styles.stock, stock <= 0 && styles.stockEmpty]}>
                {branchName ? `${branchName}: ${stock} uds` : `Stock: ${stock} uds`}
              </Text>
              <Button compact mode="outlined" disabled={disabled} onPress={() => onSelect(producto)} style={styles.button}>
                Elegir este
              </Button>
            </Card.Content>
          </Card>
        );
      })}
      {candidatos.length > 5 ? (
        <Text variant="bodySmall" style={styles.more}>
          +{candidatos.length - 5} más. Escribí el SKU exacto para afinar.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs },
  card: { backgroundColor: colors.surface },
  content: { gap: 4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs },
  name: { flex: 1, color: colors.textPrimary, fontWeight: "700" },
  skuChip: { backgroundColor: colors.surfaceSecondary },
  skuText: { fontSize: 11, fontWeight: "700", color: colors.textPrimary },
  meta: { color: colors.textSecondary },
  stock: { color: colors.successDark, fontWeight: "600" },
  stockEmpty: { color: colors.danger },
  button: { alignSelf: "flex-start", marginTop: 2 },
  more: { color: colors.textSecondary },
});
