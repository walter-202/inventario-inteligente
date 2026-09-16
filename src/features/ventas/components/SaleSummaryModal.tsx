import { Portal, Modal, Button, HelperText, Text } from "react-native-paper";
import { StyleSheet, View } from "react-native";
import type { CartItem } from "./SaleCart";
import { formatearPrecio } from "../../../shared/lib/utils";
import { colors, spacing } from "../../../shared/theme";

interface SaleSummaryModalProps { visible: boolean; branchName: string; paymentLabel: string; items: CartItem[]; loading?: boolean; error?: string | null; onDismiss: () => void; onConfirm: () => void }
export function SaleSummaryModal({ visible, branchName, paymentLabel, items, loading = false, error, onDismiss, onConfirm }: SaleSummaryModalProps) {
  const total = items.reduce((sum, item) => sum + item.producto.precio * item.cantidad, 0);
  return <Portal><Modal visible={visible} onDismiss={loading ? undefined : onDismiss} contentContainerStyle={styles.modal}><Text variant="titleLarge">Confirmar venta</Text><Text variant="bodyMedium" style={styles.copy}>Sucursal: {branchName}{"\n"}Pago: {paymentLabel}{"\n"}Productos: {items.length}</Text><View style={styles.lines}>{items.map((item) => <View key={item.producto.id} style={styles.line}><Text style={styles.lineName}>{item.cantidad} × {item.producto.nombre}</Text><Text>{formatearPrecio(item.producto.precio * item.cantidad)}</Text></View>)}</View><View style={styles.total}><Text variant="titleMedium">Total</Text><Text variant="headlineSmall" style={styles.totalValue}>{formatearPrecio(total)}</Text></View><HelperText type="error" visible={Boolean(error)}>{error}</HelperText><View style={styles.actions}><Button onPress={onDismiss} disabled={loading}>Cancelar</Button><Button mode="contained" onPress={onConfirm} loading={loading} disabled={loading}>Confirmar venta</Button></View></Modal></Portal>;
}

const styles = StyleSheet.create({ modal: { margin: spacing.lg, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: 16, gap: spacing.md }, copy: { color: colors.textSecondary }, lines: { gap: spacing.sm }, line: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md }, lineName: { flex: 1 }, total: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }, totalValue: { color: colors.primary }, actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm } });
