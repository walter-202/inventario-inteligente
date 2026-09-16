import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, Link } from "expo-router";
import { ActivityIndicator, Button, Chip, Text } from "react-native-paper";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { AppHeader } from "../../../shared/components/AppHeader";
import { colors, spacing } from "../../../shared/theme";
import { useSucursales } from "../../../shared/hooks/useSucursales";
import { useDashboardMetrics } from "../hooks/useDashboardMetrics";
import { KpiGrid } from "../components/KpiGrid";
import { SalesWeeklyChart } from "../components/SalesWeeklyChart";
import { LowStockList } from "../components/LowStockList";

export function DashboardScreen() {
  const branches = useSucursales();
  const [branchId, setBranchId] = useState<number | undefined>();
  const metrics = useDashboardMetrics(branchId);
  useFocusEffect(useCallback(() => { void Promise.all([branches.refetch(), metrics.refetch()]); }, [branches.refetch, metrics.refetch]));
  const branchName = branchId === undefined ? "Todas las sucursales" : branches.data?.find((branch) => branch.id === branchId)?.nombre;
  return <ScreenContainer><ScrollView contentContainerStyle={styles.content}><AppHeader title="Lidemoda" subtitle="Panel operativo" branchName={branchName} /><View style={styles.chips}><Chip selected={branchId === undefined} showSelectedCheck={false} onPress={() => setBranchId(undefined)}>Todas</Chip>{(branches.data ?? []).map((branch) => <Chip key={branch.id} selected={branch.id === branchId} showSelectedCheck={false} onPress={() => setBranchId(branch.id)}>{branch.nombre}</Chip>)}</View><View style={styles.actions}><Link href="/registrar-producto" asChild><Button mode="contained" compact>+ Producto</Button></Link><Link href="/nueva-venta" asChild><Button mode="contained-tonal" compact>Nueva venta</Button></Link><Link href="/escanear" asChild><Button mode="outlined" compact>Escanear</Button></Link></View>{metrics.isLoading ? <View style={styles.center}><ActivityIndicator /><Text style={styles.muted}>Cargando métricas reales...</Text></View> : metrics.isError ? <View style={styles.center}><Text style={styles.error}>No se pudieron cargar las métricas.</Text><Button onPress={() => metrics.refetch()}>Reintentar</Button></View> : metrics.data ? <>{<KpiGrid metrics={metrics.data} />}<SalesWeeklyChart days={metrics.data.weeklySales} /><LowStockList items={metrics.data.lowStock} /></> : <Text style={styles.muted}>No hay datos disponibles.</Text>}</ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({ content: { padding: spacing.lg, paddingBottom: spacing.xxxl }, chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md }, actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg }, center: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xxxl }, muted: { color: colors.textSecondary }, error: { color: colors.danger } });
