import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { ArrowRightLeft, Package, Send, Truck } from "lucide-react-native";
import { ActivityIndicator, Button, Card, Chip, HelperText, SegmentedButtons, Text, TextInput } from "react-native-paper";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { AppHeader } from "../../../shared/components/AppHeader";
import { AppSearchbar } from "../../../shared/components/AppSearchbar";
import { BranchSelect } from "../../../shared/components/BranchSelect";
import { useConfirm } from "../../../shared/components/ConfirmDialog";
import { colors, spacing } from "../../../shared/theme";
import { extraerMensajeError } from "../../../shared/lib/utils";
import type { Producto } from "../../../shared/types/domain";
import { useSucursales } from "../../../shared/hooks/useSucursales";
import { useProductos } from "../../productos/hooks/useProductos";
import { buscarProductoPorCodigo } from "../../productos/api/productosApi";
import { useStockMultiSucursal } from "../hooks/useStockMultiSucursal";
import { useMovimientos } from "../hooks/useMovimientos";
import { MovimientoSucursalSchema } from "../api/inventarioApi";
import { useAuth } from "../../auth/hooks/useAuth";
import { can } from "../../auth/lib/permissions";
import { PermissionDenied } from "../../auth/components/PermissionDenied";
import { useActiveBranch } from "../../../shared/hooks/useActiveBranch";
import { useEmitirDespacho } from "../hooks/useDespachos";
import { useRegistrarMerma } from "../hooks/useMermas";
import { RecepcionDespachosList } from "../components/RecepcionDespachosList";
import { MOTIVOS_MERMA, MOTIVOS_MERMA_LABELS, type MotivoMerma } from "../../../shared/types/domain";
import { AlertOctagon } from "lucide-react-native";

type MovementType = "entrada" | "salida" | "merma" | "despacho" | "recepcion";

export function MovimientosScreen() {
  const { profile } = useAuth();
  if (!can(profile?.rol, "movements.write")) {
    return <PermissionDenied message="Tu rol puede consultar stock, pero no registrar movimientos ni despachos." />;
  }
  return <MovimientosForm />;
}

function MovimientosForm() {
  const { activeBranchId, canChangeBranch } = useActiveBranch();
  const branches = useSucursales();
  const stock = useStockMultiSucursal();
  const movement = useMovimientos();
  const emitirDespachoMutation = useEmitirDespacho();
  const registrarMermaMutation = useRegistrarMerma();

  const [type, setType] = useState<MovementType>("entrada");
  const [branchId, setBranchId] = useState<number | null>(null);
  const [destinationId, setDestinationId] = useState<number | null>(null);
  const [product, setProduct] = useState<Producto | null>(null);
  const [motivoMerma, setMotivoMerma] = useState<MotivoMerma>("rotura");
  const [search, setSearch] = useState("");
  const [deferredSearch, setDeferredSearch] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const { requestConfirm, dialog } = useConfirm();

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
    if (destinationId === null && branches.data?.length && branches.data.length > 1) {
      setDestinationId(branches.data[1].id);
    }
  }, [activeBranchId, branches.data, branchId, canChangeBranch, destinationId]);

  const products = useProductos({ q: deferredSearch || undefined });
  const inventoryItem = useMemo(
    () => stock.data?.find((item) => item.producto_id === product?.id && item.sucursal_id === branchId),
    [stock.data, product?.id, branchId],
  );
  const results = deferredSearch.trim() && !product ? products.data : [];
  const selectedBranchName = branches.data?.find((branch) => branch.id === branchId)?.nombre ?? "";
  const destinationBranchName = branches.data?.find((branch) => branch.id === destinationId)?.nombre ?? "";
  const originBranches = canChangeBranch
    ? branches.data ?? []
    : (branches.data ?? []).filter((branch) => branch.id === activeBranchId);

  const chooseType = (value: string) => {
    setType(value as MovementType);
    setFormError(null);
    setQuantity("1");
    setNote("");
  };

  const chooseProduct = (value: Producto) => {
    setProduct(value);
    setSearch("");
    setDeferredSearch("");
    setFormError(null);
  };

  const handleScanProduct = async (scannedCode: string) => {
    try {
      const found = await buscarProductoPorCodigo(scannedCode);
      if (found) {
        chooseProduct(found);
      } else {
        setSearch(scannedCode);
      }
    } catch {
      setSearch(scannedCode);
    }
  };

  const submitDespacho = async () => {
    if (!product || branchId === null || destinationId === null) {
      setFormError("Seleccioná la sucursal de origen, la de destino y el producto.");
      return;
    }
    if (branchId === destinationId) {
      setFormError("La sucursal de origen y destino no pueden ser la misma.");
      return;
    }
    const qtyNum = Number(quantity);
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
      setFormError("La cantidad debe ser un entero mayor o igual a 1.");
      return;
    }
    if (qtyNum > (inventoryItem?.cantidad ?? 0)) {
      setFormError(`Stock insuficiente en origen (${selectedBranchName}). Disponible: ${inventoryItem?.cantidad ?? 0}.`);
      return;
    }

    const ok = await requestConfirm({
      title: "Emitir orden de despacho",
      message: `Se despacharán ${qtyNum} unids de "${product.nombre}" (${product.codigo}) desde ${selectedBranchName} hacia ${destinationBranchName}.\n\nEl stock se descontará de ${selectedBranchName} y quedará registrado como "En tránsito" hasta que la sucursal destino confirme su recepción.`,
      confirmLabel: "Emitir despacho",
      danger: false,
    });
    if (!ok) return;

    setFormError(null);
    emitirDespachoMutation.mutate(
      {
        producto_id: product.id,
        sucursal_origen_id: branchId,
        sucursal_destino_id: destinationId,
        cantidad: qtyNum,
        observacion: note,
      },
      {
        onSuccess: (data) => {
          Alert.alert(
            "Despacho emitido con éxito",
            `Número de Guía: ${data?.numero_guia ?? "Registrado"}\nMercadería en tránsito hacia ${destinationBranchName}.`,
          );
          setProduct(null);
          setQuantity("1");
          setNote("");
          void stock.refetch();
        },
        onError: (error) => {
          setFormError(extraerMensajeError(error, "No se pudo emitir el despacho."));
        },
      },
    );
  };

  const submitMovimientoDirecto = async () => {
    if (!product || branchId === null) {
      setFormError("Seleccioná una sucursal y un producto.");
      return;
    }
    const parsed = MovimientoSucursalSchema.safeParse({
      producto_id: product.id,
      sucursal_id: branchId,
      cantidad: Number(quantity),
      observacion: note,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Revisá los datos.");
      return;
    }
    if (type === "salida" && parsed.data.cantidad > (inventoryItem?.cantidad ?? 0)) {
      setFormError(`Stock insuficiente. Disponible: ${inventoryItem?.cantidad ?? 0}.`);
      return;
    }
    const ok = await requestConfirm({
      title: `Confirmar ${type}`,
      message: `Se registra una ${type} de ${parsed.data.cantidad} × ${product.nombre} (${product.codigo}) en ${selectedBranchName}. El stock cambia de inmediato.`,
      confirmLabel: type === "entrada" ? "Registrar entrada" : "Registrar salida",
      danger: false,
    });
    if (!ok) return;

    setFormError(null);
    const input =
      type === "entrada"
        ? { tipo: "entrada" as const, params: parsed.data }
        : { tipo: "salida" as const, params: parsed.data };

    movement.mutate(input, {
      onSuccess: () => {
        Alert.alert("Movimiento registrado", "La operación se registró correctamente.");
        setProduct(null);
        setQuantity("1");
        setNote("");
        void stock.refetch();
      },
      onError: (error) => {
        setFormError(extraerMensajeError(error, "No se pudo registrar el movimiento."));
      },
    });
  };

  const isDespacho = type === "despacho";
  const isRecepcion = type === "recepcion";
  const isMerma = type === "merma";



  const submitMerma = async () => {
    if (!product || branchId === null) {
      setFormError("Seleccioná una sucursal y un producto para dar de baja.");
      return;
    }
    const qtyNum = Number(quantity);
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
      setFormError("La cantidad a dar de baja debe ser un entero mayor a 0.");
      return;
    }
    if (qtyNum > (inventoryItem?.cantidad ?? 0)) {
      setFormError(`Stock insuficiente en ${selectedBranchName}. Disponible: ${inventoryItem?.cantidad ?? 0}.`);
      return;
    }

    const ok = await requestConfirm({
      title: "Registrar baja por merma",
      message: `Se dará de baja definitiva a ${qtyNum} unids de "${product.nombre}" (${product.codigo}) en ${selectedBranchName}.\n\nMotivo: ${MOTIVOS_MERMA_LABELS[motivoMerma]}.\n\nEsta acción descontará el stock de inmediato y quedará auditada en el Kardex.`,
      confirmLabel: "Confirmar baja por merma",
      danger: true,
    });
    if (!ok) return;

    setFormError(null);
    registrarMermaMutation.mutate(
      {
        sucursal_id: branchId,
        producto_id: product.id,
        cantidad: qtyNum,
        motivo: motivoMerma,
        observacion: note,
      },
      {
        onSuccess: (data) => {
          Alert.alert(
            "Merma registrada con éxito",
            `Baja de ${qtyNum} unids procesada correctamente.\nStock restante en sucursal: ${data?.stock_restante ?? 0}.`,
          );
          setProduct(null);
          setQuantity("1");
          setNote("");
          void stock.refetch();
        },
        onError: (error) => {
          setFormError(extraerMensajeError(error, "No se pudo registrar la merma."));
        },
      },
    );
  };

  return (
    <ScreenContainer>
      {dialog}
      <View style={styles.screen}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <AppHeader
            title="Movimientos y Despachos"
            subtitle={
              isRecepcion
                ? "Confirmación de mercadería en destino"
                : isDespacho
                ? "Emisión de despacho en tránsito"
                : isMerma
                ? "Baja justificada de prendas dañadas"
                : "Entradas y salidas de stock"
            }
          />

          <SegmentedButtons
            value={type}
            onValueChange={chooseType}
            buttons={[
              { value: "entrada", label: "Entrada", showSelectedCheck: false },
              { value: "salida", label: "Salida", showSelectedCheck: false },
              { value: "merma", label: "Merma", showSelectedCheck: false },
              { value: "despacho", label: "Despacho", showSelectedCheck: false },
              { value: "recepcion", label: "Recepción", showSelectedCheck: false },
            ]}
          />

          {isRecepcion ? (
            /* RF-07: Flujo de Recepción en Destino */
            <>
              <Text variant="labelLarge" style={styles.label}>
                Sucursal que recibe mercadería
              </Text>
              <BranchSelect
                label="Sucursal receptora"
                branches={originBranches}
                value={branchId}
                onChange={(id) => {
                  if (id !== undefined) setBranchId(id);
                }}
              />
              <RecepcionDespachosList
                sucursalDestinoId={branchId}
                onSuccess={() => {
                  Alert.alert("Recepción confirmada", "El stock ingresó correctamente al inventario.");
                  void stock.refetch();
                }}
              />
            </>
          ) : (
            /* Flujos de Entrada, Salida y Despacho */
            <>
              <Text variant="labelLarge" style={styles.label}>
                {isDespacho ? "Sucursal de origen (Almacén Central / Tienda)" : "Sucursal"}
              </Text>
              <BranchSelect
                label={isDespacho ? "Sucursal de origen" : "Sucursal"}
                branches={originBranches}
                value={branchId}
                onChange={(id) => {
                  if (id !== undefined) setBranchId(id);
                }}
              />

              {isDespacho ? (
                <>
                  <Text variant="labelLarge" style={styles.label}>
                    Sucursal de destino (Receptora)
                  </Text>
                  <BranchSelect
                    label="Sucursal de destino"
                    branches={(branches.data ?? []).filter((b) => b.id !== branchId)}
                    value={destinationId}
                    onChange={(id) => setDestinationId(id ?? null)}
                  />
                </>
              ) : null}

              {isMerma ? (
                <>
                  <Text variant="labelLarge" style={styles.label}>
                    Motivo del daño o baja
                  </Text>
                  <View style={styles.motivosGrid}>
                    {MOTIVOS_MERMA.map((m) => {
                      const isSelected = motivoMerma === m;
                      return (
                        <Chip
                          key={m}
                          selected={isSelected}
                          onPress={() => setMotivoMerma(m)}
                          style={[styles.motivoChip, isSelected && styles.motivoChipSelected]}
                          textStyle={isSelected ? styles.motivoChipTextSelected : undefined}
                          compact
                        >
                          {MOTIVOS_MERMA_LABELS[m]}
                        </Chip>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <Text variant="labelLarge" style={styles.label}>
                Producto a {isDespacho ? "despachar" : isMerma ? "dar de baja" : type}
              </Text>

              {product ? (
                <Card mode="outlined" style={styles.selectedCard}>
                  <Card.Content style={styles.selectedContent}>
                    <View style={styles.selectedCopy}>
                      <Text variant="titleMedium">{product.nombre}</Text>
                      <Text style={styles.muted}>
                        {product.codigo} · Stock en sucursal: {inventoryItem?.cantidad ?? 0}
                      </Text>
                    </View>
                    <Button compact onPress={() => setProduct(null)}>
                      Cambiar
                    </Button>
                  </Card.Content>
                </Card>
              ) : (
                <>
                  <AppSearchbar
                    value={search}
                    onChangeText={setSearch}
                    onScan={handleScanProduct}
                    placeholder="Buscar por nombre o código"
                    scanTitle={`Escanear para ${isDespacho ? "despacho" : isMerma ? "merma" : type}`}
                  />
                  {products.isFetching ? (
                    <ActivityIndicator style={styles.loader} />
                  ) : (
                    results.map((value) => (
                      <Card
                        key={value.id}
                        mode="outlined"
                        style={styles.result}
                        onPress={() => chooseProduct(value)}
                      >
                        <Card.Content>
                          <Text variant="titleSmall">{value.nombre}</Text>
                          <Text style={styles.muted}>
                            {value.codigo} · {value.categoria}
                          </Text>
                        </Card.Content>
                      </Card>
                    ))
                  )}
                  {deferredSearch.trim() && products.hasNextPage ? (
                    <Button
                      mode="text"
                      onPress={() => products.fetchNextPage()}
                      loading={products.isFetchingNextPage}
                    >
                      Cargar más resultados
                    </Button>
                  ) : null}
                </>
              )}

              <TextInput
                mode="outlined"
                dense
                label={isDespacho ? "Cantidad a despachar" : isMerma ? "Cantidad a dar de baja" : "Cantidad"}
                keyboardType="number-pad"
                value={quantity}
                onChangeText={setQuantity}
                style={styles.field}
              />

              <TextInput
                mode="outlined"
                dense
                label={
                  isDespacho
                    ? "Observación / Nro de bulto o caja"
                    : isMerma
                    ? "Detalle específico del daño (ej: mancha de tinta, costura zafada)"
                    : "Observación (opcional)"
                }
                value={note}
                onChangeText={setNote}
                maxLength={500}
                style={styles.field}
              />

              <HelperText
                type="error"
                visible={Boolean(
                  formError ||
                    movement.error ||
                    emitirDespachoMutation.error ||
                    registrarMermaMutation.error,
                )}
              >
                {formError ||
                  (movement.error
                    ? extraerMensajeError(movement.error, "No se pudo registrar el movimiento.")
                    : "") ||
                  (emitirDespachoMutation.error
                    ? extraerMensajeError(emitirDespachoMutation.error, "No se pudo emitir el despacho.")
                    : "") ||
                  (registrarMermaMutation.error
                    ? extraerMensajeError(registrarMermaMutation.error, "No se pudo registrar la merma.")
                    : "")}
              </HelperText>
            </>
          )}
        </ScrollView>

        {!isRecepcion ? (
          <View style={styles.footer}>
            {isDespacho ? (
              <Button
                mode="contained"
                icon={() => <Truck size={18} color={colors.white} />}
                onPress={submitDespacho}
                loading={emitirDespachoMutation.isPending}
                disabled={emitirDespachoMutation.isPending || !product || !branchId || !destinationId}
                style={styles.submitButton}
                contentStyle={styles.submitButtonContent}
              >
                Emitir Despacho (En Tránsito)
              </Button>
            ) : isMerma ? (
              <Button
                mode="contained"
                buttonColor={colors.danger}
                icon={() => <AlertOctagon size={18} color={colors.white} />}
                onPress={submitMerma}
                loading={registrarMermaMutation.isPending}
                disabled={registrarMermaMutation.isPending || !product || !branchId}
                style={styles.submitButton}
                contentStyle={styles.submitButtonContent}
              >
                Registrar baja por merma
              </Button>
            ) : (
              <Button
                mode="contained"
                onPress={submitMovimientoDirecto}
                loading={movement.isPending}
                disabled={movement.isPending || !product}
                style={styles.submitButton}
                contentStyle={styles.submitButtonContent}
              >
                Registrar {type}
              </Button>
            )}
          </View>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  submitButton: { borderRadius: 14 },
  submitButtonContent: { height: 52 },
  label: { marginTop: spacing.xs, fontWeight: "700", color: colors.textPrimary },
  selectedCard: { backgroundColor: colors.surface },
  selectedContent: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  selectedCopy: { flex: 1, gap: 2 },
  muted: { color: colors.textSecondary },
  result: { marginTop: spacing.sm },
  loader: { paddingVertical: spacing.md },
  field: { marginTop: spacing.xs },
  motivosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  motivoChip: {
    backgroundColor: colors.surfaceSecondary,
  },
  motivoChipSelected: {
    backgroundColor: colors.danger,
  },
  motivoChipTextSelected: {
    color: colors.white,
    fontWeight: "700",
  },
});
