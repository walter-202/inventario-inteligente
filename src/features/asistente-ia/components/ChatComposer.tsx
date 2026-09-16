import { StyleSheet, View } from "react-native";
import { Button, HelperText, IconButton, Text, TextInput } from "react-native-paper";
import { Mic, Send, Square } from "lucide-react-native";
import { SuggestionChips } from "./SuggestionChips";
import { colors, spacing } from "../../../shared/theme";

interface ChatComposerProps {
  transcript: string;
  recording: boolean;
  interpreting: boolean;
  isAvailable: boolean;
  permissionDenied: boolean;
  permissionError?: string | null;
  error?: string | null;
  onTranscriptChange: (value: string) => void;
  onStart: () => void;
  onStop: () => void;
  onSend: () => void;
  onRequestPermission?: () => void;
}

const SUGERENCIAS = [
  "Vender 2 Jean Mom Fit",
  "¿Cuánto stock queda de Jean Mom Fit?",
  "¿Cuánto se vendió hoy?",
  "Stock de Vestido Floral en San Miguel",
  "Sino, corrige a 5 unidades",
];

/** Entrada estilo chat: texto o dictado + enviar. Sin modal. */
export function ChatComposer({
  transcript,
  recording,
  interpreting,
  isAvailable,
  permissionDenied,
  permissionError,
  error,
  onTranscriptChange,
  onStart,
  onStop,
  onSend,
  onRequestPermission,
}: ChatComposerProps) {
  if (permissionDenied || permissionError) {
    return (
      <View style={styles.box}>
        <Text variant="bodyMedium" style={styles.copy}>
          {permissionError ?? "Necesitamos permiso del micrófono para registrar operaciones por voz."}
        </Text>
        <Button mode="contained" onPress={onRequestPermission}>
          {permissionError ? "Reintentar permiso" : "Permitir micrófono"}
        </Button>
      </View>
    );
  }
  return (
    <View style={styles.box}>
      <SuggestionChips suggestions={SUGERENCIAS} onSelect={onTranscriptChange} />
      <View style={styles.row}>
        {isAvailable ? (
          <IconButton
            mode="contained-tonal"
            icon={() => (recording ? <Square size={20} /> : <Mic size={20} />)}
            onPress={recording ? onStop : onStart}
          />
        ) : null}
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
          mode="contained"
          icon={() => <Send size={20} />}
          onPress={onSend}
          disabled={interpreting || !transcript.trim()}
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
  copy: { color: colors.textSecondary, lineHeight: 22 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: spacing.xs },
  input: { flex: 1, backgroundColor: colors.surface, maxHeight: 110 },
});
