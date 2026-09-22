import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Card, Text, TextInput } from "react-native-paper";
import { CheckCircle2, PackageCheck, Truck } from "lucide-react-native";
import { useConfirm } from "../../../shared/components/ConfirmDialog";
import { StatusBadge } from "../../../shared/components/StatusBadge";
import { colors, spacing } from "../../../shared/theme";
import { extraerMensajeError, formatearFechaCorta } from "../../../shared/lib/utils";
import { useConfirmarRecepcionDespacho, useOrdenesDespacho } from "../hooks/useDespachos";
import type { OrdenDespacho } from "../../../shared/types/domain";

interface RecepcionDespachosListProps {
  sucursalDestinoId: number | null;
  onSuccess?: () => void;
}

export function RecepcionDespachosList({ sucursalDestinoId, onSuccess }: RecepcionDespachosListProps) {
  const { data: ordenes, isLoading, isError, refetch } = useOrdenesDespacho({
    sucursalDestinoId: sucursalDestinoId ?? undefined,
    estado: "en_transito",
  });
  const confirmarMutation = useConfirmarRecepcionDespacho();
  const { requestConfirm, dialog } = useConfirm();
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const getCantidadInput = (orden: OrdenDespacho) => {
    return quantities[orden.id] ?? String(orden.cantidad_despachada);
  };

  const setCantidadInput = (ordenId: number, val: string) => {
    setQuantities((prev) => ({ ...prev, [ordenId]: val }));
  };

  const handleConfirmarRecepcion = async (orden: OrdenDespacho) => {
    setActionError(null);
    const qtyNum = Number(getCantidadInput(orden));
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
      setActionError("La cantidad recibida debe ser un entero mayor a 0.");
      return;
    }

    const ok = await requestConfirm({
      title: "Confirmar recepción física",
      message: `¿Confirmás la recepción de ${qtyNum} unids de "${orden.producto?.nombre}" en tu sucursal?\nGuía: ${orden.numero_guia}.\nEl stock se sumará de inmediato a tu inventario.`,
      confirmLabel: "Confirmar ingreso",
      danger: false,
    });

    if (!ok) return;

    confirmarMutation.mutate(
      {
        orden_id: orden.id,
        cantidad_recibida: qtyNum,
      },
      {
        onSuccess: () => {
          onSuccess?.();
        },
        onError: (err) => {
          setActionError(extraerMensajeError(err, "No se pudo confirmar la recepción."));
        },
      },
    );
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>Buscando despachos en tránsito...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>No se pudieron cargar los despachos en tránsito.</Text>
        <Button onPress={() => refetch()}>Reintentar</Button>
      </View>
    );
  }

  const items = ordenes ?? [];

  return (
    <View style={styles.container}>
      {dialog}

      {actionError ? <Text style={styles.errorBanner}>{actionError}</Text> : null}

      {items.length === 0 ? (
        <Card mode="outlined" style={styles.emptyCard}>
          <Card.Content style={styles.emptyContent}>
            <PackageCheck size={36} color={colors.textSecondary} />
            <Text variant="titleMedium" style={styles.emptyTitle}>
              Sin despachos pendientes
            </Text>
            <Text style={styles.emptySubtitle}>
              No hay mercadería en tránsito hacia esta sucursal en este momento.
            </Text>
          </Card.Content>
        </Card>
      ) : (
        items.map((orden) => (
          <Card key={orden.id} mode="outlined" style={styles.card}>
            <Card.Content style={styles.cardContent}>
              <View style={styles.headerRow}>
                <View style={styles.badgeRow}>
                  <Truck size={18} color={colors.primary} />
                  <Text variant="labelMedium" style={styles.guiaNumber}>
                    {orden.numero_guia}
                  </Text>
                </View>
                <StatusBadge status="warning" label="En Tránsito" />
              </View>

              <Text variant="titleMedium" style={styles.productName}>
                {orden.producto?.nombre}
              </Text>
              <Text variant="bodySmall" style={styles.productSku}>
                Código: <Text style={styles.bold}>{orden.producto?.codigo}</Text> · Origen:{" "}
                <Text style={styles.bold}>{orden.sucursal_origen?.nombre}</Text>
              </Text>

              <View style={styles.metaRow}>
                <Text variant="bodyMedium">
                  Cantidad despachada:{" "}
                  <Text style={styles.quantityHighlight}>{orden.cantidad_despachada} unids</Text>
                </Text>
                <Text variant="bodySmall" style={styles.muted}>
                  {formatearFechaCorta(orden.fecha_despacho)}
                </Text>
              </View>

              {orden.observacion ? (
                <Text variant="bodySmall" style={styles.observacion}>
                  Nota: {orden.observacion}
                </Text>
              ) : null}

              <View style={styles.receptionRow}>
                <View style={styles.inputCol}>
                  <Text variant="labelSmall" style={styles.inputLabel}>
                    Cantidad que llegó físicamente:
                  </Text>
                  <TextInput
                    mode="outlined"
                    dense
                    keyboardType="number-pad"
                    value={getCantidadInput(orden)}
                    onChangeText={(val) => setCantidadInput(orden.id, val)}
                    style={styles.qtyInput}
                  />
                </View>
                <Button
                  mode="contained"
                  icon={() => <CheckCircle2 size={16} color={colors.white} />}
                  onPress={() => handleConfirmarRecepcion(orden)}
                  loading={confirmarMutation.isPending}
                  disabled={confirmarMutation.isPending}
                  style={styles.confirmBtn}
                >
                  Confirmar
                </Button>
              </View>
            </Card.Content>
          </Card>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  center: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  muted: {
    color: colors.textSecondary,
  },
  error: {
    color: colors.danger,
  },
  errorBanner: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    padding: spacing.sm,
    borderRadius: 8,
  },
  emptyCard: {
    backgroundColor: colors.surface,
  },
  emptyContent: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  emptySubtitle: {
    color: colors.textSecondary,
    textAlign: "center",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  cardContent: {
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  guiaNumber: {
    fontWeight: "700",
    color: colors.primary,
  },
  productName: {
    fontWeight: "600",
    color: colors.textPrimary,
  },
  productSku: {
    color: colors.textSecondary,
  },
  bold: {
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  quantityHighlight: {
    fontWeight: "700",
    color: colors.primary,
  },
  observacion: {
    color: colors.textSecondary,
    fontStyle: "italic",
    marginTop: spacing.xs,
  },
  receptionRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inputCol: {
    flex: 1,
  },
  inputLabel: {
    color: colors.textSecondary,
    marginBottom: 2,
  },
  qtyInput: {
    height: 40,
    backgroundColor: colors.white,
  },
  confirmBtn: {
    height: 40,
    justifyContent: "center",
  },
});
