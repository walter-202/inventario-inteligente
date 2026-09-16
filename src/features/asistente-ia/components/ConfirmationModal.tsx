import { Portal, Modal, Button, Text } from "react-native-paper";
import { StyleSheet, View } from "react-native";
import { colors, spacing } from "../../../shared/theme";

export function ConfirmationModal({ visible, title, description, loading = false, onDismiss, onConfirm }: { visible: boolean; title: string; description: string; loading?: boolean; onDismiss: () => void; onConfirm: () => void }) {
  return <Portal><Modal visible={visible} onDismiss={loading ? undefined : onDismiss} contentContainerStyle={styles.modal}><Text variant="titleLarge">{title}</Text><Text style={styles.description}>{description}</Text><View style={styles.actions}><Button onPress={onDismiss} disabled={loading}>Corregir</Button><Button mode="contained" onPress={onConfirm} loading={loading} disabled={loading}>Confirmar</Button></View></Modal></Portal>;
}
const styles = StyleSheet.create({ modal: { margin: spacing.lg, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: 16, gap: spacing.md }, description: { color: colors.textSecondary, lineHeight: 22 }, actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm } });
