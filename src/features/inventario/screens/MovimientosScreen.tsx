import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { ArrowRightLeft, Search, X } from "lucide-react-native";
import { ActivityIndicator, Button, Card, Chip, HelperText, Searchbar, SegmentedButtons, Text, TextInput } from "react-native-paper";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { AppHeader } from "../../../shared/components/AppHeader";
import { colors, spacing } from "../../../shared/theme";
import { extraerMensajeError } from "../../../shared/lib/utils";
import type { Producto } from "../../../shared/types/domain";
import { useSucursales } from "../../../shared/hooks/useSucursales";
import { useProductos } from "../../productos/hooks/useProductos";
import { useStockMultiSucursal } from "../hooks/useStockMultiSucursal";
import { useMovimientos } from "../hooks/useMovimientos";
import { MovimientoSucursalSchema } from "../api/inventarioApi";
import { TransferModal } from "../components/TransferModal";
import type { InventarioItem } from "../../../shared/types/domain";

type MovementType = "entrada" | "salida" | "transferencia";

export function MovimientosScreen() {
  const branches = useSucursales();
  const stock = useStockMultiSucursal();
  const movement = useMovimientos();
  const [type, setType] = useState<MovementType>("entrada");
  const [branchId, setBranchId] = useState<number | null>(null);
  const [destinationId, setDestinationId] = useState<number | null>(null);
  const [product, setProduct] = useState<Producto | null>(null);
  const [search, setSearch] = useState("");
  const [deferredSearch, setDeferredSearch] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [transferVisible, setTransferVisible] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setDeferredSearch(search), 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => { if (branchId === null && branches.data?.length) setBranchId(branches.data[0].id); if (destinationId === null && branches.data?.length && branches.data.length > 1) setDestinationId(branches.data[1].id); }, [branches.data, branchId, destinationId]);
  const products = useProductos({ q: deferredSearch || undefined });
  const inventoryItem = useMemo(() => stock.data?.find((item) => item.producto_id === product?.id && item.sucursal_id === branchId), [stock.data, product?.id, branchId]);
  const results = deferredSearch.trim() && !product ? products.data : [];
  const selectedBranchName = branches.data?.find((branch) => branch.id === branchId)?.nombre ?? "";

  const chooseType = (value: string) => { setType(value as MovementType); setFormError(null); setQuantity("1"); setNote(""); };
  const chooseProduct = (value: Producto) => { setProduct(value); setSearch(""); setDeferredSearch(""); setFormError(null); };
  const submit = () => {
    if (!product || branchId === null) { setFormError("Seleccioná una sucursal y un producto."); return; }
    const parsed = MovimientoSucursalSchema.safeParse({ producto_id: product.id, sucursal_id: branchId, cantidad: Number(quantity), observacion: note });
    if (!parsed.success) { setFormError(parsed.error.issues[0]?.message ?? "Revisá los datos."); return; }
    if (type === "salida" && parsed.data.cantidad > (inventoryItem?.cantidad ?? 0)) { setFormError(`Stock insuficiente. Disponible: ${inventoryItem?.cantidad ?? 0}.`); return; }
    setFormError(null);
    const input = type === "entrada" ? { tipo: "entrada" as const, params: parsed.data } : { tipo: "salida" as const, params: parsed.data };
    movement.mutate(input, { onSuccess: () => { Alert.alert("Movimiento registrado", "La operación se registró correctamente."); setProduct(null); setQuantity("1"); setNote(""); }, onError: (error) => setFormError(extraerMensajeError(error, "No se pudo registrar el movimiento.")) });
  };
  const selectedTransferItem: InventarioItem | null = inventoryItem ?? (product && branchId !== null ? { id: -1, producto_id: product.id, sucursal_id: branchId, cantidad: 0, producto: product, sucursal: { id: branchId, nombre: selectedBranchName } } : null);
  return <ScreenContainer><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><AppHeader title="Movimientos" subtitle="Entradas, salidas y transferencias" /><SegmentedButtons value={type} onValueChange={chooseType} buttons={[{ value: "entrada", label: "Entrada", showSelectedCheck: false }, { value: "salida", label: "Salida", showSelectedCheck: false }, { value: "transferencia", label: "Transferencia", showSelectedCheck: false }]} /><Text variant="labelLarge" style={styles.label}>Sucursal {type === "transferencia" ? "de origen" : ""}</Text><View style={styles.chips}>{(branches.data ?? []).map((branch) => <Chip key={branch.id} selected={branch.id === branchId} showSelectedCheck={false} onPress={() => setBranchId(branch.id)}>{branch.nombre}</Chip>)}</View>{type === "transferencia" ? <><Text variant="labelLarge" style={styles.label}>Sucursal de destino</Text><View style={styles.chips}>{(branches.data ?? []).filter((branch) => branch.id !== branchId).map((branch) => <Chip key={branch.id} selected={branch.id === destinationId} showSelectedCheck={false} onPress={() => setDestinationId(branch.id)}>{branch.nombre}</Chip>)}</View></> : null}<Text variant="labelLarge" style={styles.label}>Producto</Text>{product ? <Card mode="outlined"><Card.Content style={styles.selected}><View style={styles.selectedCopy}><Text variant="titleMedium">{product.nombre}</Text><Text style={styles.muted}>{product.codigo} · Stock {inventoryItem?.cantidad ?? 0}</Text></View><Button compact onPress={() => setProduct(null)}>Quitar</Button></Card.Content></Card> : <><Searchbar value={search} onChangeText={setSearch} placeholder="Buscar por nombre o código" icon={() => <Search size={20} color={colors.textSecondary} />} clearIcon={() => <X size={20} color={colors.textSecondary} />} />{products.isFetching ? <ActivityIndicator style={styles.loader} /> : results.map((value) => <Card key={value.id} mode="outlined" style={styles.result} onPress={() => chooseProduct(value)}><Card.Content><Text variant="titleSmall">{value.nombre}</Text><Text style={styles.muted}>{value.codigo} · {value.categoria}</Text></Card.Content></Card>)}{deferredSearch.trim() && products.hasNextPage ? <Button mode="text" onPress={() => products.fetchNextPage()} loading={products.isFetchingNextPage}>Cargar más resultados</Button> : null}</>} {type !== "transferencia" ? <><TextInput mode="outlined" label="Cantidad" keyboardType="number-pad" value={quantity} onChangeText={setQuantity} style={styles.field} /><TextInput mode="outlined" label="Observación (opcional)" value={note} onChangeText={setNote} maxLength={500} style={styles.field} /></> : null}<HelperText type="error" visible={Boolean(formError || movement.error)}>{formError || (movement.error ? extraerMensajeError(movement.error, "No se pudo registrar el movimiento.") : "")}</HelperText>{type === "transferencia" ? <Button mode="contained" icon={() => <ArrowRightLeft size={18} color={colors.white} />} onPress={() => { if (!selectedTransferItem || !destinationId) { setFormError("Seleccioná producto, origen y destino."); return; } setTransferVisible(true); }} disabled={!product || !branchId || !destinationId}>Transferir stock</Button> : <Button mode="contained" onPress={submit} loading={movement.isPending} disabled={movement.isPending || !product}>Registrar {type}</Button>}</ScrollView><TransferModal visible={transferVisible} item={selectedTransferItem} branches={branches.data ?? []} initialDestinationId={destinationId} onDismiss={() => setTransferVisible(false)} loading={movement.isPending} error={movement.error ? extraerMensajeError(movement.error, "No se pudo registrar la transferencia.") : null} onSubmit={(params) => movement.mutate({ tipo: "transferencia", params }, { onSuccess: () => { setTransferVisible(false); setProduct(null); Alert.alert("Transferencia registrada", "La transferencia se registró correctamente."); } })} /></ScreenContainer>;
}

const styles = StyleSheet.create({ content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }, label: { marginTop: spacing.sm }, chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, selected: { flexDirection: "row", alignItems: "center", gap: spacing.md }, selectedCopy: { flex: 1, gap: spacing.xs }, muted: { color: colors.textSecondary }, result: { marginTop: spacing.sm }, loader: { paddingVertical: spacing.md }, field: { marginTop: spacing.md } });

