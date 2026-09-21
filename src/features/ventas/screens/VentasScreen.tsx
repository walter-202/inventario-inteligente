import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { Link, useFocusEffect } from "expo-router";
import { ScanBarcode, Search, X } from "lucide-react-native";
import { Button, Card, Chip, HelperText, Snackbar, Text } from "react-native-paper";

import { AppHeader } from "../../../shared/components/AppHeader";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { AppSearchbar } from "../../../shared/components/AppSearchbar";
import { BranchSelect } from "../../../shared/components/BranchSelect";
import { extraerMensajeError, formatearPrecio } from "../../../shared/lib/utils";
import { colors, spacing } from "../../../shared/theme";
import type { InventarioItem, PaymentMethod, Producto, VentaResumen } from "../../../shared/types/domain";
import { useSucursales } from "../../../shared/hooks/useSucursales";
import { useStockMultiSucursal } from "../../inventario/hooks/useStockMultiSucursal";
import { useProductos } from "../../productos/hooks/useProductos";
import { buscarProductoPorCodigo } from "../../productos/api/productosApi";
import { PaymentSelector } from "../components/PaymentSelector";
import { SaleCart, type CartItem } from "../components/SaleCart";
import { SaleSummaryModal } from "../components/SaleSummaryModal";
import { SaleCancelDialog } from "../components/SaleCancelDialog";
import { useProcesarVenta } from "../hooks/useProcesarVenta";
import { useVentas } from "../hooks/useVentas";
import { useAnularVenta } from "../hooks/useAnularVenta";
import {
  limpiarLotePendiente,
  limpiarProductoPendiente,
  peekLotePendiente,
  peekProductoPendiente,
  type ItemPendienteVenta,
} from "../lib/pendienteVenta";
import { useActiveBranch } from "../../../shared/hooks/useActiveBranch";
import { useAuth } from "../../auth/hooks/useAuth";
import { can } from "../../auth/lib/permissions";
import { PermissionDenied } from "../../auth/components/PermissionDenied";

export function VentasScreen() {
  const { profile } = useAuth();
  if (!can(profile?.rol, "sales.read")) return <PermissionDenied message="Tu rol no tiene acceso al módulo de ventas." />;
  return <VentasContent />;
}

function VentasContent() {
  const { profile } = useAuth();
  const { activeBranchId, canChangeBranch, selectBranch } = useActiveBranch();
  const branches = useSucursales();
  const stock = useStockMultiSucursal();
  const [branchId, setBranchId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [deferredSearch, setDeferredSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>("efectivo");
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [cancelSaleTarget, setCancelSaleTarget] = useState<VentaResumen | null>(null);
  const [pendingProduct, setPendingProduct] = useState<Producto | null>(null);
  const [pendingBatch, setPendingBatch] = useState<ItemPendienteVenta[] | null>(null);
  const [pendingStockSnapshot, setPendingStockSnapshot] = useState<InventarioItem[] | null>(null);
  const [lineaBorrada, setLineaBorrada] = useState<{ item: CartItem; index: number } | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const products = useProductos({ q: deferredSearch || undefined });
  const sales = useVentas(branchId ?? undefined);
  const mutation = useProcesarVenta();
  const anularMutation = useAnularVenta();
  const selectedBranch = branchId;

  useEffect(() => {
    const timer = setTimeout(() => setDeferredSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!canChangeBranch && activeBranchId !== null) {
      setBranchId(activeBranchId);
    } else if (branchId === null && branches.data?.length) {
      setBranchId(branches.data[0].id);
    }
  }, [activeBranchId, branches.data, branchId, canChangeBranch]);

  const refreshForScreen = useCallback(async () => {
    setPendingProduct(null);
    setPendingBatch(null);
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
      const pendingItems = peekLotePendiente();
      if (pending || pendingItems.length > 0) {
        setPendingStockSnapshot(stockResult.data);
        if (pending) setPendingProduct(pending);
        if (pendingItems.length > 0) setPendingBatch(pendingItems);
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

  const handleScanProduct = useCallback(
    async (scannedCode: string) => {
      try {
        const found = await buscarProductoPorCodigo(scannedCode);
        if (found) {
          addProduct(found);
        } else {
          setSearch(scannedCode);
        }
      } catch {
        setSearch(scannedCode);
      }
    },
    [addProduct],
  );

  const addProductsBatch = useCallback(
    (itemsToAdd: ItemPendienteVenta[], inventory: InventarioItem[] = stock.data ?? []) => {
      setCart((currentItems) => {
        const updated = [...currentItems];
        for (const item of itemsToAdd) {
          const available = stockFor(item.producto.id, inventory);
          if (available <= 0) continue;
          const targetQty = Math.min(Math.max(1, item.cantidad), available);
          const existingIndex = updated.findIndex((cartItem) => cartItem.producto.id === item.producto.id);
          if (existingIndex >= 0) {
            const currentQty = updated[existingIndex]!.cantidad;
            updated[existingIndex] = {
              ...updated[existingIndex]!,
              cantidad: Math.min(currentQty + targetQty, available),
              stock: available,
            };
          } else {
            updated.push({
              producto: item.producto,
              cantidad: targetQty,
              stock: available,
            });
          }
        }
        return updated;
      });
      setSearch("");
      setDeferredSearch("");
    },
    [stock.data, stockFor],
  );

  useEffect(() => {
    if ((!pendingProduct && (!pendingBatch || pendingBatch.length === 0)) || !pendingStockSnapshot || selectedBranch === null) return;

    if (pendingProduct) {
      addProduct(pendingProduct, pendingStockSnapshot);
      if (peekProductoPendiente()?.id === pendingProduct.id) {
        limpiarProductoPendiente();
      }
      setPendingProduct(null);
    }

    if (pendingBatch && pendingBatch.length > 0) {
      addProductsBatch(pendingBatch, pendingStockSnapshot);
      limpiarLotePendiente();
      setPendingBatch(null);
    }

    setPendingStockSnapshot(null);
  }, [addProduct, addProductsBatch, pendingProduct, pendingBatch, pendingStockSnapshot, selectedBranch]);


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

  const remove = (id: number) => {
    const index = cart.findIndex((item) => item.producto.id === id);
    if (index === -1) return;
    setLineaBorrada({ item: cart[index], index });
    setCart(cart.filter((_, position) => position !== index));
  };

  const deshacerQuitar = () => {
    if (!lineaBorrada) return;
    const { item, index } = lineaBorrada;
    setCart((items) => {
      if (items.some((current) => current.producto.id === item.producto.id)) return items;
      return [...items.slice(0, index), item, ...items.slice(index)];
    });
    setLineaBorrada(null);
  };
  const changeBranch = (id: number) => {
    if (!canChangeBranch && id !== activeBranchId) return;
    setBranchId(id);
    selectBranch(id);
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

  const handleConfirmAnulacion = async (motivo: string) => {
    if (!cancelSaleTarget) return;
    const res = await anularMutation.mutateAsync({
      venta_id: cancelSaleTarget.id,
      motivo,
    });
    Alert.alert(
      "Venta anulada con éxito (RF-17)",
      `La Venta #${res.venta_id} fue anulada y se revirtieron ${res.items_revertidos} línea(s) de productos al stock de la sucursal.`,
    );
    void sales.refetch();
    void stock.refetch();
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppHeader title="Ventas" subtitle="Punto de venta y caja" />
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
        <BranchSelect
          label="Sucursal"
          branches={(branches.data ?? []).filter((branch) => canChangeBranch || branch.id === activeBranchId)}
          value={selectedBranch}
          onChange={(id) => { if (id !== undefined) changeBranch(id); }}
        />
        <View style={styles.actions}>
          <Link href="/escanear" asChild>
            <Button mode="outlined" icon={() => <ScanBarcode size={18} color={colors.primary} />}>
              Escanear producto
            </Button>
          </Link>
        </View>
        <AppSearchbar
          value={search}
          onChangeText={setSearch}
          onScan={handleScanProduct}
          placeholder="Buscar prenda, código o con IA..."
          scanTitle="Escanear prenda para venta"
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
              <Button compact disabled={stockFor(product.id) <= 0} onPress={() => addProduct(product)}>
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
          Últimas ventas registradas
        </Text>
        {sales.data?.slice(0, 10).map((sale) => {
          const isAnulada = sale.estado === "anulada";
          return (
            <Card
              key={sale.id}
              mode="outlined"
              style={[styles.saleCard, isAnulada && styles.saleCardAnulada]}
            >
              <Card.Content style={styles.saleCardContent}>
                <View style={styles.saleInfo}>
                  <View style={styles.saleHeaderRow}>
                    <Text variant="titleSmall" style={[styles.saleTitle, isAnulada && styles.saleTitleAnulada]}>
                      Venta #{sale.id}
                    </Text>
                    {isAnulada ? (
                      <Chip compact style={styles.chipAnulada} textStyle={styles.chipTextAnulada}>
                        ANULADA
                      </Chip>
                    ) : (
                      <Chip compact style={styles.chipCompletada} textStyle={styles.chipTextCompletada}>
                        COMPLETADA
                      </Chip>
                    )}
                  </View>
                  <Text variant="bodySmall" style={styles.muted}>
                    {new Date(sale.fecha).toLocaleString("es-BO")} · Pago: {sale.metodo_pago}
                  </Text>
                  {isAnulada && sale.motivo_anulacion ? (
                    <Text variant="bodySmall" style={styles.motivoAnuladaText}>
                      Motivo: {sale.motivo_anulacion}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.saleActionWrap}>
                  <Text style={[styles.totalValue, isAnulada && styles.totalValueAnulada]}>
                    {formatearPrecio(sale.total)}
                  </Text>
                  {!isAnulada && can(profile?.rol, "sales.write") && (
                    <Button
                      compact
                      mode="text"
                      textColor="#DC2626"
                      onPress={() => setCancelSaleTarget(sale)}
                    >
                      Anular
                    </Button>
                  )}
                </View>
              </Card.Content>
            </Card>
          );
        })}
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
      <SaleCancelDialog
        visible={cancelSaleTarget !== null}
        sale={cancelSaleTarget}
        onDismiss={() => setCancelSaleTarget(null)}
        onConfirm={handleConfirmAnulacion}
        loading={anularMutation.isPending}
      />
      <Snackbar visible={lineaBorrada !== null} onDismiss={() => setLineaBorrada(null)} action={{ label: "Deshacer", onPress: deshacerQuitar }}>
        Línea quitada del ticket.
      </Snackbar>
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
    fontWeight: "700",
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
  totalValueAnulada: {
    color: "#94A3B8",
    textDecorationLine: "line-through",
  },
  saleCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  saleCardAnulada: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    opacity: 0.85,
  },
  saleCardContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  saleInfo: {
    flex: 1,
    gap: 4,
  },
  saleHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  saleTitle: {
    fontWeight: "700",
  },
  saleTitleAnulada: {
    color: "#64748B",
  },
  chipCompletada: {
    backgroundColor: "#E8F5E9",
  },
  chipTextCompletada: {
    color: "#2E7D32",
    fontSize: 10,
    fontWeight: "700",
  },
  chipAnulada: {
    backgroundColor: "#FFEBEE",
  },
  chipTextAnulada: {
    color: "#C62828",
    fontSize: 10,
    fontWeight: "700",
  },
  motivoAnuladaText: {
    color: "#C62828",
    fontStyle: "italic",
  },
  saleActionWrap: {
    alignItems: "flex-end",
    gap: 4,
  },
});

