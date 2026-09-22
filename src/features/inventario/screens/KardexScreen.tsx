import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
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
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  CheckCircle,
  Clock,
  Filter,
  RotateCcw,
  Tag,
  Truck,
  X,
} from "lucide-react-native";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { AppHeader } from "../../../shared/components/AppHeader";
import { BranchSelect } from "../../../shared/components/BranchSelect";
import { AppSearchbar } from "../../../shared/components/AppSearchbar";
import { colors, spacing } from "../../../shared/theme";
import { formatearFechaHora } from "../../../shared/lib/utils";
import { useSucursales } from "../../../shared/hooks/useSucursales";
import { useKardex } from "../hooks/useKardex";
import { useProductos } from "../../productos/hooks/useProductos";
import type { MovimientoKardexItem, Producto } from "../../../shared/types/domain";
import { useActiveBranch } from "../../../shared/hooks/useActiveBranch";

type FilterTipo = "todas" | "entrada" | "salida";

export function KardexScreen() {
  const { activeBranchId, canChangeBranch } = useActiveBranch();
  const branches = useSucursales();
  const [selectedBranchId, setSelectedBranchId] = useState<number | undefined>(
    activeBranchId ?? undefined,
  );
  const [tipoFilter, setTipoFilter] = useState<FilterTipo>("todas");
  const [selectedProduct, setSelectedProduct] = useState<Producto | null>(null);
  const [search, setSearch] = useState("");

  const productsQuery = useProductos({ q: search || undefined });

  const kardexQuery = useKardex({
    sucursal_id: selectedBranchId,
    producto_id: selectedProduct?.id,
    tipo: tipoFilter,
    limite: 100,
  });

  const movements = kardexQuery.data ?? [];

  const summary = useMemo(() => {
    let entradas = 0;
    let salidas = 0;
    for (const m of movements) {
      if (m.tipo === "entrada") entradas += m.cantidad;
      else if (m.tipo === "salida") salidas += m.cantidad;
    }
    return {
      entradas,
      salidas,
      neto: entradas - salidas,
    };
  }, [movements]);

  const handleSelectProduct = (prod: Producto) => {
    setSelectedProduct(prod);
    setSearch("");
  };

  const getSubtypeBadge = (item: MovimientoKardexItem) => {
    switch (item.subtipo) {
      case "anulacion":
        return {
          label: "ANULACIÓN DE VENTA",
          icon: RotateCcw,
          bg: "#FEF3C7",
          color: "#B45309",
        };
      case "merma":
        return {
          label: "MERMA / DAÑO",
          icon: AlertOctagon,
          bg: "#FEE2E2",
          color: "#DC2626",
        };
      case "venta":
        return {
          label: "VENTA",
          icon: ArrowUpRight,
          bg: "#EFF6FF",
          color: "#2563EB",
        };
      case "despacho":
        return {
          label: "DESPACHO",
          icon: Truck,
          bg: "#F3E8FF",
          color: "#7E22CE",
        };
      case "recepcion":
        return {
          label: "RECEPCIÓN",
          icon: CheckCircle,
          bg: "#ECFDF5",
          color: "#047857",
        };
      default:
        return item.tipo === "entrada"
          ? { label: "ENTRADA MANUAL", icon: ArrowDownLeft, bg: "#ECFDF5", color: "#047857" }
          : { label: "SALIDA MANUAL", icon: ArrowUpRight, bg: "#FEE2E2", color: "#DC2626" };
    }
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppHeader
          title="Kardex e Historial"
          subtitle="Trazabilidad y saldos de inventario"
        />

        {/* Filters */}
        <Surface style={styles.filterCard} elevation={1}>
          <Text variant="labelLarge" style={styles.filterTitle}>
            <Filter size={16} color={colors.primary} /> Filtros de auditoría
          </Text>

          <BranchSelect
            label="Filtrar por sucursal"
            branches={branches.data ?? []}
            value={selectedBranchId ?? null}
            onChange={(id) => setSelectedBranchId(id ?? undefined)}
            disabled={!canChangeBranch && activeBranchId !== null}
          />

          <SegmentedButtons
            value={tipoFilter}
            onValueChange={(val) => setTipoFilter(val as FilterTipo)}
            buttons={[
              { value: "todas", label: "Todas", showSelectedCheck: false },
              { value: "entrada", label: "Entradas (+)", showSelectedCheck: false },
              { value: "salida", label: "Salidas (-)", showSelectedCheck: false },
            ]}
          />

          {/* Product Picker */}
          {selectedProduct ? (
            <Surface style={styles.selectedProductCard} elevation={0}>
              <View style={styles.selectedProductInfo}>
                <Tag size={16} color={colors.primary} />
                <View style={styles.selectedProductTexts}>
                  <Text variant="titleSmall" style={styles.selectedProductName}>
                    {selectedProduct.nombre}
                  </Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    {selectedProduct.codigo} · {selectedProduct.categoria}
                  </Text>
                </View>
              </View>
              <Button
                compact
                mode="text"
                textColor={colors.danger}
                icon={() => <X size={16} color={colors.danger} />}
                onPress={() => setSelectedProduct(null)}
              >
                Quitar filtro
              </Button>
            </Surface>
          ) : (
            <>
              <AppSearchbar
                value={search}
                onChangeText={setSearch}
                onScan={(code) => setSearch(code)}
                placeholder="Filtrar por prenda o escanear..."
                scanTitle="Escanear prenda para Kardex"
              />
              {search.trim() ? (
                <View style={styles.productSearchResults}>
                  {productsQuery.data?.slice(0, 4).map((p) => (
                    <Card
                      key={p.id}
                      mode="outlined"
                      style={styles.searchResultItem}
                      onPress={() => handleSelectProduct(p)}
                    >
                      <Card.Content style={styles.searchResultContent}>
                        <Text variant="bodyMedium" style={styles.bold}>
                          {p.nombre}
                        </Text>
                        <Text variant="bodySmall" style={styles.muted}>
                          {p.codigo} · {p.categoria}
                        </Text>
                      </Card.Content>
                    </Card>
                  ))}
                </View>
              ) : null}
            </>
          )}
        </Surface>

        {/* Metrics Summary Card */}
        <Surface style={styles.metricsCard} elevation={1}>
          <View style={styles.metricCol}>
            <Text variant="labelSmall" style={styles.metricLabel}>
              Total Entradas
            </Text>
            <Text variant="titleLarge" style={styles.metricEntradas}>
              +{summary.entradas}
            </Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricCol}>
            <Text variant="labelSmall" style={styles.metricLabel}>
              Total Salidas
            </Text>
            <Text variant="titleLarge" style={styles.metricSalidas}>
              -{summary.salidas}
            </Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricCol}>
            <Text variant="labelSmall" style={styles.metricLabel}>
              Balance Neto
            </Text>
            <Text
              variant="titleLarge"
              style={summary.neto >= 0 ? styles.metricNetoPos : styles.metricNetoNeg}
            >
              {summary.neto >= 0 ? `+${summary.neto}` : summary.neto}
            </Text>
          </View>
        </Surface>

        {/* Movements Ledger List */}
        <Text variant="titleMedium" style={styles.ledgerHeader}>
          Libro Mayor de Movimientos ({movements.length})
        </Text>

        {kardexQuery.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.muted}>Cargando kardex...</Text>
          </View>
        ) : kardexQuery.isError ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>No se pudo cargar el historial de kardex.</Text>
            <Button onPress={() => kardexQuery.refetch()}>Reintentar</Button>
          </View>
        ) : movements.length === 0 ? (
          <Surface style={styles.emptyCard} elevation={0}>
            <Boxes size={40} color={colors.textMuted} />
            <Text variant="titleMedium" style={styles.emptyTitle}>
              No hay movimientos registrados
            </Text>
            <Text variant="bodySmall" style={styles.emptySubtitle}>
              Los movimientos de entradas, salidas, ventas y mermas aparecerán aquí en orden
              cronológico.
            </Text>
          </Surface>
        ) : (
          movements.map((item) => {
            const badge = getSubtypeBadge(item);
            const Icon = badge.icon;
            const isEntrada = item.tipo === "entrada";

            return (
              <Card key={item.id} mode="outlined" style={styles.movementCard}>
                <Card.Content style={styles.cardContent}>
                  {/* Header Row */}
                  <View style={styles.cardHeaderRow}>
                    <View style={[styles.subtypeTag, { backgroundColor: badge.bg }]}>
                      <Icon size={14} color={badge.color} />
                      <Text style={[styles.subtypeText, { color: badge.color }]}>
                        {badge.label}
                      </Text>
                    </View>
                    <View style={styles.dateRow}>
                      <Clock size={12} color={colors.textMuted} />
                      <Text variant="labelSmall" style={styles.dateText}>
                        {formatearFechaHora(item.fecha)}
                      </Text>
                    </View>
                  </View>

                  {/* Body Row */}
                  <View style={styles.cardBodyRow}>
                    <View style={styles.productCol}>
                      <Text variant="titleMedium" style={styles.productName}>
                        {item.producto_nombre}
                      </Text>
                      <Text variant="bodySmall" style={styles.muted}>
                        SKU: {item.producto_codigo} · Sucursal: {item.sucursal_nombre}
                      </Text>
                    </View>

                    <View style={styles.qtyCol}>
                      <Text
                        variant="headlineSmall"
                        style={isEntrada ? styles.qtyEntrada : styles.qtySalida}
                      >
                        {isEntrada ? `+${item.cantidad}` : `-${item.cantidad}`}
                      </Text>
                      <Text variant="labelSmall" style={styles.qtySub}>
                        unidades
                      </Text>
                    </View>
                  </View>

                  {/* Saldo and notes */}
                  <View style={styles.cardFooterRow}>
                    {item.saldo_resultante !== undefined && (
                      <Chip compact style={styles.saldoChip} textStyle={styles.saldoText}>
                        Saldo en fecha: {item.saldo_resultante} u.
                      </Chip>
                    )}
                    {item.observacion ? (
                      <Text variant="bodySmall" style={styles.noteText} numberOfLines={2}>
                        📝 {item.observacion}
                      </Text>
                    ) : null}
                  </View>
                </Card.Content>
              </Card>
            );
          })
        )}
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
  filterCard: {
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  filterTitle: {
    fontWeight: "700",
    color: colors.textPrimary,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  selectedProductCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.sm,
    borderRadius: 8,
  },
  selectedProductInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flex: 1,
  },
  selectedProductTexts: {
    flex: 1,
  },
  selectedProductName: {
    fontWeight: "700",
  },
  productSearchResults: {
    gap: 4,
  },
  searchResultItem: {
    backgroundColor: colors.surface,
  },
  searchResultContent: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  metricsCard: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  metricCol: {
    alignItems: "center",
    flex: 1,
  },
  metricLabel: {
    color: colors.textSecondary,
    textTransform: "uppercase",
    fontSize: 10,
    fontWeight: "600",
  },
  metricEntradas: {
    color: colors.successDark,
    fontWeight: "800",
    marginTop: 2,
  },
  metricSalidas: {
    color: colors.danger,
    fontWeight: "800",
    marginTop: 2,
  },
  metricNetoPos: {
    color: colors.primary,
    fontWeight: "800",
    marginTop: 2,
  },
  metricNetoNeg: {
    color: colors.danger,
    fontWeight: "800",
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  ledgerHeader: {
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: spacing.xs,
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
  bold: {
    fontWeight: "700",
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
  movementCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
  },
  cardContent: {
    gap: spacing.xs,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  subtypeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  subtypeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dateText: {
    color: colors.textMuted,
  },
  cardBodyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  productCol: {
    flex: 1,
    marginRight: spacing.sm,
  },
  productName: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  qtyCol: {
    alignItems: "flex-end",
  },
  qtyEntrada: {
    color: colors.successDark,
    fontWeight: "800",
  },
  qtySalida: {
    color: colors.danger,
    fontWeight: "800",
  },
  qtySub: {
    color: colors.textMuted,
    fontSize: 9,
  },
  cardFooterRow: {
    marginTop: 4,
    gap: 4,
  },
  saldoChip: {
    backgroundColor: colors.primarySoft,
    alignSelf: "flex-start",
  },
  saldoText: {
    color: colors.primaryDark,
    fontSize: 10,
    fontWeight: "700",
  },
  noteText: {
    color: colors.textSecondary,
    fontStyle: "italic",
  },
});
