import { Bell, ChevronDown, Package } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { IconButton, Text, useTheme } from "react-native-paper";
import { colors, spacing } from "../theme";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  branchName?: string;
  onBranchPress?: () => void;
  onNotificationPress?: () => void;
}

export function AppHeader({ title, subtitle, branchName, onBranchPress, onNotificationPress }: AppHeaderProps) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <View style={styles.brandRow}>
        <View style={[styles.icon, { backgroundColor: theme.colors.primaryContainer }]}>
          <Package size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.copy}>
          <Text variant="titleLarge" style={styles.title}>{title}</Text>
          {subtitle ? <Text variant="bodySmall" style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {onNotificationPress ? <IconButton icon={() => <Bell size={20} color={theme.colors.onSurface} />} onPress={onNotificationPress} accessibilityLabel="Notificaciones" /> : null}
      </View>
      {branchName && onBranchPress ? (
        <Pressable style={styles.branch} onPress={onBranchPress} accessibilityRole="button">
          <Text variant="labelLarge" style={styles.branchLabel}>{branchName}</Text>
          <ChevronDown size={16} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, paddingBottom: spacing.lg },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1 },
  title: { color: colors.textPrimary, fontWeight: "700" },
  subtitle: { color: colors.textSecondary },
  branch: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: spacing.xs, paddingVertical: spacing.xs },
  branchLabel: { color: colors.textSecondary },
});
