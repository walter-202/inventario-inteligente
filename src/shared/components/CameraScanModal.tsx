import { useEffect, useRef, useState } from "react";
import { Linking, Modal, StyleSheet, TouchableOpacity, View } from "react-native";
import { BarcodeScanningResult, BarcodeType, CameraView, useCameraPermissions } from "expo-camera";
import { ActivityIndicator, Button, Dialog, Portal, Surface, Text, TextInput } from "react-native-paper";
import { Keyboard, X, Zap, ZapOff } from "lucide-react-native";
import { colors, spacing } from "../theme";

const BARCODE_TYPES: BarcodeType[] = [
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "code128",
  "code39",
  "code93",
  "itf14",
  "codabar",
  "qr",
  "pdf417",
  "aztec",
  "datamatrix",
];

export interface CameraScanModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  title?: string;
  hint?: string;
}

/**
 * Modal in-place para escaneo de códigos de barra y QR con la cámara.
 * Funciona de manera fluida sobre cualquier pantalla o buscador sin alterar la navegación.
 */
export function CameraScanModal({
  visible,
  onClose,
  onScan,
  title = "Escanear para buscar",
  hint = "Alineá el código de barras o QR dentro del marco",
}: CameraScanModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [manualDialogVisible, setManualDialogVisible] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const activeRef = useRef(true);

  useEffect(() => {
    if (visible) {
      activeRef.current = true;
      setTorch(false);
      setManualCode("");
      setManualDialogVisible(false);
    }
  }, [visible]);

  const handleBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (!activeRef.current) return;
    const cleaned = (data ?? "").trim();
    if (!cleaned) return;
    activeRef.current = false;
    onScan(cleaned);
    onClose();
  };

  const handleManualSubmit = () => {
    const cleaned = manualCode.trim();
    setManualDialogVisible(false);
    setManualCode("");
    if (cleaned) {
      activeRef.current = false;
      onScan(cleaned);
      onClose();
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.container}>
        {!permission ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : !permission.granted ? (
          <View style={styles.permissionContainer}>
            <Surface style={styles.permissionCard} elevation={3}>
              <Text variant="titleMedium" style={styles.permissionTitle}>
                Permiso de cámara requerido
              </Text>
              <Text variant="bodyMedium" style={styles.permissionDesc}>
                {permission.canAskAgain
                  ? "Necesitamos acceso a la cámara para escanear los códigos de tus prendas."
                  : "La cámara está deshabilitada. Habilitala en los ajustes de tu teléfono para escanear."}
              </Text>
              <View style={styles.permissionActions}>
                <Button
                  mode="contained"
                  onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
                >
                  {permission.canAskAgain ? "Permitir cámara" : "Abrir configuración"}
                </Button>
                <Button
                  mode="outlined"
                  icon={() => <Keyboard size={16} color={colors.primary} />}
                  onPress={() => setManualDialogVisible(true)}
                >
                  Ingresar código manual
                </Button>
                <Button mode="text" onPress={onClose}>
                  Cancelar
                </Button>
              </View>
            </Surface>
          </View>
        ) : (
          <View style={StyleSheet.absoluteFill}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              onBarcodeScanned={handleBarcodeScanned}
            />

            {/* Top Bar con controles */}
            <View style={styles.topBar}>
              <TouchableOpacity style={styles.iconCircle} onPress={onClose} activeOpacity={0.7} accessibilityLabel="Cerrar escáner">
                <X size={22} color={colors.white} />
              </TouchableOpacity>
              <View style={styles.modeBadge}>
                <Text variant="labelMedium" style={styles.modeText}>
                  {title}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.iconCircle, torch ? styles.iconCircleActive : null]}
                onPress={() => setTorch((prev) => !prev)}
                activeOpacity={0.7}
                accessibilityLabel="Encender linterna"
              >
                {torch ? <Zap size={22} color="#FBBF24" /> : <ZapOff size={22} color={colors.white} />}
              </TouchableOpacity>
            </View>

            {/* Retícula de enfoque central */}
            <View style={styles.reticleContainer}>
              <View style={styles.reticle}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              <Text style={styles.reticleHint}>{hint}</Text>
            </View>

            {/* Botón inferior para código manual */}
            <View style={styles.bottomManualBar}>
              <Button
                mode="contained-tonal"
                icon={() => <Keyboard size={18} color={colors.textPrimary} />}
                onPress={() => setManualDialogVisible(true)}
                style={styles.manualButton}
              >
                Ingresar código manual
              </Button>
            </View>
          </View>
        )}

        {/* Diálogo de código manual */}
        <Portal>
          <Dialog visible={manualDialogVisible} onDismiss={() => setManualDialogVisible(false)}>
            <Dialog.Title>Ingresar código</Dialog.Title>
            <Dialog.Content>
              <TextInput
                mode="outlined"
                label="Código de barras o SKU"
                value={manualCode}
                onChangeText={setManualCode}
                autoFocus
                autoCapitalize="characters"
                onSubmitEditing={handleManualSubmit}
              />
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setManualDialogVisible(false)}>Cancelar</Button>
              <Button mode="contained" onPress={handleManualSubmit} disabled={!manualCode.trim()}>
                Buscar
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
  },
  permissionCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    maxWidth: 380,
    width: "100%",
    gap: spacing.md,
  },
  permissionTitle: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  permissionDesc: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  permissionActions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  topBar: {
    position: "absolute",
    top: 50,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleActive: {
    backgroundColor: "rgba(251, 191, 36, 0.35)",
    borderWidth: 1,
    borderColor: "#FBBF24",
  },
  modeBadge: {
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  modeText: {
    color: colors.white,
    fontWeight: "600",
  },
  reticleContainer: {
    position: "absolute",
    top: "28%",
    left: 0,
    right: 0,
    alignItems: "center",
    gap: spacing.md,
  },
  reticle: {
    width: 270,
    height: 200,
    borderRadius: 12,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 32,
    height: 32,
    borderColor: colors.primary,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  reticleHint: {
    color: colors.white,
    fontSize: 13,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 14,
    overflow: "hidden",
  },
  bottomManualBar: {
    position: "absolute",
    bottom: 44,
    alignSelf: "center",
  },
  manualButton: {
    backgroundColor: "rgba(255,255,255,0.92)",
  },
});
