import { StyleSheet, View } from "react-native";
import { Card, Text } from "react-native-paper";
import type { InventarioItem, Sucursal } from "../../../shared/types/domain";
import { BranchSelect } from "../../../shared/components/BranchSelect";
import { InventarioCard } from "./InventarioCard";
import { colors, spacing } from "../../../shared/theme";

interface StockBranchListProps {
  branches: Sucursal[];
  stock: InventarioItem[];
  selectedBranchId: number | null;
  onBranchChange: (id: number | null) => void;
  onItemPress?: (item: InventarioItem) => void;
}

export function StockBranchList({ branches, stock, selectedBranchId, onBranchChange, onItemPress }: StockBranchListProps) {
  const visible = selectedBranchId === null ? stock : stock.filter((item) => item.sucursal_id === selectedBranchId);
  return (
    <View style={styles.container}>
      <BranchSelect
        label="Sucursal"
        branches={branches}
        value={selectedBranchId}
        onChange={(id) => onBranchChange(id ?? null)}
        allowAll
        allLabel="Todas las sucursales"
      />
      {visible.length === 0 ? <Card mode="outlined"><Card.Content><Text style={styles.empty}>No hay inventario registrado en esta sucursal.</Text></Card.Content></Card> : visible.map((item) => <InventarioCard key={item.id} item={item} onPress={() => onItemPress?.(item)} />)}
    </View>
  );
}

const styles = StyleSheet.create({ container: { gap: spacing.sm }, empty: { color: colors.textSecondary } });
