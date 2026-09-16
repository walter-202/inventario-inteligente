import { StyleSheet, View } from "react-native";
import { Button, HelperText, IconButton, Text, TextInput } from "react-native-paper";
import { AudioLines, Mic, Send, Square } from "lucide-react-native";
import { SuggestionChips } from "./SuggestionChips";
import { colors, spacing } from "../../../shared/theme";

interface ChatComposerProps {
  transcript: string;
  recording: boolean;
  interpreting: boolean;
  permissionDenied: boolean;
  permissionError?: string | null;
  error?: string | null;
  onTranscriptChange: (value: string) => void;
  onStart: () => void;
  onStop: () => void;
  onSend: () => void;
  onVoiceMode: () => void;
  onRequestPermission?: () => void;
}

const SUGERENCIAS = [
  "Vender 2 Jean Mom Fit",
  "¿Cuánto stock queda de Jean Mom Fit?",
  "¿Cuánto se vendió hoy?",
  "Stock de Vestido Floral en San Miguel",
  "Sino, corrige a 5 unidades",
];

/**
 * Entrada estilo chat: el micrófono siempre se ve (si no hay módulo nativo
 * o permiso, al tocarlo explica cómo seguir en lugar de esconderse).
 */
export function ChatComposer({
  transcript,
  recording,
  interpreting,
  permissionDenied,
  permissionError,
  error,
  onTranscriptChange,
  onStart,
  onStop,
  onSend,
  onVoiceMode,
  onRequestPermission,
}: ChatComposerProps) {
  return (
    <View style={styles.box}>
      {permissionDenied || permissionError ? (
        <View style={styles.permissionRow}>
          <Text variant="bodySmall" style={styles.permissionText}>
            {permissionError ?? "Activá el micrófono para dictar por voz."}
          </Text>
          <Button compact mode="text" onPress={onRequestPermission}>
            Permitir
          </Button>
        </View>
      ) : null}
      <SuggestionChips suggestions={SUGERENCIAS} onSelect={onTranscriptChange} />
      <View style={styles.row}>
        <IconButton
          mode="contained-tonal"
          icon={() => (recording ? <Square size={20} /> : <Mic size={20} />)}
          onPress={recording ? onStop : onStart}
          accessibilityLabel={recording ? "Detener dictado" : "Dictar por voz"}
        />
        <TextInput
          mode="outlined"
          style={styles.input}
          placeholder="Escribí o dictá: productos, stock o ventas…"
          multiline
          value={transcript}
          onChangeText={onTranscriptChange}
          onSubmitEditing={onSend}
        />
        <IconButton
          mode="outlined"
          icon={() => <AudioLines size={20} />}
          onPress={onVoiceMode}
          accessibilityLabel="Abrir modo voz"
        />
        <IconButton
          mode="contained"
          icon={() => <Send size={20} />}
          onPress={onSend}
          disabled={interpreting || !transcript.trim()}
          accessibilityLabel="Enviar mensaje"
        />
      </View>
      <HelperText type="error" visible={Boolean(error)}>
        {error}
      </HelperText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  permissionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xs },
  permissionText: { flex: 1, color: colors.textSecondary },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  input: { flex: 1, backgroundColor: colors.surface, maxHeight: 110 },
});
