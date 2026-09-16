import { useEffect } from "react";
import { Portal, Modal, Button, HelperText, IconButton, Text, TextInput, Divider } from "react-native-paper";
import { ScrollView, StyleSheet, View } from "react-native";
import { Mic, Square, X } from "lucide-react-native";
import { SuggestionChips } from "./SuggestionChips";
import { AssistantReply, type AssistantMessage } from "./AssistantReply";
import type { ResultadoInterpretacion } from "../api/voiceCommandApi";
import { colors, spacing } from "../../../shared/theme";
import { formatearPrecio } from "../../../shared/lib/utils";

export interface VentaConfirmationLine {
  producto_id: number;
  nombre: string;
  cantidad: number;
  precio: number;
}

export interface VentaConfirmation {
  branchName: string;
  lines: VentaConfirmationLine[];
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

interface RegistroVozDrawerProps {
  visible: boolean;
  transcript: string;
  recording: boolean;
  interpreting?: boolean;
  error?: string | null;
  permissionError?: string | null;
  assistant: AssistantMessage | null;
  confirmation: VentaConfirmation | null;
  query: Extract<ResultadoInterpretacion, { tipo: "consulta_stock" | "consulta_ventas" }> | null;
  onTranscriptChange: (value: string) => void;
  onStart: () => void;
  onStop: () => void;
  onInterpret: () => void;
  onDismiss: () => void;
  onDismissQuery: () => void;
  onRequestPermission?: () => void;
  permissionDenied?: boolean;
}

export function RegistroVozDrawer({
  visible,
  transcript,
  recording,
  interpreting = false,
  error,
  permissionError,
  assistant,
  confirmation,
  query,
  onTranscriptChange,
  onStart,
  onStop,
  onInterpret,
  onDismiss,
  onDismissQuery,
  onRequestPermission,
  permissionDenied = false,
}: RegistroVozDrawerProps) {
  useEffect(() => { if (!visible && recording) onStop(); }, [visible, recording, onStop]);
  const confirmationTotal = confirmation?.lines.reduce((sum, line) => sum + line.cantidad * line.precio, 0) ?? 0;
  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        <ScrollView keyboardShouldPersistTaps="handled">
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
            <View style={styles.body}>
              <TextInput
                mode="outlined"
                label="Texto reconocido"
                multiline
                value={transcript}
                onChangeText={onTranscriptChange}
              />
              <SuggestionChips
                suggestions={[
                  "Vender 2 Jean Mom Fit",
                  "¿Cuánto stock queda de Jean Mom Fit?",
                  "¿Cuánto se vendió hoy?",
                  "Stock de Vestido Floral en San Miguel",
                  "Sino, corrige a 5 unidades",
                ]}
                onSelect={onTranscriptChange}
              />
              {assistant ? <AssistantReply message={assistant} /> : null}
              {confirmation ? (
                <View style={styles.confirmCard}>
                  <Text variant="titleSmall" style={styles.confirmTitle}>
                    Confirmar venta · {confirmation.branchName}
                  </Text>
                  {confirmation.lines.map((line) => (
                    <View key={line.producto_id} style={styles.lineRow}>
                      <Text variant="bodyMedium" style={styles.lineName}>
                        {line.cantidad} × {line.nombre}
                      </Text>
                      <Text variant="bodyMedium" style={styles.linePrice}>
                        {formatearPrecio(line.cantidad * line.precio)}
                      </Text>
                    </View>
                  ))}
                  <Divider />
                  <View style={styles.lineRow}>
                    <Text variant="titleSmall">Total</Text>
                    <Text variant="titleMedium" style={styles.totalValue}>
                      {formatearPrecio(confirmationTotal)}
                    </Text>
                  </View>
                  <View style={styles.confirmActions}>
                    <Button onPress={confirmation.onCancel} disabled={confirmation.loading}>
                      Corregir
                    </Button>
                    <Button
                      mode="contained"
                      onPress={confirmation.onConfirm}
                      loading={confirmation.loading}
                      disabled={confirmation.loading}
                    >
                      Confirmar
                    </Button>
                  </View>
                </View>
              ) : null}
              {query && !confirmation ? (
                <View style={styles.queryCard}>
                  <Text variant="bodyMedium" style={styles.queryText}>
                    {query.mensaje}
                  </Text>
                  {query.tipo === "consulta_stock" ? (
                    <View style={styles.queryRows}>
                      {query.desglose.slice(0, 6).map((row) => (
                        <View key={row.sucursalId} style={styles.lineRow}>
                          <Text variant="bodySmall" style={styles.queryBranch}>
                            {row.sucursalNombre}
                          </Text>
                          <Text variant="labelMedium" style={styles.queryQty}>
                            {row.cantidad} uds
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text variant="headlineSmall" style={styles.queryTotal}>
                      Bs {query.totalVentas.toFixed(2)}
                      <Text variant="bodySmall" style={styles.queryBranch}>
                        {"  "}· {query.cantidadVentas} venta(s) hoy
                      </Text>
                    </Text>
                  )}
                  <Button compact mode="text" onPress={onDismissQuery}>
                    Entendido
                  </Button>
                </View>
              ) : null}
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
              <HelperText type="error" visible={Boolean(error) && !assistant}>{error}</HelperText>
            </View>
          )}
        </ScrollView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 18,
    gap: spacing.md,
    maxHeight: "90%",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  body: { gap: spacing.sm + 2 },
  copy: { color: colors.textSecondary, lineHeight: 22 },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  confirmCard: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    padding: spacing.sm + 2,
    gap: spacing.xs,
  },
  confirmTitle: { fontWeight: "700", color: colors.textPrimary },
  lineRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  lineName: { flex: 1, color: colors.textPrimary },
  linePrice: { color: colors.textSecondary, fontWeight: "600" },
  totalValue: { color: colors.primary, fontWeight: "800" },
  confirmActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.xs, marginTop: 2 },
  queryCard: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: spacing.sm + 2,
    gap: spacing.xs,
  },
  queryText: { color: colors.textPrimary, lineHeight: 20 },
  queryRows: { gap: 2 },
  queryBranch: { color: colors.textSecondary },
  queryQty: { color: colors.textPrimary, fontWeight: "700" },
  queryTotal: { color: "#047857", fontWeight: "800" },
});
