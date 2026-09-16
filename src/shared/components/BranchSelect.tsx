import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Menu, TextInput } from "react-native-paper";
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
        <Pressable onPress={() => !isDisabled && setVisible(true)} accessibilityRole="button">
          <View pointerEvents="none">
            <TextInput
              mode="outlined"
              dense
              label={label}
              value={display}
              placeholder={empty ? "Sin sucursales" : placeholder}
              editable={false}
              disabled={isDisabled}
              left={<TextInput.Icon icon={() => <Store size={18} color={colors.textSecondary} />} />}
              right={<TextInput.Icon icon={() => <ChevronDown size={20} color={colors.textSecondary} />} />}
            />
          </View>
        </Pressable>
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
});
