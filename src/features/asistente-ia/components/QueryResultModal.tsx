import { Portal, Modal, Button, Text, Surface } from "react-native-paper";
import { StyleSheet, View, ScrollView } from "react-native";
import { Package, TrendingUp, Store, CheckCircle2, AlertTriangle, XCircle } from "lucide-react-native";
import { colors, spacing } from "../../../shared/theme";
import type { ResultadoInterpretacion } from "../api/voiceCommandApi";
import { formatSalesPeriodLabel } from "../../dashboard/api/dashboardApi";

interface QueryResultModalProps {
  visible: boolean;
  result: ResultadoInterpretacion | null;
  onDismiss: () => void;
}

export function QueryResultModal({ visible, result, onDismiss }: QueryResultModalProps) {
  if (!result || (result.tipo !== "consulta_stock" && result.tipo !== "consulta_ventas")) {
    return null;
  }

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        {result.tipo === "consulta_stock" ? (
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <Package size={22} color={colors.primary} />
              </View>
              <View style={styles.headerText}>
                <Text variant="titleMedium" style={styles.title}>
                  {result.producto.nombre}
                </Text>
                <Text variant="bodySmall" style={styles.subtitle}>
                  {result.producto.categoria} • SKU: {result.producto.codigo}
                </Text>
              </View>
            </View>

            <Surface style={styles.summaryBadge} elevation={0}>
              <Text variant="labelMedium" style={styles.summaryLabel}>
                Stock total en red
              </Text>
              <Text variant="headlineSmall" style={styles.summaryValue}>
                {result.stockTotal} <Text variant="bodyMedium">unidades</Text>
              </Text>
            </Surface>

            <Text variant="labelLarge" style={styles.sectionTitle}>
              Disponibilidad por sucursal
            </Text>

            <ScrollView style={styles.scrollList} contentContainerStyle={styles.branchList}>
              {result.desglose.map((item) => {
                const isZero = item.cantidad === 0;
                const isLow = item.cantidad > 0 && item.cantidad <= 5;
                const isSelected =
                  result.filtroSucursal &&
                  item.sucursalNombre.toLowerCase().includes(result.filtroSucursal.toLowerCase());

                return (
                  <View
                    key={item.sucursalId}
                    style={[styles.branchRow, isSelected && styles.branchRowSelected]}
                  >
                    <View style={styles.branchInfo}>
                      <Store size={16} color={isSelected ? colors.primary : colors.textSecondary} />
                      <Text
                        variant="bodyMedium"
                        style={[styles.branchName, isSelected && styles.branchNameSelected]}
                      >
                        {item.sucursalNombre}
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
            </ScrollView>

            <Text variant="bodySmall" style={styles.footnote}>
              {result.mensaje}
            </Text>

            <View style={styles.actions}>
              <Button mode="contained" onPress={onDismiss} style={styles.dismissButton}>
                Entendido
              </Button>
            </View>
          </View>
        ) : (
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={[styles.iconCircle, { backgroundColor: "#ECFDF5" }]}>
                <TrendingUp size={22} color="#10B981" />
              </View>
              <View style={styles.headerText}>
                <Text variant="titleMedium" style={styles.title}>
                  Resumen de Ventas
                </Text>
                <Text variant="bodySmall" style={styles.subtitle}>
                  {result.filtroSucursal ? `Sucursal ${result.filtroSucursal}` : "Todas las sucursales"} •{" "}
                  {formatSalesPeriodLabel(result.periodo, result.diasAtras)}
                </Text>
              </View>
            </View>

            <Surface style={[styles.summaryBadge, { backgroundColor: "#F0FDF4" }]} elevation={0}>
              <Text variant="labelMedium" style={{ color: "#065F46" }}>
                Total recaudado
              </Text>
              <Text variant="headlineMedium" style={{ color: "#047857", fontWeight: "700" }}>
                Bs {result.totalVentas.toFixed(2)}
              </Text>
              <Text variant="bodySmall" style={{ color: "#065F46", marginTop: 2 }}>
                {result.cantidadVentas} operación(es) registrada(s)
              </Text>
            </Surface>

            <Text variant="bodyMedium" style={styles.footnote}>
              {result.mensaje}
            </Text>

            <View style={styles.actions}>
              <Button mode="contained" onPress={onDismiss} style={styles.dismissButton}>
                Entendido
              </Button>
            </View>
          </View>
        )}
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
    maxHeight: "85%",
  },
  container: {
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textSecondary,
  },
  summaryBadge: {
    backgroundColor: "#F8FAFC",
    padding: spacing.md,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryLabel: {
    color: colors.textSecondary,
    textTransform: "uppercase",
    fontSize: 11,
  },
  summaryValue: {
    fontWeight: "800",
    color: colors.primary,
    marginTop: 2,
  },
  sectionTitle: {
    fontWeight: "600",
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  scrollList: {
    maxHeight: 180,
  },
  branchList: {
    gap: spacing.xs,
  },
  branchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
  },
  branchRowSelected: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  branchInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  branchName: {
    color: colors.textPrimary,
  },
  branchNameSelected: {
    fontWeight: "700",
    color: colors.primary,
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
  footnote: {
    color: colors.textSecondary,
    fontStyle: "italic",
    lineHeight: 18,
  },
  actions: {
    marginTop: spacing.xs,
  },
  dismissButton: {
    borderRadius: 10,
  },
});
