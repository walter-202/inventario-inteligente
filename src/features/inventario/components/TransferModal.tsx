import { useEffect, useState } from "react";
import { Portal, Modal, Button, HelperText, SegmentedButtons, Text, TextInput } from "react-native-paper";
import { StyleSheet, View } from "react-native";
import { MovimientoTransferenciaSchema } from "../api/inventarioApi";
import type { InventarioItem, Sucursal } from "../../../shared/types/domain";
import { colors, spacing } from "../../../shared/theme";

interface TransferModalProps {
  visible: boolean;
  item: InventarioItem | null;
  branches: Sucursal[];
  initialDestinationId?: number | null;
  onDismiss: () => void;
  loading?: boolean;
  error?: string | null;
  onSubmit: (input: { producto_id: number; sucursal_origen_id: number; sucursal_destino_id: number; cantidad: number; observacion?: string }) => void;
}

export function TransferModal({ visible, item, branches, initialDestinationId = null, onDismiss, loading = false, error, onSubmit }: TransferModalProps) {
  const [destination, setDestination] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  useEffect(() => {
    const fallback = branches.find((branch) => branch.id !== item?.sucursal_id)?.id ?? null;
    const selected = initialDestinationId !== null && initialDestinationId !== item?.sucursal_id && branches.some((branch) => branch.id === initialDestinationId)
      ? initialDestinationId
      : fallback;
    setDestination(selected);
    setQuantity("1");
    setNote("");
    setValidationError(null);
  }, [item, branches, initialDestinationId]);
  const submit = () => {
    if (!item || destination === null) return;
    const result = MovimientoTransferenciaSchema.safeParse({ producto_id: item.producto_id, sucursal_origen_id: item.sucursal_id, sucursal_destino_id: destination, cantidad: Number(quantity), observacion: note });
    if (!result.success) { setValidationError(result.error.issues[0]?.message ?? "Revisá los datos de la transferencia."); return; }
    if (result.data.cantidad > item.cantidad) { setValidationError(`Stock insuficiente. Disponible: ${item.cantidad}.`); return; }
    setValidationError(null);
    onSubmit(result.data);
  };
  return <Portal><Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}><Text variant="titleLarge">Transferir stock</Text><Text variant="bodyMedium" style={styles.copy}>{item?.producto.nombre ?? "Seleccioná un producto"}</Text><SegmentedButtons value={destination ? String(destination) : ""} onValueChange={(value) => setDestination(Number(value))} buttons={branches.filter((branch) => branch.id !== item?.sucursal_id).map((branch) => ({ value: String(branch.id), label: branch.nombre, showSelectedCheck: false }))} density="small" /><TextInput mode="outlined" label="Cantidad" keyboardType="number-pad" value={quantity} onChangeText={setQuantity} /><TextInput mode="outlined" label="Observación (opcional)" value={note} onChangeText={setNote} maxLength={500} /><HelperText type="error" visible={Boolean(validationError || error)}>{validationError || error}</HelperText><View style={styles.actions}><Button onPress={onDismiss} disabled={loading}>Cancelar</Button><Button mode="contained" onPress={submit} loading={loading} disabled={loading || !item || destination === null}>Transferir</Button></View></Modal></Portal>;
}

const styles = StyleSheet.create({ modal: { margin: spacing.lg, padding: spacing.lg, gap: spacing.md, backgroundColor: colors.surface, borderRadius: 16 }, copy: { color: colors.textSecondary }, actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm } });
