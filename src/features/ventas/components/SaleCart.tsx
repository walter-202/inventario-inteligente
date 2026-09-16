import { Minus, Plus, Trash2 } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Card, IconButton, Text } from "react-native-paper";
import type { Producto } from "../../../shared/types/domain";
import { formatearPrecio } from "../../../shared/lib/utils";
import { useConfirm } from "../../../shared/components/ConfirmDialog";
import { colors, spacing } from "../../../shared/theme";

export interface CartItem { producto: Producto; cantidad: number; stock: number }
interface SaleCartProps { items: CartItem[]; onIncrement: (id: number) => void; onDecrement: (id: number) => void; onRemove: (id: number) => void }

export function SaleCart({ items, onIncrement, onDecrement, onRemove }: SaleCartProps) {
  const { requestConfirm, dialog } = useConfirm();
  if (items.length === 0) return <Text style={styles.empty}>Agregá productos para comenzar la venta.</Text>;
  const quitar = async (id: number, nombre: string) => {
    const ok = await requestConfirm({
      title: "Quitar del ticket",
      message: `"${nombre}" sale del ticket actual. Podés agregarlo de nuevo con el buscador o el escáner.`,
      confirmLabel: "Quitar",
    });
    if (ok) onRemove(id);
  };
  return <View style={styles.list}>{dialog}{items.map((item) => <Card key={item.producto.id} mode="outlined"><Card.Content style={styles.row}><View style={styles.copy}><Text variant="titleSmall" numberOfLines={1}>{item.producto.nombre}</Text><Text variant="bodySmall" style={styles.muted}>{formatearPrecio(item.producto.precio)} · Stock {item.stock}</Text></View><View style={styles.stepper}><IconButton icon={() => <Minus size={16} />} size={28} onPress={() => onDecrement(item.producto.id)} disabled={item.cantidad <= 1} /><Text variant="titleMedium">{item.cantidad}</Text><IconButton icon={() => <Plus size={16} />} size={28} onPress={() => onIncrement(item.producto.id)} disabled={item.cantidad >= item.stock} /><IconButton icon={() => <Trash2 size={16} color={colors.danger} />} size={28} onPress={() => void quitar(item.producto.id, item.producto.nombre)} accessibilityLabel={`Quitar ${item.producto.nombre} del ticket`} /></View><Text variant="titleSmall" style={styles.subtotal}>{formatearPrecio(item.producto.precio * item.cantidad)}</Text></Card.Content></Card>)}</View>;
}

const styles = StyleSheet.create({ list: { gap: spacing.sm }, row: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, copy: { flex: 1, gap: 2 }, muted: { color: colors.textSecondary }, stepper: { flexDirection: "row", alignItems: "center" }, subtotal: { color: colors.primary }, empty: { color: colors.textSecondary, paddingVertical: spacing.md } });
