import { useMemo, useState } from "react";
import { Alert, ScrollView, Share, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  ProgressBar,
  Searchbar,
  SegmentedButtons,
  Text,
} from "react-native-paper";
import {
  AlertTriangle,
  Flame,
  PieChart,
  Share2,
  Snowflake,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react-native";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { AppHeader } from "../../../shared/components/AppHeader";
import { colors, spacing } from "../../../shared/theme";
import { formatearPrecio } from "../../../shared/lib/utils";
import { useAnalisisRotacion } from "../hooks/useRotacion";
import type {
  MarketingInsight,
  ProductoRotacionItem,
  RotacionClasificacion,
} from "../../../shared/types/domain";

type TabMode = "rotacion" | "marketing";
type FilterClasificacion = "todas" | RotacionClasificacion;

const DIAS_OPCIONES = [
  { label: "15d", value: 15 },
  { label: "30d", value: 30 },
  { label: "60d", value: 60 },
  { label: "90d", value: 90 },
];

export function RotacionMarketingScreen() {
  const [dias, setDias] = useState<number>(30);
  const [tab, setTab] = useState<TabMode>("rotacion");
  const [filtroClasificacion, setFiltroClasificacion] = useState<FilterClasificacion>("todas");
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, refetch } = useAnalisisRotacion({ dias });

  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    let list = data.items;

    if (filtroClasificacion !== "todas") {
      list = list.filter((i) => i.clasificacion === filtroClasificacion);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.nombre.toLowerCase().includes(q) ||
          i.codigo.toLowerCase().includes(q) ||
          i.categoria.toLowerCase().includes(q),
      );
    }

    return list;
  }, [data?.items, filtroClasificacion, search]);

  const compartirReporte = async () => {
    if (!data) return;
    const lineasTop = data.items
      .filter((i) => i.clasificacion === "alta")
      .slice(0, 3)
      .map((i) => `• ${i.nombre} (${i.codigo}): ${i.unidadesVendidas}u vendidas | $${i.ingresosTotales.toFixed(2)}`);

    const lineasDeadStock = data.items
      .filter((i) => i.clasificacion === "baja" && i.stockActual > 0)
      .slice(0, 3)
      .map((i) => `• ${i.nombre} (${i.codigo}): ${i.stockActual}u en stock | $${(i.stockActual * i.precio).toFixed(2)} dormidos`);

    const texto = [
      `📊 RESUMEN EJECUTIVO DE ROTACIÓN Y MARKETING (${dias} DÍAS) - LIDEMODA`,
      `======================================================`,
      `• Total Unidades Vendidas: ${data.totalUnidadesVendidas} u.`,
      `• Total Ingresos Generados: $${data.totalIngresos.toFixed(2)}`,
      `• Capital Inmovilizado en Stock Frío: $${data.capitalInmovilizado.toFixed(2)}`,
      ``,
      `🔥 TOP PRENDAS ESTRELLA (ALTA ROTACIÓN):`,
      lineasTop.length > 0 ? lineasTop.join("\n") : "Sin prendas con alta rotación en el período.",
      ``,
      `❄️ STOCK ESTANCADO CRÍTICO (ACCIÓN COMERCIAL REQUERIDA):`,
      lineasDeadStock.length > 0 ? lineasDeadStock.join("\n") : "No hay stock estancado crítico.",
      ``,
      `💡 RECOMENDACIÓN DE MARKETING:`,
      data.insightsMarketing[0]?.accionSugerida ?? "Monitorear ventas semanales.",
    ].join("\n");

    try {
      await Share.share({ message: texto, title: "Reporte de Rotación y Marketing Lidemoda" });
    } catch {
      Alert.alert("Error", "No se pudo compartir el reporte.");
    }
  };

  return (
    <ScreenContainer scroll>
      <AppHeader
        title="Rotación y Marketing"
        subtitle="Inteligencia de negocio y tendencias comerciales"
      />

      {/* Timeframe Chips */}
      <View style={styles.timeframeRow}>
        <Text variant="labelLarge" style={styles.timeframeLabel}>
          Período:
        </Text>
        <View style={styles.chipsRow}>
          {DIAS_OPCIONES.map((opc) => (
            <Chip
              key={opc.value}
              selected={dias === opc.value}
              onPress={() => setDias(opc.value)}
              style={styles.timeChip}
              showSelectedOverlay
            >
              {opc.label}
            </Chip>
          ))}
        </View>
      </View>

      {/* KPI Overview Cards */}
      {data && (
        <View style={styles.kpiContainer}>
          <Card mode="outlined" style={[styles.kpiCard, { flex: 1 }]}>
            <Card.Content style={styles.kpiContent}>
              <Text variant="labelSmall" style={styles.kpiMuted}>
                Ventas del Período
              </Text>
              <Text variant="titleMedium" style={styles.kpiValue}>
                {formatearPrecio(data.totalIngresos)}
              </Text>
              <Text variant="bodySmall" style={styles.kpiSub}>
                {data.totalUnidadesVendidas} prendas
              </Text>
            </Card.Content>
          </Card>

          <Card mode="outlined" style={[styles.kpiCard, { flex: 1 }]}>
            <Card.Content style={styles.kpiContent}>
              <Text variant="labelSmall" style={styles.kpiMuted}>
                Stock Inmovilizado
              </Text>
              <Text variant="titleMedium" style={[styles.kpiValue, { color: colors.warning }]}>
                {formatearPrecio(data.capitalInmovilizado)}
              </Text>
              <Text variant="bodySmall" style={styles.kpiSub}>
                {data.productosBajaRotacion} prendas frías
              </Text>
            </Card.Content>
          </Card>
        </View>
      )}

      {/* Main Tabs */}
      <SegmentedButtons
        value={tab}
        onValueChange={(val) => setTab(val as TabMode)}
        buttons={[
          {
            value: "rotacion",
            label: "Rotación ABC",
            icon: () => <TrendingUp size={16} color={tab === "rotacion" ? colors.primary : colors.textSecondary} />,
          },
          {
            value: "marketing",
            label: "Marketing",
            icon: () => <Sparkles size={16} color={tab === "marketing" ? colors.primary : colors.textSecondary} />,
          },
        ]}
        style={styles.tabs}
      />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.mutedText}>Calculando análisis de rotación y tendencias...</Text>
        </View>
      ) : isError || !data ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>No se pudo cargar el análisis.</Text>
          <Button mode="contained" onPress={() => refetch()} style={styles.retryBtn}>
            Reintentar
          </Button>
        </View>
      ) : tab === "rotacion" ? (
        /* TAB 1: CLASIFICACIÓN DE ROTACIÓN ABC (RF-26) */
        <View style={styles.tabContent}>
          {/* Sub-classification filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
            <Chip
              selected={filtroClasificacion === "todas"}
              onPress={() => setFiltroClasificacion("todas")}
              style={styles.filterChip}
            >
              Todas ({data.items.length})
            </Chip>
            <Chip
              selected={filtroClasificacion === "alta"}
              onPress={() => setFiltroClasificacion("alta")}
              icon={() => <Flame size={14} color={colors.danger} />}
              style={styles.filterChip}
            >
              Alta ({data.productosAltaRotacion})
            </Chip>
            <Chip
              selected={filtroClasificacion === "media"}
              onPress={() => setFiltroClasificacion("media")}
              icon={() => <Zap size={14} color={colors.warning} />}
              style={styles.filterChip}
            >
              Media ({data.productosMediaRotacion})
            </Chip>
            <Chip
              selected={filtroClasificacion === "baja"}
              onPress={() => setFiltroClasificacion("baja")}
              icon={() => <Snowflake size={14} color={colors.info} />}
              style={styles.filterChip}
            >
              Baja / Frío ({data.productosBajaRotacion})
            </Chip>
          </ScrollView>

          <Searchbar
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por prenda, código o categoría"
            style={styles.searchbar}
          />

          {filteredItems.length === 0 ? (
            <Card mode="outlined" style={styles.emptyCard}>
              <Card.Content>
                <Text style={styles.emptyText}>No hay productos para el criterio seleccionado.</Text>
              </Card.Content>
            </Card>
          ) : (
            filteredItems.map((item) => (
              <ProductRotationCard key={item.productoId} item={item} />
            ))
          )}
        </View>
      ) : (
        /* TAB 2: TENDENCIAS Y ESTRATEGIAS DE MARKETING (RF-28) */
        <View style={styles.tabContent}>
          <View style={styles.actionHeader}>
            <Text variant="titleSmall" style={styles.sectionHeaderTitle}>
              Diagnósticos Comerciales Accionables
            </Text>
            <Button
              mode="contained-tonal"
              compact
              icon={() => <Share2 size={16} />}
              onPress={compartirReporte}
            >
              Compartir Resumen
            </Button>
          </View>

          {data.insightsMarketing.map((insight) => (
            <MarketingInsightCard key={insight.id} insight={insight} />
          ))}

          {/* Category Breakdown */}
          <Card mode="outlined" style={styles.categoryCard}>
            <Card.Title
              title="Mix y Demanda por Categoría"
              subtitle={`Distribución de las ${data.totalUnidadesVendidas} prendas vendidas`}
              left={(props) => <PieChart {...props} size={22} color={colors.primary} />}
            />
            <Card.Content style={styles.categoryContent}>
              {data.rendimientoCategorias.length === 0 ? (
                <Text style={styles.mutedText}>Sin ventas en el período.</Text>
              ) : (
                data.rendimientoCategorias.map((cat) => (
                  <View key={cat.categoria} style={styles.categoryRow}>
                    <View style={styles.categoryInfo}>
                      <Text variant="bodyMedium" style={styles.categoryName}>
                        {cat.categoria}
                      </Text>
                      <Text variant="bodySmall" style={styles.categoryStats}>
                        {cat.unidadesVendidas} u. · ${cat.ingresosTotales.toFixed(2)} ({cat.porcentajeVentas.toFixed(1)}%)
                      </Text>
                    </View>
                    <ProgressBar
                      progress={cat.porcentajeVentas / 100}
                      color={colors.primary}
                      style={styles.progressBar}
                    />
                  </View>
                ))
              )}
            </Card.Content>
          </Card>
        </View>
      )}
    </ScreenContainer>
  );
}

function ProductRotationCard({ item }: { item: ProductoRotacionItem }) {
  const badgeConfig = {
    alta: { label: "ALTA ROTACIÓN", color: colors.danger, bg: colors.dangerSoft, icon: Flame },
    media: { label: "ROTACIÓN MEDIA", color: colors.warning, bg: colors.warningSoft, icon: Zap },
    baja: { label: "BAJA / ESTANCADO", color: colors.info, bg: colors.infoSoft, icon: Snowflake },
  }[item.clasificacion];

  const IconComp = badgeConfig.icon;

  return (
    <Card mode="outlined" style={styles.itemCard}>
      <Card.Content style={styles.cardInner}>
        <View style={styles.cardHeader}>
          <View style={styles.titleCol}>
            <Text variant="titleMedium" numberOfLines={1}>
              {item.nombre}
            </Text>
            <Text variant="bodySmall" style={styles.skuText}>
              {item.codigo} · {item.categoria} · ${item.precio.toFixed(2)}
            </Text>
          </View>
          <View style={[styles.badgeContainer, { backgroundColor: badgeConfig.bg }]}>
            <IconComp size={12} color={badgeConfig.color} />
            <Text style={[styles.badgeText, { color: badgeConfig.color }]}>
              {badgeConfig.label}
            </Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricBox}>
            <Text variant="labelSmall" style={styles.kpiMuted}>
              Vendidas
            </Text>
            <Text variant="titleSmall" style={styles.metricNumber}>
              {item.unidadesVendidas} u.
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text variant="labelSmall" style={styles.kpiMuted}>
              Stock Disponible
            </Text>
            <Text variant="titleSmall" style={styles.metricNumber}>
              {item.stockActual} u.
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text variant="labelSmall" style={styles.kpiMuted}>
              Ingresos
            </Text>
            <Text variant="titleSmall" style={styles.metricNumber}>
              ${item.ingresosTotales.toFixed(2)}
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text variant="labelSmall" style={styles.kpiMuted}>
              Salida
            </Text>
            <Text variant="titleSmall" style={styles.metricNumber}>
              {(item.tasaRotacion * 100).toFixed(0)}%
            </Text>
          </View>
        </View>
      </Card.Content>
    </Card>
  );
}

function MarketingInsightCard({ insight }: { insight: MarketingInsight }) {
  const isEstrella = insight.tipo === "estrella";
  const isEstancado = insight.tipo === "estancado";
  const isRiesgo = insight.tipo === "oportunidad";

  const insightTheme = isEstrella
    ? { border: colors.danger, icon: Flame, iconColor: colors.danger, bg: colors.dangerSoft }
    : isEstancado
      ? { border: colors.info, icon: TrendingDown, iconColor: colors.info, bg: colors.infoSoft }
      : isRiesgo
        ? { border: colors.warning, icon: AlertTriangle, iconColor: colors.warning, bg: colors.warningSoft }
        : { border: colors.primary, icon: Sparkles, iconColor: colors.primary, bg: colors.background };

  const Icon = insightTheme.icon;

  return (
    <Card mode="outlined" style={[styles.insightCard, { borderLeftColor: insightTheme.border, borderLeftWidth: 4 }]}>
      <Card.Content style={styles.insightContent}>
        <View style={styles.insightHeader}>
          <Icon size={20} color={insightTheme.iconColor} />
          <Text variant="titleSmall" style={styles.insightTitle}>
            {insight.titulo}
          </Text>
        </View>
        <Text variant="bodySmall" style={styles.insightDesc}>
          {insight.descripcion}
        </Text>
        <View style={[styles.actionBox, { backgroundColor: insightTheme.bg }]}>
          <Text variant="labelMedium" style={{ color: insightTheme.iconColor, fontWeight: "600" }}>
            Estrategia de Marketing / Comercial:
          </Text>
          <Text variant="bodySmall" style={styles.actionText}>
            {insight.accionSugerida}
          </Text>
          {insight.impactoEstimado && (
            <Text variant="labelSmall" style={styles.impactText}>
              Impacto esperado: {insight.impactoEstimado}
            </Text>
          )}
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  timeframeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  timeframeLabel: {
    color: colors.textSecondary,
  },
  chipsRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  timeChip: {
    height: 32,
  },
  kpiContainer: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  kpiCard: {
    borderRadius: 8,
  },
  kpiContent: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  kpiMuted: {
    color: colors.textSecondary,
  },
  kpiValue: {
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 2,
  },
  kpiSub: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  tabs: {
    marginBottom: spacing.md,
  },
  tabContent: {
    gap: spacing.md,
  },
  filterChips: {
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  filterChip: {
    marginRight: spacing.xs,
  },
  searchbar: {
    marginBottom: spacing.xs,
    backgroundColor: colors.surface,
  },
  center: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  mutedText: {
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.danger,
  },
  retryBtn: {
    marginTop: spacing.sm,
  },
  emptyCard: {
    padding: spacing.md,
    alignItems: "center",
  },
  emptyText: {
    color: colors.textSecondary,
  },
  itemCard: {
    marginBottom: spacing.xs,
  },
  cardInner: {
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  titleCol: {
    flex: 1,
  },
  skuText: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  badgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  metricBox: {
    alignItems: "center",
  },
  metricNumber: {
    fontWeight: "600",
    color: colors.textPrimary,
  },
  actionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  sectionHeaderTitle: {
    fontWeight: "600",
    color: colors.textPrimary,
  },
  insightCard: {
    marginBottom: spacing.sm,
  },
  insightContent: {
    gap: spacing.xs,
  },
  insightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  insightTitle: {
    fontWeight: "700",
    color: colors.textPrimary,
    flex: 1,
  },
  insightDesc: {
    color: colors.textSecondary,
  },
  actionBox: {
    padding: spacing.sm,
    borderRadius: 6,
    marginTop: spacing.xs,
    gap: 2,
  },
  actionText: {
    color: colors.textPrimary,
  },
  impactText: {
    color: colors.textSecondary,
    fontStyle: "italic",
    marginTop: 2,
  },
  categoryCard: {
    marginTop: spacing.xs,
  },
  categoryContent: {
    gap: spacing.md,
  },
  categoryRow: {
    gap: 4,
  },
  categoryInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  categoryName: {
    fontWeight: "600",
    color: colors.textPrimary,
  },
  categoryStats: {
    color: colors.textSecondary,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
  },
});
