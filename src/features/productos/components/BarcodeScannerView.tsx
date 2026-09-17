import { useRef, useState } from "react";
import { Linking, StyleSheet, TouchableOpacity, View } from "react-native";
import { BarcodeScanningResult, BarcodeType, CameraView, useCameraPermissions } from "expo-camera";
import { ActivityIndicator, Button, Dialog, Portal, Surface, Text, TextInput } from "react-native-paper";
import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Keyboard,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
  X,
  Zap,
  ZapOff,
} from "lucide-react-native";
import type { Producto } from "../../../shared/types/domain";
import { buscarProductoPorCodigo } from "../api/productosApi";
import { esProductoNoEncontrado } from "../lib/productLookupErrors";
import { colors, spacing } from "../../../shared/theme";
import { formatearPrecio } from "../../../shared/lib/utils";

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

type ScanState = "reading" | "searching" | "found" | "notFound" | "error";

interface BarcodeScannerViewProps {
  onProductFound: (producto: Producto) => void;
  onViewStock?: (producto: Producto) => void;
  onRegisterNew?: (codigo: string) => void;
  onCancel: () => void;
  mode?: string;
}

/**
 * Escáner óptico multifunción para Lidemoda:
 * - Venta rápida (agrega al carrito).
 * - Consulta de stock multi-sucursal directa.
 * - Alta de nuevo producto cuando el código no existe en catálogo.
 * - Linterna integrada y búsqueda manual de respaldo.
 */
export function BarcodeScannerView({
  onProductFound,
  onViewStock,
  onRegisterNew,
  onCancel,
  mode,
}: BarcodeScannerViewProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<ScanState>("reading");
  const [torch, setTorch] = useState(false);
  const [scannedCode, setScannedCode] = useState<string>("");
  const [product, setProduct] = useState<Producto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualDialogVisible, setManualDialogVisible] = useState(false);
  const [manualCodeInput, setManualCodeInput] = useState("");
  const active = useRef(true);

  const procesarCodigo = async (codigoLimpio: string) => {
    if (!codigoLimpio) return;
    active.current = false;
    setScannedCode(codigoLimpio);
    setState("searching");
    setError(null);
    try {
      const found = await buscarProductoPorCodigo(codigoLimpio);
      setProduct(found);
      setState("found");
    } catch (scanError) {
      if (esProductoNoEncontrado(scanError)) {
        setError("Código no registrado en catálogo.");
        setState("notFound");
      } else {
        setError(scanError instanceof Error ? scanError.message : "No se pudo buscar el producto.");
        setState("error");
      }
    }
  };

  const handleScan = async ({ data }: BarcodeScanningResult) => {
    if (!active.current) return;
    const trimmed = (data ?? "").trim();
    if (!trimmed) return;
    await procesarCodigo(trimmed);
  };

  const reanudarEscaneo = () => {
    setProduct(null);
    setError(null);
    setScannedCode("");
    setState("reading");
    active.current = true;
  };

  const handleManualSubmit = async () => {
    const code = manualCodeInput.trim();
    setManualDialogVisible(false);
    setManualCodeInput("");
    if (code) {
      await procesarCodigo(code);
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <View style={styles.permissionCard}>
          <Text variant="titleMedium" style={styles.permissionTitle}>
            Permiso de cámara requerido
          </Text>
          <Text variant="bodyMedium" style={styles.permissionDesc}>
            {permission.canAskAgain
              ? "Necesitamos acceso a la cámara para leer códigos de barra y códigos QR de las prendas."
              : "La cámara está deshabilitada. Habilitala desde los ajustes de tu dispositivo para usar el escáner."}
          </Text>
          <View style={styles.permissionActions}>
            <Button mode="contained" onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}>
              {permission.canAskAgain ? "Permitir cámara" : "Abrir configuración"}
            </Button>
            <Button mode="text" onPress={onCancel}>
              Cancelar
            </Button>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {state === "reading" || state === "searching" ? (
        <View style={StyleSheet.absoluteFill}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
            onBarcodeScanned={state === "reading" ? handleScan : undefined}
          />

          {/* Top Bar con controles */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.iconCircle} onPress={onCancel} activeOpacity={0.7}>
              <X size={20} color={colors.white} />
            </TouchableOpacity>
            <View style={styles.modeBadge}>
              <Text variant="labelSmall" style={styles.modeText}>
                {mode === "registro" ? "Modo: Asociar a nuevo producto" : mode === "stock" ? "Modo: Consulta de stock" : "Escáner Óptico"}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.iconCircle, torch ? styles.iconCircleActive : null]}
              onPress={() => setTorch((prev) => !prev)}
              activeOpacity={0.7}
            >
              {torch ? <Zap size={20} color="#FBBF24" /> : <ZapOff size={20} color={colors.white} />}
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
            <Text style={styles.reticleHint}>Alineá el código de barras o QR dentro del marco</Text>
          </View>

          {/* Botón inferior para código manual */}
          <View style={styles.bottomManualBar}>
            <Button
              mode="contained-tonal"
              icon={() => <Keyboard size={16} color={colors.textPrimary} />}
              onPress={() => setManualDialogVisible(true)}
              style={styles.manualButton}
            >
              Ingresar código manual
            </Button>
          </View>

          {state === "searching" ? (
            <View style={styles.searchingOverlay}>
              <ActivityIndicator size="large" color={colors.white} />
              <Text style={styles.searchingText}>Consultando catálogo central...</Text>
            </View>
          ) : null}
        </View>
      ) : (
        /* Action Sheet / Tarjeta de resultados cuando se detiene el escaneo */
        <View style={styles.resultBackdrop}>
          <Surface style={styles.resultCard} elevation={3}>
            {state === "found" && product ? (
              <View style={styles.resultContent}>
                <View style={styles.resultHeader}>
                  <View style={styles.successBadge}>
                    <CheckCircle2 size={18} color={colors.successDark} />
                    <Text variant="labelMedium" style={styles.successBadgeText}>
                      Prenda Encontrada
                    </Text>
                  </View>
                  <Text variant="labelSmall" style={styles.skuBadge}>
                    {product.codigo}
                  </Text>
                </View>

                <Text variant="titleMedium" style={styles.productName}>
                  {product.nombre}
                </Text>

                <View style={styles.metaRow}>
                  <Text variant="bodyMedium" style={styles.metaItem}>
                    Categoría: <Text style={styles.bold}>{product.categoria}</Text>
                  </Text>
                  <Text variant="titleMedium" style={styles.priceTag}>
                    {formatearPrecio(product.precio)}
                  </Text>
                </View>

                <View style={styles.actionsList}>
                  <Button
                    mode="contained"
                    icon={() => <ShoppingCart size={18} color={colors.white} />}
                    onPress={() => onProductFound(product)}
                    style={styles.actionBtn}
                  >
                    Agregar a venta
                  </Button>

                  {onViewStock ? (
                    <Button
                      mode="outlined"
                      icon={() => <Store size={18} color={colors.primary} />}
                      onPress={() => onViewStock(product)}
                      style={styles.actionBtn}
                    >
                      Ver stock por sucursal
                    </Button>
                  ) : null}

                  <Button
                    mode="text"
                    icon={() => <RefreshCw size={18} color={colors.textSecondary} />}
                    onPress={reanudarEscaneo}
                    textColor={colors.textSecondary}
                  >
                    Seguir escaneando
                  </Button>
                </View>
              </View>
            ) : state === "notFound" ? (
              <View style={styles.resultContent}>
                <View style={styles.resultHeader}>
                  <View style={styles.warningBadge}>
                    <HelpCircle size={18} color={colors.warning} />
                    <Text variant="labelMedium" style={styles.warningBadgeText}>
                      Código no registrado
                    </Text>
                  </View>
                </View>

                <Text variant="titleMedium" style={styles.notFoundTitle}>
                  "{scannedCode}"
                </Text>
                <Text variant="bodySmall" style={styles.notFoundDesc}>
                  Este código no coincide con ninguna prenda del catálogo. Podés darlo de alta ahora mismo con este código pre-cargado.
                </Text>

                <View style={styles.actionsList}>
                  {onRegisterNew ? (
                    <Button
                      mode="contained"
                      icon={() => <Plus size={18} color={colors.white} />}
                      onPress={() => onRegisterNew(scannedCode)}
                      style={styles.actionBtn}
                    >
                      Registrar nuevo producto
                    </Button>
                  ) : null}

                  <Button
                    mode="outlined"
                    icon={() => <RefreshCw size={18} color={colors.primary} />}
                    onPress={reanudarEscaneo}
                    style={styles.actionBtn}
                  >
                    Reintentar escaneo
                  </Button>

                  <Button mode="text" onPress={onCancel} textColor={colors.textSecondary}>
                    Cerrar
                  </Button>
                </View>
              </View>
            ) : (
              <View style={styles.resultContent}>
                <View style={styles.resultHeader}>
                  <View style={styles.errorBadge}>
                    <AlertCircle size={18} color={colors.danger} />
                    <Text variant="labelMedium" style={styles.errorBadgeText}>
                      Error al buscar
                    </Text>
                  </View>
                </View>
                <Text variant="bodyMedium" style={styles.errorDesc}>
                  {error || "No se pudo consultar el código."}
                </Text>
                <View style={styles.actionsList}>
                  <Button mode="contained" onPress={reanudarEscaneo} style={styles.actionBtn}>
                    Reintentar
                  </Button>
                  <Button mode="text" onPress={onCancel}>
                    Cancelar
                  </Button>
                </View>
              </View>
            )}
          </Surface>
        </View>
      )}

      {/* Dialog para ingresar código manual */}
      <Portal>
        <Dialog visible={manualDialogVisible} onDismiss={() => setManualDialogVisible(false)}>
          <Dialog.Title>Ingresar código manual</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={styles.dialogHelper}>
              Escribí el código SKU o número de código de barras impreso en la prenda:
            </Text>
            <TextInput
              mode="outlined"
              label="Código / SKU"
              value={manualCodeInput}
              onChangeText={setManualCodeInput}
              autoCapitalize="characters"
              placeholder="Ej: JEA-001 o 7751234567890"
              autoFocus
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setManualDialogVisible(false)}>Cancelar</Button>
            <Button mode="contained" onPress={() => void handleManualSubmit()} disabled={!manualCodeInput.trim()}>
              Buscar
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  permissionContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  permissionCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 16,
    gap: spacing.md,
    maxWidth: 380,
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
    gap: spacing.xs,
  },
  topBar: {
    position: "absolute",
    top: 48,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleActive: {
    backgroundColor: "rgba(251, 191, 36, 0.3)",
    borderWidth: 1,
    borderColor: "#FBBF24",
  },
  modeBadge: {
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 14,
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
    gap: spacing.sm,
  },
  reticle: {
    width: 260,
    height: 200,
    borderRadius: 12,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 28,
    height: 28,
    borderColor: colors.primary,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 10 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 10 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 10 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 10 },
  reticleHint: {
    color: colors.white,
    fontSize: 13,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  bottomManualBar: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
  },
  manualButton: {
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  searchingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  searchingText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "600",
  },
  resultBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.md + 4,
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
  },
  resultContent: {
    gap: spacing.sm,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  successBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.successSoft,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  successBadgeText: {
    color: colors.successDark,
    fontWeight: "700",
  },
  warningBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.warningSoft,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  warningBadgeText: {
    color: colors.warning,
    fontWeight: "700",
  },
  errorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.dangerSoft,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  errorBadgeText: {
    color: colors.danger,
    fontWeight: "700",
  },
  skuBadge: {
    backgroundColor: colors.surfaceSecondary,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  productName: {
    fontWeight: "800",
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaItem: {
    color: colors.textSecondary,
  },
  bold: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  priceTag: {
    color: colors.primary,
    fontWeight: "800",
  },
  actionsList: {
    gap: 6,
    marginTop: spacing.xs,
  },
  actionBtn: {
    borderRadius: 10,
  },
  notFoundTitle: {
    fontWeight: "800",
    color: colors.textPrimary,
  },
  notFoundDesc: {
    color: colors.textSecondary,
    lineHeight: 18,
  },
  errorDesc: {
    color: colors.danger,
    lineHeight: 20,
  },
  dialogHelper: {
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
});
