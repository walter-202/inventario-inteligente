import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { AlertTriangle, ArrowRightLeft, BookOpen } from "lucide-react-native";
import { Link, router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Button, Text } from "react-native-paper";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { AppHeader } from "../../../shared/components/AppHeader";
import { AppSearchbar } from "../../../shared/components/AppSearchbar";
import { colors, spacing } from "../../../shared/theme";
import { useSucursales } from "../../../shared/hooks/useSucursales";
import { useStockMultiSucursal } from "../hooks/useStockMultiSucursal";
import { StockBranchList } from "../components/StockBranchList";
import type { InventarioItem } from "../../../shared/types/domain";

export function InventarioScreen() {
  const branches = useSucursales();
  const stock = useStockMultiSucursal();
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  useFocusEffect(
    useCallback(() => {
      void Promise.all([branches.refetch(), stock.refetch()]);
    }, [branches.refetch, stock.refetch]),
  );

  const branchId = selectedBranch ?? branches.data?.[0]?.id ?? null;

  const filteredStock = useMemo(() => {
    const list = stock.data ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (item) =>
        item.producto.nombre.toLowerCase().includes(query) ||
        item.producto.codigo.toLowerCase().includes(query) ||
        Boolean(item.producto.categoria?.toLowerCase().includes(query)),
    );
  }, [stock.data, search]);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppHeader title="Inventario" subtitle="Stock por sucursal" />

        <View style={styles.topActions}>
          <Link href="/movimientos" asChild>
            <Button
              mode="contained"
              icon={() => <ArrowRightLeft size={16} color={colors.white} />}
              style={styles.actionBtn}
              compact
            >
              Movimientos
            </Button>
          </Link>
          <Link href={"/kardex" as any} asChild>
            <Button
              mode="outlined"
              icon={() => <BookOpen size={16} color={colors.primary} />}
              style={styles.actionBtn}
              compact
            >
              Kardex
            </Button>
          </Link>
          <Link href={"/alertas-stock" as any} asChild>
            <Button
              mode="outlined"
              icon={() => <AlertTriangle size={16} color={colors.warning} />}
              style={styles.actionBtn}
              compact
            >
              Alertas IA
            </Button>
          </Link>
        </View>

        <AppSearchbar
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por prenda, código o categoría"
          scanTitle="Escanear prenda para ver stock"
          style={styles.search}
        />

        {branches.isLoading || stock.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={styles.muted}>Cargando inventario...</Text>
          </View>
        ) : branches.isError || stock.isError ? (
          <View style={styles.center}>
            <Text style={styles.error}>No se pudo cargar el inventario.</Text>
            <Button onPress={() => Promise.all([branches.refetch(), stock.refetch()])}>Reintentar</Button>
          </View>
        ) : (
          <StockBranchList
            branches={branches.data ?? []}
            stock={filteredStock}
            selectedBranchId={branchId}
            onBranchChange={setSelectedBranch}
            onItemPress={(item: InventarioItem) =>
              router.push({
                pathname: "/producto-detalle",
                params: { id: String(item.producto.id) },
              })
            }
          />
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  topActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  actionBtn: {
    flex: 1,
  },
  search: {
    marginBottom: spacing.md,
  },
  center: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xxxl,
  },
  muted: {
    color: colors.textSecondary,
  },
  error: {
    color: colors.danger,
  },
});
