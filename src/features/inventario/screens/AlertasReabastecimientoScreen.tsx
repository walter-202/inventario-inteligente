import { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  SegmentedButtons,
  Surface,
  Text,
} from "react-native-paper";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Package,
  Sliders,
  Sparkles,
  Truck,
  Zap,
} from "lucide-react-native";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { AppHeader } from "../../../shared/components/AppHeader";
import { BranchSelect } from "../../../shared/components/BranchSelect";
import { useConfirm } from "../../../shared/components/ConfirmDialog";
import { colors, spacing } from "../../../shared/theme";
import { extraerMensajeError } from "../../../shared/lib/utils";
import { useSucursales } from "../../../shared/hooks/useSucursales";
import { useActiveBranch } from "../../../shared/hooks/useActiveBranch";
import {
  useAlertasStock,
  useConfigurarStockMinimo,
  useSugerenciasReabastecimiento,
} from "../hooks/useReabastecimiento";
import { useEmitirDespacho } from "../hooks/useDespachos";
import { ConfigurarStockMinimoModal } from "../components/ConfigurarStockMinimoModal";
import type { AlertaStockItem, SugerenciaReabastecimiento } from "../../../shared/types/domain";

type ViewTab = "alertas" | "sugerencias";

export function AlertasReabastecimientoScreen() {
  const { activeBranchId, canChangeBranch } = useActiveBranch();
  const branches = useSucursales();
  const [tab, setTab] = useState<ViewTab>("alertas");
  const [selectedBranchId, setSelectedBranchId] = useState<number | undefined>(
    activeBranchId ?? undefined,
  );

  const [configuringItem, setConfiguringItem] = useState<AlertaStockItem | null>(null);

  const alertsQuery = useAlertasStock(selectedBranchId);
  const suggestionsQuery = useSugerenciasReabastecimiento(selectedBranchId);
  const configMutation = useConfigurarStockMinimo();
  const emitirDespachoMutation = useEmitirDespacho();
  const { requestConfirm, dialog } = useConfirm();

  const alerts = alertsQuery.data ?? [];
  const suggestions = suggestionsQuery.data ?? [];

  const counts = useMemo(() => {
    let criticos = 0;
    let bajos = 0;
    for (const a of alerts) {
      if (a.nivel === "critico") criticos++;
      else bajos++;
    }
    return { criticos, bajos, total: alerts.length };
  }, [alerts]);

  const handleSaveThreshold = async (newThreshold: number) => {
    if (!configuringItem) return;
    await configMutation.mutateAsync({
      productoId: configuringItem.producto_id,
      stockMinimo: newThreshold,
    });
    Alert.alert("Umbral actualizado", `El stock mínimo para "${configuringItem.producto_nombre}" ahora es de ${newThreshold} unidades.`);
  };

  const handleApplySuggestion = async (sug: SugerenciaReabastecimiento) => {
    const ok = await requestConfirm({
      title: "Emitir Despacho de Reabastecimiento (RF-26)",
      message: `Se transferirán ${sug.cantidad_sugerida} unidades de "${sug.producto_nombre}" desde ${sug.sucursal_origen_nombre} hacia ${sug.sucursal_destino_nombre}.\n\nEsta orden quedará en tránsito (RF-06) con número de guía oficial y descontará las existencias en el origen.`,
      confirmLabel: "Emitir despacho ahora",
      danger: false,
    });
    if (!ok) return;

    emitirDespachoMutation.mutate(
      {
        producto_id: sug.producto_id,
        sucursal_origen_id: sug.sucursal_origen_id,
        sucursal_destino_id: sug.sucursal_destino_id,
        cantidad: sug.cantidad_sugerida,
        observacion: `Reabastecimiento IA: ${sug.justificacion.slice(0, 100)}`,
      },
      {
        onSuccess: (data) => {
          Alert.alert(
            "Despacho emitido con éxito",
            `Guía: ${data?.numero_guia ?? "Registrada"}\n${sug.cantidad_sugerida} unidades en camino a ${sug.sucursal_destino_nombre}.`,
          );
          void alertsQuery.refetch();
          void suggestionsQuery.refetch();
        },
        onError: (err) => {
          Alert.alert("Error", extraerMensajeError(err, "No se pudo emitir el despacho."));
        },
      },
    );
  };

  return (
    <ScreenContainer>
      {dialog}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppHeader
          title="Stock y Reabastecimiento"
          subtitle="Alertas de quiebre y reposición inteligente (RF-08 / RF-26)"
        />

        {/* Tab Selector */}
        <SegmentedButtons
          value={tab}
          onValueChange={(val) => setTab(val as ViewTab)}
          buttons={[
            {
              value: "alertas",
              label: `Alertas (${counts.total})`,
              icon: () => <AlertTriangle size={16} color={tab === "alertas" ? colors.primary : colors.textSecondary} />,
              showSelectedCheck: false,
            },
            {
              value: "sugerencias",
              label: `Sugerencias IA (${suggestions.length})`,
              icon: () => <Sparkles size={16} color={tab === "sugerencias" ? colors.primary : colors.textSecondary} />,
              showSelectedCheck: false,
            },
          ]}
        />

        {/* Branch Filter */}
        <BranchSelect
          label="Filtrar por sucursal"
          branches={branches.data ?? []}
          value={selectedBranchId ?? null}
          onChange={(id) => setSelectedBranchId(id ?? undefined)}
          disabled={!canChangeBranch && activeBranchId !== null}
        />

        {tab === "alertas" ? (
          /* TAB 1: Alertas de Stock Mínimo y Crítico (RF-08) */
          <>
            {/* Summary Metrics */}
            <View style={styles.kpiRow}>
              <Surface style={[styles.kpiCard, styles.kpiCritico]} elevation={1}>
                <AlertOctagon size={20} color="#DC2626" />
                <Text variant="headlineSmall" style={styles.kpiCriticoVal}>
                  {counts.criticos}
                </Text>
                <Text variant="labelSmall" style={styles.kpiLabel}>
                  Agotados (0 unids)
                </Text>
              </Surface>

              <Surface style={[styles.kpiCard, styles.kpiBajo]} elevation={1}>
                <AlertTriangle size={20} color="#D97706" />
                <Text variant="headlineSmall" style={styles.kpiBajoVal}>
                  {counts.bajos}
                </Text>
                <Text variant="labelSmall" style={styles.kpiLabel}>
                  Bajo umbral mínimo
                </Text>
              </Surface>
            </View>

            {alertsQuery.isLoading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.muted}>Calculando niveles de inventario...</Text>
              </View>
            ) : alertsQuery.isError ? (
              <View style={styles.center}>
                <Text style={styles.errorText}>No se pudieron obtener las alertas.</Text>
                <Button onPress={() => alertsQuery.refetch()}>Reintentar</Button>
              </View>
            ) : alerts.length === 0 ? (
              <Surface style={styles.emptyCard} elevation={0}>
                <CheckCircle2 size={44} color={colors.success} />
                <Text variant="titleMedium" style={styles.emptyTitle}>
                  ¡Inventario en niveles óptimos!
                </Text>
                <Text variant="bodySmall" style={styles.emptySubtitle}>
                  No se detectaron prendas por debajo del stock mínimo de seguridad en la sucursal
                  seleccionada.
                </Text>
              </Surface>
            ) : (
              alerts.map((item) => {
                const isCritico = item.nivel === "critico";
                return (
                  <Card
                    key={`${item.producto_id}_${item.sucursal_id}`}
                    mode="outlined"
                    style={[styles.alertCard, isCritico && styles.alertCardCritico]}
                  >
                    <Card.Content style={styles.alertContent}>
                      {/* Badge and branch */}
                      <View style={styles.cardTopRow}>
                        <Chip
                          compact
                          style={isCritico ? styles.chipCritico : styles.chipBajo}
                          textStyle={isCritico ? styles.chipTextCritico : styles.chipTextBajo}
                        >
                          {isCritico ? "CRÍTICO · AGOTADO" : "STOCK BAJO"}
                        </Chip>
                        <Text variant="bodySmall" style={styles.muted}>
                          {item.sucursal_nombre}
                        </Text>
                      </View>

                      {/* Product Name & SKU */}
                      <Text variant="titleMedium" style={styles.productTitle}>
                        {item.producto_nombre}
                      </Text>
                      <Text variant="bodySmall" style={styles.muted}>
                        SKU: {item.producto_codigo} · {item.categoria}
                      </Text>

                      {/* Stock vs Min Bar */}
                      <View style={styles.stockStatusBox}>
                        <View style={styles.stockNumbers}>
                          <Text variant="bodyMedium">
                            Stock actual:{" "}
                            <Text style={isCritico ? styles.qtyRed : styles.qtyAmber}>
                              {item.cantidad_actual} unids
                            </Text>
                          </Text>
                          <Text variant="bodySmall" style={styles.muted}>
                            Umbral mínimo: {item.stock_minimo} unids
                          </Text>
                        </View>
                        <Text variant="labelSmall" style={styles.deficitText}>
                          Déficit: -{item.deficit} u.
                        </Text>
                      </View>

                      {/* Central Stock availability */}
                      {item.stock_central_disponible !== undefined && item.stock_central_disponible > 0 ? (
                        <View style={styles.centralBox}>
                          <Package size={14} color="#047857" />
                          <Text variant="bodySmall" style={styles.centralText}>
                            Disponible en Almacén Central: {item.stock_central_disponible} unids
                          </Text>
                        </View>
                      ) : null}

                      {/* Actions */}
                      <View style={styles.cardActionsRow}>
                        <Button
                          compact
                          mode="outlined"
                          icon={() => <Sliders size={14} />}
                          onPress={() => setConfiguringItem(item)}
                        >
                          Ajustar umbral ({item.stock_minimo})
                        </Button>
                        <Button
                          compact
                          mode="contained"
                          icon={() => <Truck size={14} color={colors.white} />}
                          onPress={() => setTab("sugerencias")}
                        >
                          Reabastecer
                        </Button>
                      </View>
                    </Card.Content>
                  </Card>
                );
              })
            )}
          </>
        ) : (
          /* TAB 2: Sugerencias Inteligentes de Reabastecimiento (RF-26) */
          <>
            <Surface style={styles.aiBanner} elevation={1}>
              <View style={styles.aiBannerContent}>
                <Sparkles size={20} color={colors.primary} />
                <View style={styles.aiBannerTexts}>
                  <Text variant="titleSmall" style={styles.aiBannerTitle}>
                    Motor Inteligente de Reabastecimiento
                  </Text>
                  <Text variant="bodySmall" style={styles.aiBannerSubtitle}>
                    Calcula excedentes en Almacén Central y déficit en sucursales para emitir
                    despachos en 1-tap.
                  </Text>
                </View>
              </View>
            </Surface>

            {suggestionsQuery.isLoading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.muted}>Analizando existencias y rutas de transferencia...</Text>
              </View>
            ) : suggestionsQuery.isError ? (
              <View style={styles.center}>
                <Text style={styles.errorText}>No se pudieron generar sugerencias.</Text>
                <Button onPress={() => suggestionsQuery.refetch()}>Reintentar</Button>
              </View>
            ) : suggestions.length === 0 ? (
              <Surface style={styles.emptyCard} elevation={0}>
                <CheckCircle2 size={44} color={colors.success} />
                <Text variant="titleMedium" style={styles.emptyTitle}>
                  Sin transferencias pendientes
                </Text>
                <Text variant="bodySmall" style={styles.emptySubtitle}>
                  Todas las sucursales cuentan con stock suficiente o no hay excedente transferible
                  en depósitos de origen.
                </Text>
              </Surface>
            ) : (
              suggestions.map((sug) => {
                const isUrgente = sug.urgencia === "urgente";
                return (
                  <Card key={sug.id} mode="outlined" style={styles.sugCard}>
                    <Card.Content style={styles.sugContent}>
                      {/* Urgency and Transfer Route */}
                      <View style={styles.cardTopRow}>
                        <Chip
                          compact
                          style={
                            isUrgente
                              ? styles.chipCritico
                              : sug.urgencia === "alta"
                              ? styles.chipBajo
                              : styles.chipMedia
                          }
                          textStyle={
                            isUrgente
                              ? styles.chipTextCritico
                              : sug.urgencia === "alta"
                              ? styles.chipTextBajo
                              : styles.chipTextMedia
                          }
                        >
                          PRIORIDAD {sug.urgencia.toUpperCase()}
                        </Chip>
                        <View style={styles.routePill}>
                          <Text variant="bodySmall" style={styles.routeText}>
                            {sug.sucursal_origen_nombre}
                          </Text>
                          <ArrowRight size={12} color={colors.textSecondary} />
                          <Text variant="bodySmall" style={styles.routeDestinoText}>
                            {sug.sucursal_destino_nombre}
                          </Text>
                        </View>
                      </View>

                      {/* Product Name */}
                      <Text variant="titleMedium" style={styles.productTitle}>
                        {sug.producto_nombre}
                      </Text>
                      <Text variant="bodySmall" style={styles.muted}>
                        SKU: {sug.producto_codigo}
                      </Text>

                      {/* Transfer Qty Highlight */}
                      <Surface style={styles.qtyHighlightBox} elevation={0}>
                        <View>
                          <Text variant="labelSmall" style={styles.qtyHighlightLabel}>
                            Transferencia Sugerida
                          </Text>
                          <Text variant="headlineSmall" style={styles.qtyHighlightVal}>
                            {sug.cantidad_sugerida} unids
                          </Text>
                        </View>
                        <View style={styles.qtyComparison}>
                          <Text variant="bodySmall" style={styles.muted}>
                            Origen disp: {sug.stock_origen_disponible} u.
                          </Text>
                          <Text variant="bodySmall" style={styles.muted}>
                            Destino actual: {sug.stock_destino_actual}/{sug.stock_destino_minimo} u.
                          </Text>
                        </View>
                      </Surface>

                      {/* Justification */}
                      <Text variant="bodySmall" style={styles.justificationText}>
                        💡 {sug.justificacion}
                      </Text>

                      {/* Action Button */}
                      <Button
                        mode="contained"
                        icon={() => <Truck size={16} color={colors.white} />}
                        onPress={() => handleApplySuggestion(sug)}
                        loading={emitirDespachoMutation.isPending}
                        style={styles.applyBtn}
                      >
                        Emitir Despacho de Reabastecimiento
                      </Button>
                    </Card.Content>
                  </Card>
                );
              })
            )}
          </>
        )}

        <ConfigurarStockMinimoModal
          visible={configuringItem !== null}
          item={configuringItem}
          onDismiss={() => setConfiguringItem(null)}
          onSave={handleSaveThreshold}
          loading={configMutation.isPending}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  kpiRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  kpiCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: 14,
    alignItems: "center",
    gap: 2,
  },
  kpiCritico: {
    backgroundColor: "#FEE2E2",
  },
  kpiCriticoVal: {
    fontWeight: "800",
    color: "#DC2626",
  },
  kpiBajo: {
    backgroundColor: "#FEF3C7",
  },
  kpiBajoVal: {
    fontWeight: "800",
    color: "#D97706",
  },
  kpiLabel: {
    color: colors.textSecondary,
    textAlign: "center",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  muted: {
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.danger,
  },
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    borderRadius: 16,
    backgroundColor: colors.surfaceSecondary,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  emptySubtitle: {
    textAlign: "center",
    color: colors.textSecondary,
  },
  alertCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
  },
  alertCardCritico: {
    borderColor: "#FCA5A5",
    borderWidth: 1.5,
  },
  alertContent: {
    gap: spacing.xs,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chipCritico: {
    backgroundColor: "#FEE2E2",
  },
  chipTextCritico: {
    color: "#DC2626",
    fontSize: 10,
    fontWeight: "800",
  },
  chipBajo: {
    backgroundColor: "#FEF3C7",
  },
  chipTextBajo: {
    color: "#D97706",
    fontSize: 10,
    fontWeight: "800",
  },
  chipMedia: {
    backgroundColor: "#EFF6FF",
  },
  chipTextMedia: {
    color: "#2563EB",
    fontSize: 10,
    fontWeight: "800",
  },
  productTitle: {
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 2,
  },
  stockStatusBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.sm,
    borderRadius: 8,
    marginTop: 4,
  },
  stockNumbers: {
    gap: 2,
  },
  qtyRed: {
    color: "#DC2626",
    fontWeight: "800",
  },
  qtyAmber: {
    color: "#D97706",
    fontWeight: "800",
  },
  deficitText: {
    color: "#DC2626",
    fontWeight: "700",
  },
  centralBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
  },
  centralText: {
    color: "#047857",
    fontWeight: "600",
  },
  cardActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  aiBanner: {
    padding: spacing.md,
    borderRadius: 14,
    backgroundColor: "#EFF6FF",
  },
  aiBannerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  aiBannerTexts: {
    flex: 1,
  },
  aiBannerTitle: {
    fontWeight: "700",
    color: colors.primary,
  },
  aiBannerSubtitle: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  sugCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
  },
  sugContent: {
    gap: spacing.xs,
  },
  routePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  routeText: {
    fontWeight: "600",
    color: colors.textSecondary,
    fontSize: 11,
  },
  routeDestinoText: {
    fontWeight: "700",
    color: colors.primary,
    fontSize: 11,
  },
  qtyHighlightBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    padding: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
  },
  qtyHighlightLabel: {
    color: colors.textSecondary,
    fontWeight: "600",
    textTransform: "uppercase",
    fontSize: 10,
  },
  qtyHighlightVal: {
    fontWeight: "800",
    color: colors.primary,
  },
  qtyComparison: {
    alignItems: "flex-end",
    gap: 2,
  },
  justificationText: {
    color: "#475569",
    fontStyle: "italic",
    marginTop: 2,
  },
  applyBtn: {
    marginTop: spacing.xs,
  },
});
