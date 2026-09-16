import { useState } from "react";
import { StyleSheet, View, ScrollView } from "react-native";
import {
  Button,
  Text,
  Surface,
  ActivityIndicator,
  SegmentedButtons,
  IconButton,
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
  ArrowLeft,
} from "lucide-react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { colors, spacing } from "../../../shared/theme";
import { formatearPrecio } from "../../../shared/lib/utils";
import { buscarProductoPorId } from "../api/productosApi";
import { useProductoDetalle } from "../hooks/useProductoDetalle";
import { useActualizarProducto } from "../hooks/useActualizarProducto";
import { ProductEditModal } from "../components/ProductEditModal";
import type { Producto } from "../../../shared/types/domain";

interface ProductoDetalleScreenProps {
  id: number;
}

export function ProductoDetalleScreen({ id }: ProductoDetalleScreenProps) {
  const [tab, setTab] = useState<"stock" | "historial">("stock");
  const [editModalVisible, setEditModalVisible] = useState(false);

  const productQuery = useQuery({
    queryKey: ["producto", id],
    queryFn: () => buscarProductoPorId(id),
    enabled: Number.isInteger(id) && id > 0,
  });

  const { stock, historial, refetch } = useProductoDetalle(id);
  const updateMutation = useActualizarProducto();

  const producto = productQuery.data;
  const totalStock = (stock.data ?? []).reduce((sum, item) => sum + item.cantidad, 0);

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return `${d.toLocaleDateString("es-BO")} ${d.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      return isoString;
    }
  };

  if (productQuery.isLoading) {
    return (
      <ScreenContainer style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.mutedText}>Cargando información de la prenda...</Text>
      </ScreenContainer>
    );
  }

  if (productQuery.isError || !producto) {
    return (
      <ScreenContainer style={styles.center}>
        <Text style={styles.errorText}>No se pudo encontrar el producto solicitado.</Text>
        <Button mode="contained" onPress={() => router.back()} style={styles.backButton}>
          Volver al catálogo
        </Button>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll style={styles.screen}>
      {/* Top Header Row with Back navigation */}
      <View style={styles.topNavRow}>
        <IconButton
          icon={() => <ArrowLeft size={22} color={colors.textPrimary} />}
          onPress={() => router.back()}
          style={styles.navBackButton}
        />
        <View style={styles.navTitles}>
          <Text variant="titleMedium" style={styles.navTitle}>
            Detalle de prenda
          </Text>
          <Text variant="bodySmall" style={styles.navSubtitle}>
            Catálogo e inventario en red
          </Text>
        </View>
      </View>

      {/* Main Hero Card */}
      <Surface style={styles.heroCard} elevation={1}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroInfo}>
            <Text variant="headlineSmall" style={styles.productName}>
              {producto.nombre}
            </Text>
            <View style={styles.badgesRow}>
              <View style={styles.metaBadge}>
                <Barcode size={14} color={colors.textSecondary} />
                <Text variant="labelSmall" style={styles.metaBadgeText}>
                  {producto.codigo}
                </Text>
              </View>
              <View style={styles.metaBadge}>
                <Tag size={14} color={colors.textSecondary} />
                <Text variant="labelSmall" style={styles.metaBadgeText}>
                  {producto.categoria}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.priceContainer}>
            <Text variant="headlineMedium" style={styles.priceValue}>
              {formatearPrecio(producto.precio)}
            </Text>
            <Button
              mode="contained-tonal"
              icon={() => <Pencil size={15} color={colors.primary} />}
              onPress={() => setEditModalVisible(true)}
              style={styles.editButton}
            >
              Editar datos
            </Button>
          </View>
        </View>
      </Surface>

      {/* Tab Switcher */}
      <SegmentedButtons
        value={tab}
        onValueChange={(val) => setTab(val as "stock" | "historial")}
        buttons={[
          {
            value: "stock",
            label: "Stock en sucursales",
            showSelectedCheck: false,
            icon: () => (
              <Package size={16} color={tab === "stock" ? colors.primary : colors.textSecondary} />
            ),
          },
          {
            value: "historial",
            label: "Historial de movimientos",
            showSelectedCheck: false,
            icon: () => (
              <Clock size={16} color={tab === "historial" ? colors.primary : colors.textSecondary} />
            ),
          },
        ]}
        density="small"
        style={styles.segmentedButtons}
      />

      {/* Content based on selected Tab */}
      {tab === "stock" ? (
        <View style={styles.tabContent}>
          {/* Global Network KPI Banner */}
          <Surface style={styles.totalKpiCard} elevation={0}>
            <View style={styles.totalKpiHeader}>
              <Package size={20} color={colors.primary} />
              <Text variant="labelMedium" style={styles.totalKpiLabel}>
                Stock consolidado en red Lidemoda
              </Text>
            </View>
            <Text variant="displaySmall" style={styles.totalKpiValue}>
              {totalStock} <Text variant="titleMedium" style={{ color: colors.textSecondary }}>unidades</Text>
            </Text>
          </Surface>

          {/* Branch breakdown */}
          <View style={styles.sectionHeaderRow}>
            <Store size={18} color={colors.textPrimary} />
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Disponibilidad por sucursal
            </Text>
          </View>

          {stock.isLoading ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text variant="bodySmall" style={styles.mutedText}>
                Consultando inventario en tiendas...
              </Text>
            </View>
          ) : stock.isError ? (
            <Text style={styles.errorText}>No se pudo cargar el inventario por sucursal.</Text>
          ) : (
            <View style={styles.branchList}>
              {(stock.data ?? []).map((item) => {
                const isZero = item.cantidad === 0;
                const isLow = item.cantidad > 0 && item.cantidad <= 5;
                const cleanName = item.sucursalNombre.replace(/^Lidemoda\s+(?:La\s+Paz\s*[-–]?\s*)?(?:Sucursal\s*)?/i, "");

                return (
                  <Surface key={item.sucursalId} style={styles.branchCard} elevation={0}>
                    <View style={styles.branchCardLeft}>
                      <View style={[styles.storeIconCircle, isZero && styles.storeIconCircleZero]}>
                        <Store size={16} color={isZero ? "#94A3B8" : colors.primary} />
                      </View>
                      <Text variant="bodyMedium" style={styles.branchNameText}>
                        {cleanName}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.stockBadge,
                        isZero
                          ? styles.stockBadgeZero
                          : isLow
                          ? styles.stockBadgeLow
                          : styles.stockBadgeGood,
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
                          styles.stockBadgeText,
                          isZero
                            ? styles.stockTextZero
                            : isLow
                            ? styles.stockTextLow
                            : styles.stockTextGood,
                        ]}
                      >
                        {item.cantidad} uds
                      </Text>
                    </View>
                  </Surface>
                );
              })}
            </View>
          )}

          {/* Transfer Shortcut Button */}
          <Button
            mode="outlined"
            icon={() => <ArrowRightLeft size={18} color={colors.primary} />}
            onPress={() => router.push("/movimientos")}
            style={styles.transferButton}
            contentStyle={{ height: 48 }}
          >
            Transferir stock entre sucursales
          </Button>
        </View>
      ) : (
        <View style={styles.tabContent}>
          <View style={styles.sectionHeaderRow}>
            <Clock size={18} color={colors.textPrimary} />
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Historial de movimientos y auditoría
            </Text>
          </View>

          {historial.isLoading ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text variant="bodySmall" style={styles.mutedText}>
                Consultando registros históricos...
              </Text>
            </View>
          ) : historial.isError ? (
            <Text style={styles.errorText}>No se pudo cargar el historial de movimientos.</Text>
          ) : (historial.data ?? []).length === 0 ? (
            <Surface style={styles.emptyHistorialCard} elevation={0}>
              <Clock size={36} color={colors.textMuted} />
              <Text variant="bodyMedium" style={styles.emptyHistorialText}>
                No hay movimientos registrados para esta prenda todavía.
              </Text>
            </Surface>
          ) : (
            <View style={styles.historialList}>
              {(historial.data ?? []).map((mov) => {
                const isEntrada = mov.tipo === "entrada";
                const isTransfer = mov.tipo === "transferencia";

                return (
                  <Surface key={mov.id} style={styles.movementCard} elevation={0}>
                    <View style={styles.movementTopRow}>
                      <View
                        style={[
                          styles.movementBadge,
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
                            styles.movementBadgeText,
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

                      <Text
                        variant="titleMedium"
                        style={[
                          styles.movementQtyText,
                          isEntrada ? { color: "#15803D" } : isTransfer ? { color: "#1D4ED8" } : { color: "#B45309" },
                        ]}
                      >
                        {isEntrada ? `+${mov.cantidad}` : isTransfer ? `${mov.cantidad}` : `-${mov.cantidad}`} uds
                      </Text>
                    </View>

                    <Text variant="bodyMedium" style={styles.movementBranchText}>
                      {isTransfer && mov.sucursalDestinoNombre
                        ? `${mov.sucursalOrigenNombre} → ${mov.sucursalDestinoNombre}`
                        : mov.sucursalOrigenNombre}
                    </Text>

                    {mov.observacion ? (
                      <Text variant="bodySmall" style={styles.movementObsText}>
                        &ldquo;{mov.observacion}&rdquo;
                      </Text>
                    ) : null}

                    <Text variant="labelSmall" style={styles.movementDateText}>
                      {formatDate(mov.fecha)}
                    </Text>
                  </Surface>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* Edit Product Modal */}
      <ProductEditModal
        visible={editModalVisible}
        producto={producto}
        loading={updateMutation.isPending}
        onDismiss={() => setEditModalVisible(false)}
        onSubmit={(editId, params) => {
          updateMutation.mutate(
            { id: editId, params },
            {
              onSuccess: () => {
                setEditModalVisible(false);
                void productQuery.refetch();
                void refetch();
              },
            },
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  mutedText: {
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.danger,
    textAlign: "center",
  },
  backButton: {
    borderRadius: 10,
  },
  topNavRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  navBackButton: {
    margin: 0,
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
  },
  navTitles: {
    flex: 1,
  },
  navTitle: {
    fontWeight: "800",
    color: colors.textPrimary,
  },
  navSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  heroInfo: {
    flex: 1,
    gap: 6,
  },
  productName: {
    fontWeight: "800",
    color: colors.textPrimary,
    lineHeight: 28,
  },
  badgesRow: {
    flexDirection: "row",
    gap: spacing.xs,
    flexWrap: "wrap",
    marginTop: 2,
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metaBadgeText: {
    color: colors.textSecondary,
    fontWeight: "600",
    fontSize: 11,
  },
  priceContainer: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  priceValue: {
    fontWeight: "800",
    color: colors.primary,
  },
  editButton: {
    borderRadius: 8,
  },
  segmentedButtons: {
    marginBottom: spacing.md,
  },
  tabContent: {
    gap: spacing.md,
  },
  totalKpiCard: {
    backgroundColor: "#F8FAFC",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  totalKpiHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  totalKpiLabel: {
    color: colors.textSecondary,
    textTransform: "uppercase",
    fontSize: 11,
    fontWeight: "600",
  },
  totalKpiValue: {
    fontWeight: "800",
    color: colors.primary,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  inlineLoading: {
    paddingVertical: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  branchList: {
    gap: spacing.xs + 2,
  },
  branchCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  branchCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  storeIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  storeIconCircleZero: {
    backgroundColor: "#F1F5F9",
  },
  branchNameText: {
    color: colors.textPrimary,
    fontWeight: "600",
  },
  stockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stockBadgeGood: {
    backgroundColor: "#DCFCE7",
  },
  stockBadgeLow: {
    backgroundColor: "#FEF3C7",
  },
  stockBadgeZero: {
    backgroundColor: "#FEE2E2",
  },
  stockBadgeText: {
    fontWeight: "700",
  },
  stockTextGood: {
    color: "#15803D",
  },
  stockTextLow: {
    color: "#B45309",
  },
  stockTextZero: {
    color: "#B91C1C",
  },
  transferButton: {
    borderRadius: 12,
    borderColor: colors.primary,
    marginTop: spacing.xs,
  },
  emptyHistorialCard: {
    backgroundColor: "#F8FAFC",
    padding: spacing.xxl,
    borderRadius: 14,
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emptyHistorialText: {
    color: colors.textMuted,
    textAlign: "center",
  },
  historialList: {
    gap: spacing.sm,
  },
  movementCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 4,
  },
  movementTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  movementBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
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
  movementBadgeText: {
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
  movementQtyText: {
    fontWeight: "800",
  },
  movementBranchText: {
    color: colors.textPrimary,
    fontWeight: "600",
    marginTop: 2,
  },
  movementObsText: {
    color: colors.textSecondary,
    fontStyle: "italic",
    fontSize: 13,
  },
  movementDateText: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
});
