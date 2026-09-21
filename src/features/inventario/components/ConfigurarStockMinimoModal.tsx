import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Dialog, HelperText, Portal, Text, TextInput } from "react-native-paper";
import { Sliders } from "lucide-react-native";
import { colors, spacing } from "../../../shared/theme";
import type { AlertaStockItem, Producto } from "../../../shared/types/domain";

export interface ConfigurarStockMinimoModalProps {
  visible: boolean;
  item: AlertaStockItem | Producto | null;
  onDismiss: () => void;
  onSave: (stockMinimo: number) => Promise<void>;
  loading?: boolean;
}

export function ConfigurarStockMinimoModal({
  visible,
  item,
  onDismiss,
  onSave,
  loading = false,
}: ConfigurarStockMinimoModalProps) {
  const [threshold, setThreshold] = useState("5");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      const current = "stock_minimo" in item && item.stock_minimo !== undefined ? item.stock_minimo : 5;
      setThreshold(String(current));
      setError(null);
    }
  }, [item]);

  const handleConfirm = async () => {
    const num = Number(threshold);
    if (!Number.isInteger(num) || num < 0) {
      setError("El stock mínimo debe ser un número entero mayor o igual a 0.");
      return;
    }
    setError(null);
    try {
      await onSave(num);
      onDismiss();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al actualizar umbral.";
      setError(msg);
    }
  };

  if (!item) return null;

  const productName = "producto_nombre" in item ? item.producto_nombre : item.nombre;
  const productCode = "producto_codigo" in item ? item.producto_codigo : item.codigo;

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title style={styles.title}>
          <View style={styles.titleRow}>
            <Sliders size={20} color={colors.primary} />
            <Text variant="titleLarge" style={styles.titleText}>
              Umbral de Stock Mínimo (RF-08)
            </Text>
          </View>
        </Dialog.Title>

        <Dialog.Content style={styles.content}>
          <Text variant="titleMedium" style={styles.productName}>
            {productName}
          </Text>
          <Text variant="bodySmall" style={styles.muted}>
            SKU: {productCode}
          </Text>

          <Text variant="bodyMedium" style={styles.desc}>
            Cuando las existencias en una sucursal caigan por debajo de este valor, el sistema
            generará alertas visuales y sugerencias de reabastecimiento automáticas.
          </Text>

          <TextInput
            mode="outlined"
            label="Stock Mínimo de Seguridad"
            keyboardType="number-pad"
            value={threshold}
            onChangeText={(text) => {
              setThreshold(text);
              if (error) setError(null);
            }}
            style={styles.input}
          />

          <HelperText type="error" visible={Boolean(error)}>
            {error ?? ""}
          </HelperText>
        </Dialog.Content>

        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={loading}>
            Cancelar
          </Button>
          <Button mode="contained" onPress={handleConfirm} loading={loading} disabled={loading}>
            Guardar umbral
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: 16,
  },
  title: {
    paddingBottom: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  titleText: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  content: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  productName: {
    fontWeight: "700",
    color: colors.primary,
  },
  muted: {
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  desc: {
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  input: {
    marginTop: spacing.xs,
  },
});
