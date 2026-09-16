import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ArrowRightLeft } from "lucide-react-native";
import { Link, useFocusEffect } from "expo-router";
import { ActivityIndicator, Button, Text } from "react-native-paper";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { AppHeader } from "../../../shared/components/AppHeader";
import { colors, spacing } from "../../../shared/theme";
import { useSucursales } from "../../../shared/hooks/useSucursales";
import { useStockMultiSucursal } from "../hooks/useStockMultiSucursal";
import { StockBranchList } from "../components/StockBranchList";
import type { InventarioItem } from "../../../shared/types/domain";

export function InventarioScreen() {
  const branches = useSucursales();
  const stock = useStockMultiSucursal();
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null);
  useFocusEffect(useCallback(() => { void Promise.all([branches.refetch(), stock.refetch()]); }, [branches.refetch, stock.refetch]));
  const branchId = selectedBranch ?? branches.data?.[0]?.id ?? null;
  return <ScreenContainer><ScrollView contentContainerStyle={styles.content}><AppHeader title="Inventario" subtitle="Stock por sucursal" /><Link href="/movimientos" asChild><Button mode="contained" icon={() => <ArrowRightLeft size={18} color={colors.white} />} style={styles.action}>Registrar movimiento</Button></Link>{branches.isLoading || stock.isLoading ? <View style={styles.center}><ActivityIndicator /><Text style={styles.muted}>Cargando inventario...</Text></View> : branches.isError || stock.isError ? <View style={styles.center}><Text style={styles.error}>No se pudo cargar el inventario.</Text><Button onPress={() => Promise.all([branches.refetch(), stock.refetch()])}>Reintentar</Button></View> : <StockBranchList branches={branches.data ?? []} stock={stock.data ?? []} selectedBranchId={branchId} onBranchChange={setSelectedBranch} onItemPress={(_item: InventarioItem) => undefined} />}</ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({ content: { padding: spacing.lg, paddingBottom: spacing.xxxl }, action: { marginBottom: spacing.lg }, center: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xxxl }, muted: { color: colors.textSecondary }, error: { color: colors.danger } });
