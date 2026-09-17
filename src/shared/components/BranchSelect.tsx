import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Menu, Text, TouchableRipple } from "react-native-paper";
import { Check, ChevronDown, Store } from "lucide-react-native";
import { formatBranchName } from "../lib/branchNames";
import { colors, spacing } from "../theme";

export interface BranchOption {
  id: number;
  nombre: string;
}

interface BranchSelectProps {
  label: string;
  branches: BranchOption[];
  /** null/undefined = sin selección ("Todas" cuando `allowAll`). */
  value: number | null | undefined;
  onChange: (id: number | undefined) => void;
  allowAll?: boolean;
  allLabel?: string;
  disabled?: boolean;
  /** Oculta una opción (ej: origen en el destino de una transferencia). */
  excludeId?: number | null;
  placeholder?: string;
}

/**
 * Select de sucursal para toda la app (Paper `Menu`, que es el equivalente a
 * un select nativo en react-native-paper). Reemplaza las pills: con 5+
 * sucursales de nombre largo las pills desbordan y son mala UX.
 */
export function BranchSelect({
  label,
  branches,
  value,
  onChange,
  allowAll = false,
  allLabel = "Todas las sucursales",
  disabled = false,
  excludeId = null,
  placeholder = "Elegí una sucursal",
}: BranchSelectProps) {
  const [visible, setVisible] = useState(false);
  const options = (branches ?? []).filter((branch) => branch.id !== excludeId);
  const selected = options.find((branch) => branch.id === value) ?? null;
  const display = selected ? formatBranchName(selected.nombre) : value == null && allowAll ? allLabel : "";
  const empty = options.length === 0 && !allowAll;
  const isDisabled = disabled || empty;

  const choose = (id: number | undefined) => {
    setVisible(false);
    onChange(id);
  };

  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={
        <TouchableRipple
          onPress={() => !isDisabled && setVisible(true)}
          disabled={isDisabled}
          style={[styles.field, isDisabled && styles.fieldDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${display || placeholder}`}
        >
          <View pointerEvents="none" style={styles.fieldInner}>
            <Store size={18} color={isDisabled ? colors.textMuted : colors.textSecondary} />
            <View style={styles.fieldCopy}>
              <Text variant="labelSmall" style={styles.fieldLabel}>
                {label}
              </Text>
              <Text variant="bodyLarge" style={[styles.fieldValue, !display && styles.fieldPlaceholder]} numberOfLines={1}>
                {display || (empty ? "Sin sucursales" : placeholder)}
              </Text>
            </View>
            <ChevronDown size={20} color={colors.textSecondary} />
          </View>
        </TouchableRipple>
      }
      contentStyle={styles.menu}
    >
      {allowAll ? (
        <Menu.Item
          title={allLabel}
          onPress={() => choose(undefined)}
          leadingIcon={() => (value == null ? <Check size={18} color={colors.primary} /> : <View style={styles.iconSpacer} />)}
        />
      ) : null}
      {options.map((branch) => {
        const isSelected = branch.id === value;
        return (
          <Menu.Item
            key={branch.id}
            title={formatBranchName(branch.nombre)}
            onPress={() => choose(branch.id)}
            leadingIcon={() => (isSelected ? <Check size={18} color={colors.primary} /> : <View style={styles.iconSpacer} />)}
          />
        );
      })}
    </Menu>
  );
}

const styles = StyleSheet.create({
  menu: { minWidth: 220 },
  iconSpacer: { width: spacing.lg },
  field: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  fieldDisabled: { opacity: 0.6 },
  fieldInner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  fieldCopy: { flex: 1, gap: 0 },
  fieldLabel: { color: colors.textSecondary },
  fieldValue: { color: colors.textPrimary },
  fieldPlaceholder: { color: colors.textMuted },
});
