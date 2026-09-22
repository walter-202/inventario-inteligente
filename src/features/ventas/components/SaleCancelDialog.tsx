import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Dialog, HelperText, Portal, Text, TextInput } from "react-native-paper";
import { AlertTriangle } from "lucide-react-native";
import { colors, spacing } from "../../../shared/theme";
import { formatearFechaHora, formatearPrecio } from "../../../shared/lib/utils";
import type { VentaResumen } from "../../../shared/types/domain";

export interface SaleCancelDialogProps {
  visible: boolean;
  sale: VentaResumen | null;
  onDismiss: () => void;
  onConfirm: (motivo: string) => Promise<void>;
  loading?: boolean;
}

export function SaleCancelDialog({
  visible,
  sale,
  onDismiss,
  onConfirm,
  loading = false,
}: SaleCancelDialogProps) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleDismiss = () => {
    setMotivo("");
    setError(null);
    onDismiss();
  };

  const handleConfirm = async () => {
    const trimmed = motivo.trim();
    if (trimmed.length < 3) {
      setError("El motivo debe tener al menos 3 caracteres justificando la anulación.");
      return;
    }
    setError(null);
    try {
      await onConfirm(trimmed);
      handleDismiss();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al anular la venta.";
      setError(msg);
    }
  };

  if (!sale) return null;

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleDismiss} style={styles.dialog}>
        <Dialog.Title style={styles.title}>
          <View style={styles.titleRow}>
            <AlertTriangle size={22} color={colors.danger} />
            <Text variant="titleLarge" style={styles.titleText}>
              Anular Venta #{sale.id}
            </Text>
          </View>
        </Dialog.Title>

        <Dialog.Content style={styles.content}>
          <View style={styles.infoBox}>
            <Text variant="bodyMedium">
              Monto total: <Text style={styles.bold}>{formatearPrecio(sale.total)}</Text>
            </Text>
            <Text variant="bodySmall" style={styles.muted}>
              Fecha: {formatearFechaHora(sale.fecha)} · Pago: {sale.metodo_pago}
            </Text>
          </View>

          <Text variant="bodyMedium" style={styles.warningText}>
            Al anular esta venta, el stock de todos sus productos se reincorporará automáticamente al
            inventario de la sucursal y la operación quedará registrada en el Kardex.
          </Text>

          <TextInput
            mode="outlined"
            label="Motivo obligatorio de anulación"
            placeholder="Ej: Cobro duplicado, error de cliente o devolución"
            value={motivo}
            onChangeText={(text) => {
              setMotivo(text);
              if (error) setError(null);
            }}
            multiline
            numberOfLines={2}
            style={styles.input}
          />

          <HelperText type="error" visible={Boolean(error)}>
            {error ?? ""}
          </HelperText>
        </Dialog.Content>

        <Dialog.Actions>
          <Button onPress={handleDismiss} disabled={loading}>
            Cancelar
          </Button>
          <Button
            mode="contained"
            buttonColor={colors.danger}
            onPress={handleConfirm}
            loading={loading}
            disabled={loading}
          >
            Confirmar anulación
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
    color: colors.danger,
  },
  content: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  infoBox: {
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.sm,
    borderRadius: 8,
    gap: 2,
  },
  bold: {
    fontWeight: "700",
    color: colors.primary,
  },
  muted: {
    color: colors.textSecondary,
  },
  warningText: {
    color: colors.textPrimary,
    lineHeight: 20,
  },
  input: {
    marginTop: spacing.xs,
  },
});
