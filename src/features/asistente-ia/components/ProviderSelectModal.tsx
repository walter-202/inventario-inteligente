import { StyleSheet } from "react-native";
import { Button, Dialog, Portal, RadioButton, Text } from "react-native-paper";
import type { PreferredMode } from "../../../shared/lib/secureKeyStore";
import { colors, spacing } from "../../../shared/theme";

interface ProviderSelectModalProps {
  visible: boolean;
  value: PreferredMode;
  onSelect: (mode: PreferredMode) => void;
  onDismiss: () => void;
}

const OPCIONES: { id: PreferredMode; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Elige solo según velocidad y cuota" },
  { id: "groq", label: "Groq", hint: "El más rápido" },
  { id: "cerebras", label: "Cerebras", hint: "Cuota generosa" },
  { id: "openrouter", label: "OpenRouter", hint: "Modelos variados" },
  { id: "gemini", label: "Gemini", hint: "Google" },
  { id: "heuristic", label: "Offline", hint: "No interpreta: pide configurar IA" },
];

/** Configuración del motor: radio simple en diálogo, aplica al elegir. */
export function ProviderSelectModal({ visible, value, onSelect, onDismiss }: ProviderSelectModalProps) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>Motor de IA</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodySmall" style={styles.hint}>
            Con qué servicio se interpretan tus dictados y consultas.
          </Text>
          <RadioButton.Group
            onValueChange={(next) => onSelect(next as PreferredMode)}
            value={value}
          >
            {OPCIONES.map((opcion) => (
              <RadioButton.Item
                key={opcion.id}
                label={`${opcion.label} · ${opcion.hint}`}
                value={opcion.id}
                labelVariant="bodyMedium"
                style={styles.option}
              />
            ))}
          </RadioButton.Group>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cerrar</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { borderRadius: 16 },
  hint: { color: colors.textSecondary, marginBottom: spacing.xs },
  option: { paddingVertical: 0 },
});
