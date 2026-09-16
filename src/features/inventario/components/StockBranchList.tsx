import { ScrollView, StyleSheet, View } from "react-native";
import { Card, Chip, Text } from "react-native-paper";
import type { InventarioItem, Sucursal } from "../../../shared/types/domain";
import { InventarioCard } from "./InventarioCard";
import { colors, spacing } from "../../../shared/theme";

interface StockBranchListProps {
  branches: Sucursal[];
  stock: InventarioItem[];
  selectedBranchId: number | null;
  onBranchChange: (id: number) => void;
  onItemPress?: (item: InventarioItem) => void;
}

export function StockBranchList({ branches, stock, selectedBranchId, onBranchChange, onItemPress }: StockBranchListProps) {
  const visible = selectedBranchId === null ? stock : stock.filter((item) => item.sucursal_id === selectedBranchId);
  return <View style={styles.container}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{branches.map((branch) => <Chip key={branch.id} selected={branch.id === selectedBranchId} showSelectedCheck={false} onPress={() => onBranchChange(branch.id)}>{branch.nombre}</Chip>)}</ScrollView>{visible.length === 0 ? <Card mode="outlined"><Card.Content><Text style={styles.empty}>No hay inventario registrado en esta sucursal.</Text></Card.Content></Card> : visible.map((item) => <InventarioCard key={item.id} item={item} onPress={() => onItemPress?.(item)} />)}</View>;
}

const styles = StyleSheet.create({ container: { gap: spacing.sm }, chips: { gap: spacing.sm, paddingRight: spacing.lg }, empty: { color: colors.textSecondary } });
