import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { Link, useFocusEffect } from "expo-router";
import { ScanBarcode, Search, X } from "lucide-react-native";
import { Button, Card, Chip, HelperText, Searchbar, Text } from "react-native-paper";

import { AppHeader } from "../../../shared/components/AppHeader";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { extraerMensajeError, formatearPrecio } from "../../../shared/lib/utils";
import { colors, spacing } from "../../../shared/theme";
import type { InventarioItem, PaymentMethod, Producto } from "../../../shared/types/domain";
import { useSucursales } from "../../../shared/hooks/useSucursales";
import { useStockMultiSucursal } from "../../inventario/hooks/useStockMultiSucursal";
import { useProductos } from "../../productos/hooks/useProductos";
import { PaymentSelector } from "../components/PaymentSelector";
import { SaleCart, type CartItem } from "../components/SaleCart";
import { SaleSummaryModal } from "../components/SaleSummaryModal";
import { useProcesarVenta } from "../hooks/useProcesarVenta";
import { useVentas } from "../hooks/useVentas";
import { limpiarProductoPendiente, peekProductoPendiente } from "../lib/pendienteVenta";

export function VentasScreen() {
  const branches = useSucursales();
  const stock = useStockMultiSucursal();
  const [branchId, setBranchId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [deferredSearch, setDeferredSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>("efectivo");
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<Producto | null>(null);
  const [pendingStockSnapshot, setPendingStockSnapshot] = useState<InventarioItem[] | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const products = useProductos({ q: deferredSearch || undefined });
  const sales = useVentas(branchId ?? undefined);
  const mutation = useProcesarVenta();
  const selectedBranch = branchId;

  useEffect(() => {
    const timer = setTimeout(() => setDeferredSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (branchId === null && branches.data?.length) {
      setBranchId(branches.data[0].id);
    }
  }, [branches.data, branchId]);

  const refreshForScreen = useCallback(async () => {
    setPendingProduct(null);
    setPendingStockSnapshot(null);
    setRefreshError(null);

    try {
      const [branchResult, stockResult, salesResult] = await Promise.all([
        branches.refetch(),
        stock.refetch(),
        sales.refetch(),
      ]);

      if (!branchResult.isSuccess || !stockResult.isSuccess || !Array.isArray(stockResult.data)) {
        setRefreshError("No se pudo actualizar el inventario. El producto escaneado se conservará para reintentar.");
        return;
      }

      if (!salesResult.isSuccess) {
        setRefreshError("El inventario está actualizado, pero no se pudieron cargar las ventas. Reintentá cuando puedas.");
      }

      const pending = peekProductoPendiente();
      if (pending) {
        setPendingStockSnapshot(stockResult.data);
        setPendingProduct(pending);
      }
    } catch {
      setRefreshError("No se pudo actualizar el inventario. El producto escaneado se conservará para reintentar.");
    }
  }, [branches.refetch, sales.refetch, stock.refetch]);

  useFocusEffect(
    useCallback(() => {
      void refreshForScreen();
    }, [refreshForScreen]),
  );

  const stockFor = useCallback(
    (productId: number, inventory: InventarioItem[] = stock.data ?? []) =>
      inventory.find((item) => item.producto_id === productId && item.sucursal_id === selectedBranch)?.cantidad ?? 0,
    [selectedBranch, stock.data],
  );

  const addProduct = useCallback(
    (product: Producto, inventory: InventarioItem[] = stock.data ?? []) => {
      const available = stockFor(product.id, inventory);
      if (available <= 0) {
        Alert.alert("Sin stock", `No hay stock de "${product.nombre}" en la sucursal seleccionada.`);
        return false;
      }

      setCart((items) => {
        const existing = items.find((item) => item.producto.id === product.id);
        if (existing) {
          return items.map((item) =>
            item.producto.id === product.id
              ? { ...item, cantidad: Math.min(item.cantidad + 1, available), stock: available }
              : item,
          );
        }
        return [...items, { producto: product, cantidad: 1, stock: available }];
      });
      setSearch("");
      setDeferredSearch("");
      return true;
    },
    [stock.data, stockFor],
  );

  useEffect(() => {
    if (!pendingProduct || !pendingStockSnapshot || selectedBranch === null) return;

    addProduct(pendingProduct, pendingStockSnapshot);
    if (peekProductoPendiente()?.id === pendingProduct.id) {
      limpiarProductoPendiente();
    }
    setPendingProduct(null);
    setPendingStockSnapshot(null);
  }, [addProduct, pendingProduct, pendingStockSnapshot, selectedBranch]);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.producto.precio * item.cantidad, 0),
    [cart],
  );

  const increment = (id: number) =>
    setCart((items) =>
      items.map((item) =>
        item.producto.id === id
          ? { ...item, cantidad: Math.min(item.cantidad + 1, item.stock) }
          : item,
      ),
    );

  const decrement = (id: number) =>
    setCart((items) =>
      items.map((item) =>
        item.producto.id === id
          ? { ...item, cantidad: Math.max(item.cantidad - 1, 1) }
          : item,
      ),
    );

  const remove = (id: number) => setCart((items) => items.filter((item) => item.producto.id !== id));
  const changeBranch = (id: number) => {
    setBranchId(id);
    setCart([]);
  };

  const confirm = () => {
    if (!selectedBranch || !cart.length) return;

    mutation.mutate(
      {
        sucursal_id: selectedBranch,
        metodo_pago: payment,
        productos: cart.map((item) => ({ producto_id: item.producto.id, cantidad: item.cantidad })),
      },
      {
        onSuccess: () => {
          setSummaryVisible(false);
          setCart([]);
          Alert.alert("Venta registrada", "La venta se registró correctamente.");
        },
        onError: (error) =>
          Alert.alert("No se pudo registrar la venta", extraerMensajeError(error, "Intentá nuevamente.")),
      },
    );
  };

  const branchName = branches.data?.find((branch) => branch.id === selectedBranch)?.nombre ?? "";
  const results = deferredSearch.trim() ? products.data : [];
  const mutationError = mutation.error
    ? extraerMensajeError(mutation.error, "No se pudo registrar la venta.")
    : null;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppHeader title="Ventas" subtitle="Punto de venta" />
        {refreshError ? (
          <View style={styles.refreshError}>
            <HelperText type="error" visible>
              {refreshError}
            </HelperText>
            <Button mode="text" onPress={() => void refreshForScreen()}>
              Reintentar actualización
            </Button>
          </View>
        ) : null}
        <Text variant="labelLarge">Sucursal</Text>
        <View style={styles.chips}>
          {(branches.data ?? []).map((branch) => (
            <Chip key={branch.id} selected={branch.id === branchId} onPress={() => changeBranch(branch.id)}>
              {branch.nombre}
            </Chip>
          ))}
        </View>
        <View style={styles.actions}>
          <Link href="/escanear" asChild>
            <Button mode="outlined" icon={() => <ScanBarcode size={18} color={colors.primary} />}>
              Escanear producto
            </Button>
          </Link>
        </View>
        <Searchbar
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar producto"
          icon={() => <Search size={20} color={colors.textSecondary} />}
          clearIcon={() => <X size={20} color={colors.textSecondary} />}
        />
        {results.map((product) => (
          <Card key={product.id} mode="outlined" style={styles.result} onPress={() => addProduct(product)}>
            <Card.Content style={styles.resultContent}>
              <View style={styles.resultCopy}>
                <Text variant="titleSmall">{product.nombre}</Text>
                <Text style={styles.muted}>
                  {product.codigo} · Stock {stockFor(product.id)}
                </Text>
              </View>
              <Button compact disabled={stockFor(product.id) <= 0}>
                Agregar
              </Button>
            </Card.Content>
          </Card>
        ))}
        {deferredSearch.trim() && products.hasNextPage ? (
          <Button mode="text" onPress={() => products.fetchNextPage()} loading={products.isFetchingNextPage}>
            Cargar más resultados
          </Button>
        ) : null}
        <Text variant="titleMedium" style={styles.section}>
          Carrito
        </Text>
        <SaleCart items={cart} onIncrement={increment} onDecrement={decrement} onRemove={remove} />
        <Text variant="titleMedium" style={styles.section}>
          Método de pago
        </Text>
        <PaymentSelector value={payment} onChange={setPayment} />
        <Card mode="outlined" style={styles.total}>
          <Card.Content style={styles.totalContent}>
            <Text variant="titleMedium">Total</Text>
            <Text variant="headlineSmall" style={styles.totalValue}>
              {formatearPrecio(total)}
            </Text>
          </Card.Content>
        </Card>
        <HelperText type="error" visible={Boolean(mutationError)}>
          {mutationError ?? ""}
        </HelperText>
        <Button mode="contained" onPress={() => setSummaryVisible(true)} disabled={!selectedBranch || cart.length === 0}>
          Registrar venta
        </Button>
        <Text variant="titleMedium" style={styles.section}>
          Últimas ventas
        </Text>
        {sales.data?.slice(0, 5).map((sale) => (
          <View key={sale.id} style={styles.saleRow}>
            <Text>{new Date(sale.fecha).toLocaleDateString("es-BO")}</Text>
            <Text>{sale.metodo_pago}</Text>
            <Text style={styles.totalValue}>{formatearPrecio(sale.total)}</Text>
          </View>
        ))}
      </ScrollView>
      <SaleSummaryModal
        visible={summaryVisible}
        branchName={branchName}
        paymentLabel={payment}
        items={cart}
        loading={mutation.isPending}
        error={mutationError}
        onDismiss={() => setSummaryVisible(false)}
        onConfirm={confirm}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  refreshError: {
    alignItems: "flex-start",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  result: {
    marginTop: spacing.sm,
  },
  resultContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  resultCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  muted: {
    color: colors.textSecondary,
  },
  section: {
    marginTop: spacing.md,
  },
  total: {
    marginTop: spacing.md,
  },
  totalContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalValue: {
    color: colors.primary,
    fontWeight: "700",
  },
  saleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
  },
});
