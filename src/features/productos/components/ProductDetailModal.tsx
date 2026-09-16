import { useState } from "react";
import { StyleSheet, View, ScrollView } from "react-native";
import {
  Portal,
  Modal,
  Button,
  Text,
  Surface,
  ActivityIndicator,
  SegmentedButtons,
} from "react-native-paper";
import {
  Package,
  Barcode,
  Tag,
  Pencil,
  Store,
  ArrowRightLeft,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
} from "lucide-react-native";
import { colors, radius, shadows, spacing } from "../../../shared/theme";
import type { Producto } from "../../../shared/types/domain";
import { formatearPrecio } from "../../../shared/lib/utils";
import { useProductoDetalle } from "../hooks/useProductoDetalle";

interface ProductDetailModalProps {
  visible: boolean;
  producto: Producto | null;
  onDismiss: () => void;
  onEdit: (producto: Producto) => void;
  onTransfer?: (producto: Producto) => void;
}

export function ProductDetailModal({
  visible,
  producto,
  onDismiss,
  onEdit,
  onTransfer,
}: ProductDetailModalProps) {
  const [tab, setTab] = useState<"stock" | "historial">("stock");
  const { stock, historial } = useProductoDetalle(visible && producto ? producto.id : null);

  if (!producto) return null;

  const totalStock = (stock.data ?? []).reduce((sum, item) => sum + item.cantidad, 0);

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return `${d.toLocaleDateString("es-BO")} ${d.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      return isoString;
    }
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        {/* Header Section */}
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Text variant="titleLarge" style={styles.title} numberOfLines={2}>
              {producto.nombre}
            </Text>
            <View style={styles.badgesRow}>
              <View style={styles.badge}>
                <Barcode size={14} color={colors.textSecondary} />
                <Text variant="bodySmall" style={styles.badgeText}>
                  {producto.codigo}
                </Text>
              </View>
              <View style={styles.badge}>
                <Tag size={14} color={colors.textSecondary} />
                <Text variant="bodySmall" style={styles.badgeText}>
                  {producto.categoria}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.headerPriceCol}>
            <Text variant="headlineSmall" style={styles.priceText}>
              {formatearPrecio(producto.precio)}
            </Text>
            <Button
              compact
              mode="contained-tonal"
              icon={() => <Pencil size={14} color={colors.primary} />}
              onPress={() => onEdit(producto)}
              style={styles.editButton}
            >
              Editar
            </Button>
          </View>
        </View>

        {/* Tab switcher */}
        <SegmentedButtons
          value={tab}
          onValueChange={(val) => setTab(val as "stock" | "historial")}
          buttons={[
            {
              value: "stock",
              label: "Stock en sucursales",
              icon: () => <Package size={16} color={tab === "stock" ? colors.primary : colors.textSecondary} />,
            },
            {
              value: "historial",
              label: "Historial",
              icon: () => <Clock size={16} color={tab === "historial" ? colors.primary : colors.textSecondary} />,
            },
          ]}
          density="small"
          style={styles.segmented}
        />

        {/* Content Section */}
        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
          {tab === "stock" ? (
            <View style={styles.tabContent}>
              {/* Total network banner */}
              <Surface style={styles.totalCard} elevation={0}>
                <Text variant="labelMedium" style={styles.totalLabel}>
                  Total en red Lidemoda
                </Text>
                <Text variant="headlineMedium" style={styles.totalValue}>
                  {totalStock} <Text variant="titleMedium">unidades</Text>
                </Text>
              </Surface>

              <Text variant="labelLarge" style={styles.sectionHeading}>
                Disponibilidad por tienda
              </Text>

              {stock.isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text variant="bodySmall" style={styles.loadingText}>
                    Consultando inventarios...
                  </Text>
                </View>
              ) : stock.isError ? (
                <Text style={styles.errorText}>No se pudo cargar el stock por sucursal.</Text>
              ) : (
                <View style={styles.branchList}>
                  {(stock.data ?? []).map((item) => {
                    const isZero = item.cantidad === 0;
                    const isLow = item.cantidad > 0 && item.cantidad <= 5;

                    return (
                      <View key={item.sucursalId} style={styles.branchRow}>
                        <View style={styles.branchNameCol}>
                          <Store size={16} color={colors.textSecondary} />
                          <Text variant="bodyMedium" style={styles.branchName}>
                            {item.sucursalNombre.replace(/^Lidemoda\s+(?:La\s+Paz\s*[-–]?\s*)?(?:Sucursal\s*)?/i, "")}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.stockPill,
                            isZero
                              ? styles.stockPillEmpty
                              : isLow
                              ? styles.stockPillLow
                              : styles.stockPillGood,
                          ]}
                        >
                          {isZero ? (
                            <XCircle size={14} color="#EF4444" />
                          ) : isLow ? (
                            <AlertTriangle size={14} color="#F59E0B" />
                          ) : (
                            <CheckCircle2 size={14} color="#10B981" />
                          )}
                          <Text
                            variant="labelSmall"
                            style={[
                              styles.stockPillText,
                              isZero
                                ? styles.stockTextEmpty
                                : isLow
                                ? styles.stockTextLow
                                : styles.stockTextGood,
                            ]}
                          >
                            {item.cantidad} uds
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {onTransfer ? (
                <Button
                  mode="outlined"
                  icon={() => <ArrowRightLeft size={16} color={colors.primary} />}
                  onPress={() => onTransfer(producto)}
                  style={styles.transferButton}
                >
                  Transferir esta prenda a otra sucursal
                </Button>
              ) : null}
            </View>
          ) : (
            <View style={styles.tabContent}>
              <Text variant="labelLarge" style={styles.sectionHeading}>
                Movimientos recientes
              </Text>

              {historial.isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text variant="bodySmall" style={styles.loadingText}>
                    Cargando trazabilidad...
                  </Text>
                </View>
              ) : historial.isError ? (
                <Text style={styles.errorText}>No se pudo cargar el historial.</Text>
              ) : (historial.data ?? []).length === 0 ? (
                <View style={styles.emptyHistorial}>
                  <Clock size={32} color={colors.textMuted} />
                  <Text variant="bodyMedium" style={styles.emptyText}>
                    No hay movimientos registrados para esta prenda todavía.
                  </Text>
                </View>
              ) : (
                <View style={styles.historialList}>
                  {(historial.data ?? []).map((mov) => {
                    const isEntrada = mov.tipo === "entrada";
                    const isTransfer = mov.tipo === "transferencia";

                    return (
                      <View key={mov.id} style={styles.movCard}>
                        <View style={styles.movHeaderRow}>
                          <View
                            style={[
                              styles.movTypeBadge,
                              isEntrada
                                ? styles.movBadgeEntrada
                                : isTransfer
                                ? styles.movBadgeTransfer
                                : styles.movBadgeSalida,
                            ]}
                          >
                            {isEntrada ? (
                              <ArrowDownLeft size={14} color="#15803D" />
                            ) : isTransfer ? (
                              <ArrowRightLeft size={14} color="#1D4ED8" />
                            ) : (
                              <ArrowUpRight size={14} color="#B45309" />
                            )}
                            <Text
                              variant="labelSmall"
                              style={[
                                styles.movTypeText,
                                isEntrada
                                  ? styles.movTextEntrada
                                  : isTransfer
                                  ? styles.movTextTransfer
                                  : styles.movTextSalida,
                              ]}
                            >
                              {mov.tipo.toUpperCase()}
                            </Text>
                          </View>

                          <Text variant="labelMedium" style={styles.movQty}>
                            {isEntrada ? `+${mov.cantidad}` : isTransfer ? `${mov.cantidad}` : `-${mov.cantidad}`} uds
                          </Text>
                        </View>

                        <Text variant="bodySmall" style={styles.movBranch}>
                          {isTransfer && mov.sucursalDestinoNombre
                            ? `${mov.sucursalOrigenNombre} → ${mov.sucursalDestinoNombre}`
                            : mov.sucursalOrigenNombre}
                        </Text>

                        {mov.observacion ? (
                          <Text variant="bodySmall" style={styles.movObs}>
                            &ldquo;{mov.observacion}&rdquo;
                          </Text>
                        ) : null}

                        <Text variant="labelSmall" style={styles.movDate}>
                          {formatDate(mov.fecha)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Button mode="contained" onPress={onDismiss} style={styles.closeButton}>
            Cerrar
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 20,
    maxHeight: "88%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerInfo: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontWeight: "800",
    color: colors.textPrimary,
  },
  badgesRow: {
    flexDirection: "row",
    gap: spacing.xs,
    flexWrap: "wrap",
    marginTop: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  headerPriceCol: {
    alignItems: "flex-end",
    gap: 4,
  },
  priceText: {
    fontWeight: "800",
    color: colors.primary,
  },
  editButton: {
    borderRadius: 8,
  },
  segmented: {
    marginVertical: spacing.sm,
  },
  scrollArea: {
    maxHeight: 380,
  },
  scrollContent: {
    paddingVertical: spacing.xs,
  },
  tabContent: {
    gap: spacing.sm,
  },
  totalCard: {
    backgroundColor: "#F8FAFC",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  totalLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    textTransform: "uppercase",
  },
  totalValue: {
    fontWeight: "800",
    color: colors.primary,
    marginTop: 2,
  },
  sectionHeading: {
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  branchList: {
    gap: 6,
  },
  branchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: 8,
  },
  branchNameCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  branchName: {
    color: colors.textPrimary,
    fontWeight: "500",
  },
  stockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  stockPillGood: {
    backgroundColor: "#DCFCE7",
  },
  stockPillLow: {
    backgroundColor: "#FEF3C7",
  },
  stockPillEmpty: {
    backgroundColor: "#FEE2E2",
  },
  stockPillText: {
    fontWeight: "600",
  },
  stockTextGood: {
    color: "#15803D",
  },
  stockTextLow: {
    color: "#B45309",
  },
  stockTextEmpty: {
    color: "#B91C1C",
  },
  transferButton: {
    marginTop: spacing.sm,
    borderRadius: 10,
    borderColor: colors.primary,
  },
  loadingContainer: {
    paddingVertical: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textMuted,
  },
  errorText: {
    color: colors.danger,
    paddingVertical: spacing.md,
  },
  emptyHistorial: {
    paddingVertical: spacing.xxl,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: "center",
  },
  historialList: {
    gap: spacing.xs,
  },
  movCard: {
    backgroundColor: "#F8FAFC",
    padding: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 2,
  },
  movHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  movTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  movBadgeEntrada: {
    backgroundColor: "#DCFCE7",
  },
  movBadgeSalida: {
    backgroundColor: "#FEF3C7",
  },
  movBadgeTransfer: {
    backgroundColor: "#DBEAFE",
  },
  movTypeText: {
    fontWeight: "700",
    fontSize: 11,
  },
  movTextEntrada: {
    color: "#15803D",
  },
  movTextSalida: {
    color: "#B45309",
  },
  movTextTransfer: {
    color: "#1D4ED8",
  },
  movQty: {
    fontWeight: "800",
    color: colors.textPrimary,
  },
  movBranch: {
    color: colors.textSecondary,
    fontWeight: "500",
    marginTop: 2,
  },
  movObs: {
    color: colors.textMuted,
    fontStyle: "italic",
  },
  movDate: {
    color: colors.textMuted,
    marginTop: 2,
  },
  footer: {
    marginTop: spacing.md,
  },
  closeButton: {
    borderRadius: 10,
  },
});
