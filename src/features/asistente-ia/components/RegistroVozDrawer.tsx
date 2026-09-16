import { useEffect } from "react";
import { Portal, Modal, Button, HelperText, IconButton, Text, TextInput } from "react-native-paper";
import { StyleSheet, View } from "react-native";
import { Mic, Square, X } from "lucide-react-native";
import { SuggestionChips } from "./SuggestionChips";
import { colors, spacing } from "../../../shared/theme";

interface RegistroVozDrawerProps { visible: boolean; transcript: string; recording: boolean; interpreting?: boolean; error?: string | null; permissionError?: string | null; onTranscriptChange: (value: string) => void; onStart: () => void; onStop: () => void; onInterpret: () => void; onDismiss: () => void; onRequestPermission?: () => void; permissionDenied?: boolean }
export function RegistroVozDrawer({ visible, transcript, recording, interpreting = false, error, permissionError, onTranscriptChange, onStart, onStop, onInterpret, onDismiss, onRequestPermission, permissionDenied = false }: RegistroVozDrawerProps) {
  useEffect(() => { if (!visible && recording) onStop(); }, [visible, recording, onStop]);
  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        <View style={styles.header}>
          <Text variant="titleLarge">Registro por voz</Text>
          <IconButton icon={() => <X size={20} />} onPress={onDismiss} />
        </View>
        {permissionDenied || permissionError ? (
          <>
            <Text style={styles.copy}>
              {permissionError ?? "Necesitamos permiso del micrófono para registrar operaciones por voz."}
            </Text>
            <Button mode="contained" onPress={onRequestPermission}>
              {permissionError ? "Reintentar permiso" : "Permitir micrófono"}
            </Button>
          </>
        ) : (
          <>
            <TextInput
              mode="outlined"
              label="Texto reconocido"
              multiline
              value={transcript}
              onChangeText={onTranscriptChange}
            />
            <SuggestionChips
              suggestions={["Registrar una venta", "Vender dos productos"]}
              onSelect={onTranscriptChange}
            />
            <View style={styles.controls}>
              <IconButton
                mode="contained-tonal"
                icon={() => recording ? <Square size={20} /> : <Mic size={20} />}
                onPress={recording ? onStop : onStart}
              />
              <Button
                mode="contained"
                onPress={onInterpret}
                loading={interpreting}
                disabled={interpreting || !transcript.trim()}
              >
                Interpretar
              </Button>
            </View>
            <HelperText type="error" visible={Boolean(error)}>{error}</HelperText>
          </>
        )}
      </Modal>
    </Portal>
  );
}
const styles = StyleSheet.create({ modal: { margin: spacing.lg, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: 18, gap: spacing.md }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, copy: { color: colors.textSecondary, lineHeight: 22 }, controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" } });
