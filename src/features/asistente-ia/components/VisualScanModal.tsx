import { useEffect, useRef, useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { ActivityIndicator, Button, Card, Chip, Surface, Text } from "react-native-paper";
import { Camera, Check, RefreshCw, Sparkles, X, Zap, ZapOff } from "lucide-react-native";
import { colors, spacing } from "../../../shared/theme";
import { formatearPrecio } from "../../../shared/lib/utils";
import type { Producto, VisualMatchCandidate, VisualRecognitionResult } from "../../../shared/types/domain";
import { reconocerPrendaPorImagen } from "../api/visualRecognitionService";

export interface VisualScanModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectProduct: (candidate: VisualMatchCandidate) => void;
  catalogo?: Producto[];
  title?: string;
}

export function VisualScanModal({
  visible,
  onClose,
  onSelectProduct,
  catalogo,
  title = "Identificar prenda con IA",
}: VisualScanModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState<VisualRecognitionResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (visible) {
      setTorch(false);
      setCapturedUri(null);
      setIsAnalyzing(false);
      setRecognitionResult(null);
      setAnalysisError(null);
    }
  }, [visible]);

  const handleCapture = async () => {
    if (!cameraRef.current || isAnalyzing) return;
    try {
      setIsAnalyzing(true);
      setAnalysisError(null);

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.6,
      });

      if (!photo?.base64) {
        throw new Error("No se pudo obtener la imagen capturada.");
      }

      setCapturedUri(photo.uri);
      const result = await reconocerPrendaPorImagen(photo.base64, catalogo);
      setRecognitionResult(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al analizar la imagen.";
      setAnalysisError(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setCapturedUri(null);
    setRecognitionResult(null);
    setAnalysisError(null);
    setIsAnalyzing(false);
  };

  const handleSelect = (candidate: VisualMatchCandidate) => {
    onSelectProduct(candidate);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.container}>
        {/* Header */}
        <Surface style={styles.header} elevation={2}>
          <TouchableOpacity onPress={onClose} style={styles.iconButton} accessibilityLabel="Cerrar">
            <X color={colors.white} size={24} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <View style={styles.headerBadge}>
              <Sparkles size={16} color={colors.primary} />
              <Text variant="titleMedium" style={styles.headerTitle}>
                {title}
              </Text>
            </View>
            <Text variant="bodySmall" style={styles.headerSubtitle}>
              Reconocimiento visual multimodal sin código de barras
            </Text>
          </View>
          {!capturedUri && permission?.granted ? (
            <TouchableOpacity
              onPress={() => setTorch((prev) => !prev)}
              style={styles.iconButton}
              accessibilityLabel="Linterna"
            >
              {torch ? <Zap color="#FFD700" size={24} /> : <ZapOff color={colors.white} size={24} />}
            </TouchableOpacity>
          ) : (
            <View style={styles.iconPlaceholder} />
          )}
        </Surface>

        {/* Content View */}
        <View style={styles.body}>
          {!permission ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : !permission.granted ? (
            <View style={styles.center}>
              <Surface style={styles.permissionCard} elevation={3}>
                <Text variant="titleMedium" style={styles.permissionTitle}>
                  Permiso de cámara requerido
                </Text>
                <Text variant="bodyMedium" style={styles.permissionDesc}>
                  Necesitamos acceso a la cámara para capturar y clasificar prendas.
                </Text>
                <Button mode="contained" onPress={requestPermission} style={styles.btn}>
                  Conceder permiso
                </Button>
              </Surface>
            </View>
          ) : capturedUri ? (
            /* Results View */
            <ScrollView contentContainerStyle={styles.resultsContainer}>
              <View style={styles.previewWrap}>
                <Image source={{ uri: capturedUri }} style={styles.previewImage} />
                {isAnalyzing && (
                  <View style={styles.analyzingOverlay}>
                    <ActivityIndicator size="large" color={colors.white} />
                    <Text variant="titleMedium" style={styles.analyzingText}>
                      Analizando prenda con IA Multimodal...
                    </Text>
                  </View>
                )}
              </View>

              {analysisError && (
                <Surface style={styles.errorCard} elevation={1}>
                  <Text variant="bodyMedium" style={styles.errorText}>
                    {analysisError}
                  </Text>
                  <Button mode="outlined" onPress={handleReset} style={styles.btnSm}>
                    Reintentar
                  </Button>
                </Surface>
              )}

              {recognitionResult && !isAnalyzing && (
                <View style={styles.resultDetails}>
                  {/* Visual traits */}
                  <Surface style={styles.traitsCard} elevation={1}>
                    <Text variant="labelLarge" style={styles.traitsHeader}>
                      Atributos detectados
                    </Text>
                    <View style={styles.chipsRow}>
                      <Chip icon="tag" style={styles.chip}>
                        {recognitionResult.analisis_prenda.categoria}
                      </Chip>
                      <Chip icon="palette" style={styles.chip}>
                        {recognitionResult.analisis_prenda.color_principal}
                      </Chip>
                      <Chip icon="scissors-cutting" style={styles.chip}>
                        {recognitionResult.analisis_prenda.tipo_corte}
                      </Chip>
                    </View>
                    <Text variant="bodySmall" style={styles.distinguishingText}>
                      Detalles: {recognitionResult.analisis_prenda.caracteristicas_distintivas}
                    </Text>
                  </Surface>

                  {/* Candidates */}
                  <Text variant="titleMedium" style={styles.candidatesTitle}>
                    Coincidencias en catálogo ({recognitionResult.candidatos.length})
                  </Text>

                  {recognitionResult.candidatos.map((cand, index) => {
                    const matchPercent = Math.round(cand.confidence * 100);
                    return (
                      <Card key={cand.producto_id || index} mode="outlined" style={styles.candidateCard}>
                        <Card.Content>
                          <View style={styles.candidateHeader}>
                            <View style={styles.candidateInfo}>
                              <Text variant="titleMedium" style={styles.candidateName}>
                                {cand.nombre}
                              </Text>
                              <Text variant="bodySmall" style={styles.candidateCode}>
                                SKU: {cand.codigo} · {cand.categoria}
                              </Text>
                              <Text variant="titleSmall" style={styles.candidatePrice}>
                                {formatearPrecio(cand.precio)}
                              </Text>
                            </View>
                            <Surface
                              style={[
                                styles.confidenceBadge,
                                {
                                  backgroundColor:
                                    matchPercent >= 80 ? "#E8F5E9" : matchPercent >= 60 ? "#FFF3E0" : "#F5F5F5",
                                },
                              ]}
                              elevation={0}
                            >
                              <Text
                                variant="labelLarge"
                                style={[
                                  styles.confidenceText,
                                  {
                                    color:
                                      matchPercent >= 80 ? "#2E7D32" : matchPercent >= 60 ? "#E65100" : "#616161",
                                  },
                                ]}
                              >
                                {matchPercent}%
                              </Text>
                              <Text variant="labelSmall" style={styles.confidenceSub}>
                                afinidad
                              </Text>
                            </Surface>
                          </View>
                          <Text variant="bodySmall" style={styles.candidateReason}>
                            💡 {cand.razon}
                          </Text>
                        </Card.Content>
                        <Card.Actions>
                          <Button
                            mode="contained"
                            icon={() => <Check size={16} color={colors.white} />}
                            onPress={() => handleSelect(cand)}
                          >
                            Seleccionar esta prenda
                          </Button>
                        </Card.Actions>
                      </Card>
                    );
                  })}

                  <Button
                    mode="outlined"
                    icon={() => <RefreshCw size={16} color={colors.white} />}
                    textColor={colors.white}
                    onPress={handleReset}
                    style={styles.retakeBtn}
                  >
                    Tomar otra fotografía
                  </Button>
                </View>
              )}
            </ScrollView>
          ) : (
            /* Live Camera View */
            <View style={styles.cameraWrapper}>
              <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} enableTorch={torch} />
              <View style={styles.viewfinderGuide}>
                <View style={styles.cornerTopLeft} />
                <View style={styles.cornerTopRight} />
                <View style={styles.cornerBottomLeft} />
                <View style={styles.cornerBottomRight} />
                <Text style={styles.viewfinderHint}>Encuadra la prenda completa con buena luz</Text>
              </View>

              <View style={styles.cameraBottomBar}>
                <TouchableOpacity
                  style={styles.shutterButton}
                  onPress={handleCapture}
                  disabled={isAnalyzing}
                  accessibilityLabel="Tomar foto de prenda"
                >
                  <View style={styles.shutterInner}>
                    <Camera size={28} color={colors.white} />
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  header: {
    paddingTop: 48,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: "#1E293B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    padding: spacing.xs,
  },
  iconPlaceholder: {
    width: 32,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: spacing.sm,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  headerTitle: {
    color: colors.white,
    fontWeight: "700",
  },
  headerSubtitle: {
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 2,
  },
  body: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  permissionCard: {
    padding: spacing.xl,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    width: "100%",
  },
  permissionTitle: {
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  permissionDesc: {
    textAlign: "center",
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  btn: {
    width: "100%",
  },
  btnSm: {
    marginTop: spacing.sm,
  },
  cameraWrapper: {
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
  },
  viewfinderGuide: {
    width: "82%",
    height: "55%",
    marginTop: "18%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
    borderRadius: 16,
    position: "relative",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: spacing.md,
  },
  cornerTopLeft: {
    position: "absolute",
    top: -2,
    left: -2,
    width: 24,
    height: 24,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: colors.primary,
    borderTopLeftRadius: 16,
  },
  cornerTopRight: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 24,
    height: 24,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: colors.primary,
    borderTopRightRadius: 16,
  },
  cornerBottomLeft: {
    position: "absolute",
    bottom: -2,
    left: -2,
    width: 24,
    height: 24,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: colors.primary,
    borderBottomLeftRadius: 16,
  },
  cornerBottomRight: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: colors.primary,
    borderBottomRightRadius: 16,
  },
  viewfinderHint: {
    color: colors.white,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    fontSize: 12,
    fontWeight: "600",
  },
  cameraBottomBar: {
    width: "100%",
    paddingBottom: 40,
    paddingTop: spacing.lg,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  shutterButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: colors.white,
    justifyContent: "center",
    alignItems: "center",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  resultsContainer: {
    padding: spacing.md,
    paddingBottom: 40,
  },
  previewWrap: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#000",
  },
  previewImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  analyzingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
  },
  analyzingText: {
    color: colors.white,
    fontWeight: "600",
    textAlign: "center",
  },
  errorCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 8,
    backgroundColor: "#FFEBEE",
  },
  errorText: {
    color: "#C62828",
  },
  resultDetails: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  traitsCard: {
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
  },
  traitsHeader: {
    fontWeight: "700",
    color: "#334155",
    marginBottom: spacing.xs,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  chip: {
    backgroundColor: "#E2E8F0",
  },
  distinguishingText: {
    color: "#64748B",
    marginTop: spacing.xs,
  },
  candidatesTitle: {
    fontWeight: "700",
    color: colors.white,
    marginTop: spacing.xs,
  },
  candidateCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  candidateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  candidateInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  candidateName: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  candidateCode: {
    color: colors.textSecondary,
    marginVertical: 2,
  },
  candidatePrice: {
    color: colors.primary,
    fontWeight: "700",
  },
  confidenceBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: "center",
    minWidth: 54,
  },
  confidenceText: {
    fontWeight: "800",
  },
  confidenceSub: {
    fontSize: 9,
    color: "#616161",
  },
  candidateReason: {
    color: "#475569",
    marginTop: spacing.sm,
    fontStyle: "italic",
  },
  retakeBtn: {
    marginTop: spacing.sm,
    borderColor: "#475569",
  },
});
