import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, HelperText, IconButton, Text, TextInput } from "react-native-paper";
import { AudioLines, Mic, RotateCcw, ScanBarcode, Send, Square } from "lucide-react-native";
import { SuggestionChips } from "./SuggestionChips";
import { CameraScanModal } from "../../../shared/components/CameraScanModal";
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
  onRetry?: () => void;
  retryAvailable?: boolean;
  onVoiceMode: () => void;
  onRequestPermission?: () => void;
  onScanCode?: (code: string) => void;
  showSuggestions?: boolean;
  suggestions?: string[];
}

const SUGERENCIAS = [
  "¿Cuánto se vendió hoy?",
  "¿Qué productos tienen stock bajo?",
  "Registrar un producto nuevo",
  "Vender 2 <producto>",
  "¿Qué podés hacer?",
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
  onRetry,
  retryAvailable = false,
  onVoiceMode,
  onRequestPermission,
  onScanCode,
  showSuggestions = false,
  suggestions,
}: ChatComposerProps) {
  const [scannerVisible, setScannerVisible] = useState(false);

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
      {showSuggestions ? (
        <SuggestionChips suggestions={suggestions && suggestions.length > 0 ? suggestions : SUGERENCIAS} onSelect={onTranscriptChange} />
      ) : null}
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
          right={
            <TextInput.Icon
              icon={() => <ScanBarcode size={20} color={colors.primary} />}
              onPress={() => setScannerVisible(true)}
              accessibilityLabel="Escanear código de barras con la cámara"
            />
          }
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
      {retryAvailable && onRetry ? (
        <View style={styles.retryRow}>
          <Button
            compact
            mode="contained-tonal"
            icon={({ color, size }) => <RotateCcw size={size} color={color} />}
            onPress={onRetry}
            disabled={interpreting}
            accessibilityLabel="Reintentar mensaje anterior"
          >
            Reintentar mensaje anterior
          </Button>
        </View>
      ) : null}
      <HelperText type="info" visible={interpreting}>
        El asistente sigue trabajando. Esperá a que termine esta consulta.
      </HelperText>
      <HelperText type="error" visible={!interpreting && Boolean(error)}>
        {error}
      </HelperText>

      <CameraScanModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScan={(code) => {
          if (onScanCode) {
            onScanCode(code);
            return;
          }
          onTranscriptChange(`Código de barras escaneado: ${code}`);
        }}
        title="Escanear código de barras"
      />
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
  retryRow: { alignItems: "flex-end", paddingHorizontal: spacing.xs },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  input: { flex: 1, backgroundColor: colors.surface, maxHeight: 110 },
});
