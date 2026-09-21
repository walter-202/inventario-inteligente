import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, Chip, HelperText, IconButton, Surface, Text, TextInput } from "react-native-paper";
import {
  Tag,
  Barcode,
  ScanBarcode,
  Layers,
  DollarSign,
  Package,
  Mic,
  Square,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Lightbulb,
} from "lucide-react-native";
import { ProductoInputSchema } from "../api/productosApi";
import type { NuevoProductoParams, Sucursal } from "../../../shared/types/domain";
import { BranchSelect } from "../../../shared/components/BranchSelect";
import { CameraScanModal } from "../../../shared/components/CameraScanModal";
import { useConfirm } from "../../../shared/components/ConfirmDialog";
import { colors, radius, shadows, spacing } from "../../../shared/theme";
import { useVoiceRegistration, type VoiceRegistrationState } from "../hooks/useVoiceRegistration";

// ─── Pulse animation for the mic button ────────────────────────────────────────

function usePulse(active: boolean) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (active) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(scale, { toValue: 1.5, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.4, duration: 0, useNativeDriver: true }),
          ]),
        ]),
      );
      opacity.setValue(0.4);
      loop.start();
      return () => loop.stop();
    }
    scale.setValue(1);
    opacity.setValue(0);
  }, [active, scale, opacity]);

  return { scale, opacity };
}

// ─── Voice status bar with Lucide icons ─────────────────────────────────────────

interface VoiceStatusBarProps {
  state: VoiceRegistrationState;
  transcript: string;
  error: string | null;
  onClear: () => void;
}

function VoiceStatusBar({ state, transcript, error, onClear }: VoiceStatusBarProps) {
  if (state === "idle" && !transcript) return null;

  const getStatus = () => {
    switch (state) {
      case "listening":
        return {
          icon: <Mic size={18} color="#EF4444" />,
          label: "Escuchando dictado...",
          color: "#DC2626",
          bg: "#FEF2F2",
          border: "#FCA5A5",
        };
      case "interpreting":
        return {
          icon: <Sparkles size={18} color="#2563EB" />,
          label: "Interpretando con IA...",
          color: "#1D4ED8",
          bg: "#EFF6FF",
          border: "#93C5FD",
        };
      case "done":
        return {
          icon: <CheckCircle2 size={18} color="#059669" />,
          label: "¡Campos completados por voz!",
          color: "#047857",
          bg: "#ECFDF5",
          border: "#6EE7B7",
        };
      case "error":
        return {
          icon: <AlertCircle size={18} color="#DC2626" />,
          label: error || "Error al interpretar",
          color: "#B91C1C",
          bg: "#FEF2F2",
          border: "#F87171",
        };
      default:
        return null;
    }
  };

  const status = getStatus();
  if (!status) return null;

  return (
    <Surface style={[styles.statusBar, { backgroundColor: status.bg, borderColor: status.border }]} elevation={0}>
      <View style={styles.statusRow}>
        <View style={styles.statusIconWrapper}>{status.icon}</View>
        <Text variant="labelMedium" style={{ color: status.color, flex: 1, fontWeight: "700" }}>
          {status.label}
        </Text>
        {state === "done" || state === "error" ? (
          <Button compact mode="text" textColor={status.color} onPress={onClear}>
            Cerrar
          </Button>
        ) : null}
      </View>
      {transcript ? (
        <Text variant="bodySmall" style={styles.transcript} numberOfLines={2}>
          &ldquo;{transcript}&rdquo;
        </Text>
      ) : null}
    </Surface>
  );
}

// ─── Lidemoda categories shortcuts ──────────────────────────────────────────────

const LIDEMODA_CATEGORIES = [
  "belleza",
  "accesorios",
  "hogar",
  "regalos",
  "novedades",
];

const VOICE_EXAMPLES = [
  "Base líquida código BEL-100 código de barra 6924372664384 precio 35 cantidad 15 categoría belleza",
  "Taza Messi código HOG-200 precio 35 cantidad 20 categoría hogar",
  "Aretes de aro código ACC-300 precio 20 cantidad 30 categoría accesorios",
];

// ─── Main form ─────────────────────────────────────────────────────────────────

interface ProductFormProps {
  branches: Sucursal[];
  resetToken?: number;
  loading?: boolean;
  serverError?: string | null;
  initialValues?: Partial<NuevoProductoParams>;
  onSubmit: (input: NuevoProductoParams) => void;
}

type Field = "nombre" | "codigo" | "codigo_barra" | "categoria" | "subcategoria" | "precio" | "cantidad" | "sucursal_id";

export function ProductForm({ branches, resetToken = 0, loading = false, serverError, initialValues, onSubmit }: ProductFormProps) {
  const [values, setValues] = useState({
    nombre: initialValues?.nombre ?? "",
    codigo: initialValues?.codigo ?? "",
    codigo_barra: initialValues?.codigo_barra ?? "",
    categoria: initialValues?.categoria ?? "",
    subcategoria: initialValues?.subcategoria ?? "",
    precio: initialValues?.precio !== undefined ? String(initialValues.precio) : "",
    cantidad: initialValues?.cantidad !== undefined ? String(initialValues.cantidad) : "",
  });
  const [sucursalId, setSucursalId] = useState<number | null>(branches[0]?.id ?? null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [showExamples, setShowExamples] = useState(false);
  const [scanModalTarget, setScanModalTarget] = useState<"codigo" | "codigo_barra" | null>(null);

  useEffect(() => {
    if (initialValues?.codigo || initialValues?.codigo_barra) {
      setValues((prev) => ({
        ...prev,
        codigo: initialValues.codigo ?? prev.codigo,
        codigo_barra: initialValues.codigo_barra ?? prev.codigo_barra,
      }));
    }
  }, [initialValues?.codigo, initialValues?.codigo_barra]);

  const voice = useVoiceRegistration();
  const pulse = usePulse(voice.state === "listening");
  const { requestConfirm, dialog } = useConfirm();

  // Reset form
  useEffect(() => {
    setValues({
      nombre: "",
      codigo: "",
      codigo_barra: "",
      categoria: "",
      subcategoria: "",
      precio: "",
      cantidad: "",
    });
    setSucursalId(branches[0]?.id ?? null);
    setErrors({});
    voice.reset();
  }, [resetToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sucursalId === null && branches[0]) setSucursalId(branches[0].id);
  }, [branches, sucursalId]);

  // Apply voice result to form fields
  useEffect(() => {
    if (voice.state !== "done" || !voice.result) return;
    setValues((prev) => ({
      nombre: voice.result!.nombre ?? prev.nombre,
      codigo: voice.result!.codigo ?? prev.codigo,
      codigo_barra: voice.result!.codigo_barra ?? prev.codigo_barra,
      categoria: voice.result!.categoria ?? prev.categoria,
      subcategoria: prev.subcategoria,
      precio: voice.result!.precio != null ? String(voice.result!.precio) : prev.precio,
      cantidad: voice.result!.cantidad != null ? String(voice.result!.cantidad) : prev.cantidad,
    }));
    setErrors({});
  }, [voice.state, voice.result]);

  const update = (field: keyof typeof values, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  const submit = async () => {
    const precioText = values.precio.trim();
    const cantidadText = values.cantidad.trim();
    const precio = Number(precioText.replace(",", "."));
    const cantidad = Number(cantidadText);
    const numericErrors: Partial<Record<Field, string>> = {};
    if (!precioText) numericErrors.precio = "El precio es obligatorio.";
    else if (!Number.isFinite(precio) || precio < 0) numericErrors.precio = "El precio debe ser un número mayor o igual a 0.";
    if (!cantidadText) numericErrors.cantidad = "La cantidad inicial es obligatoria.";
    else if (!/^\d+$/.test(cantidadText)) numericErrors.cantidad = "La cantidad inicial debe ser un entero mayor o igual a 0.";

    const result = ProductoInputSchema.safeParse({
      nombre: values.nombre,
      codigo: values.codigo,
      codigo_barra: values.codigo_barra.trim() || null,
      categoria: values.categoria,
      subcategoria: values.subcategoria.trim() || null,
      precio: precioText ? precio : Number.NaN,
      cantidad: cantidadText ? cantidad : Number.NaN,
      sucursal_id: sucursalId,
    });

    if (!result.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as Field;
        if (!next[field]) next[field] = issue.message;
      }
      setErrors({ ...next, ...numericErrors });
      return;
    }
    if (Object.keys(numericErrors).length > 0) {
      setErrors(numericErrors);
      return;
    }
    const ok = await requestConfirm({
      title: "Confirmar alta",
      message: `Se crea "${result.data.nombre}" (${result.data.codigo}) en el catálogo con stock inicial ${result.data.cantidad}. No se puede borrar después, solo editar.`,
      confirmLabel: "Registrar",
      danger: false,
    });
    if (!ok) return;
    setErrors({});
    onSubmit(result.data);
  };

  const handleMicPress = async () => {
    if (voice.state === "listening") {
      voice.stopListening();
      return;
    }
    // Si el dictado ya falló de verdad en este dispositivo: ejemplos de IA.
    if (!voice.isAvailable) {
      setShowExamples(true);
      return;
    }
    if (!voice.permission?.granted) {
      await voice.requestPermission();
      if (!voice.permission?.granted) {
        // If microphone is unavailable (e.g. web), offer the example test drawer
        setShowExamples(true);
        return;
      }
    }
    voice.reset();
    voice.startListening();
  };

  const isVoiceBusy = voice.state === "listening" || voice.state === "interpreting";

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {dialog}
      <Card mode="outlined" style={styles.card}>
        <Card.Content>
          {/* Header with modern AI Voice action */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text variant="titleLarge" style={styles.title}>Registrar prenda</Text>
              <Text variant="bodySmall" style={styles.subtitle}>
                Completá los campos o usá el asistente IA
              </Text>
            </View>

            <View style={styles.micWrapper}>
              {/* Pulse animation ring */}
              <Animated.View
                style={[
                  styles.pulseRing,
                  {
                    transform: [{ scale: pulse.scale }],
                    opacity: pulse.opacity,
                  },
                ]}
              />
              <IconButton
                mode={voice.state === "listening" ? "contained" : "contained-tonal"}
                containerColor={voice.state === "listening" ? "#EF4444" : colors.primarySoft}
                icon={() =>
                  voice.state === "listening" ? (
                    <Square size={22} color={colors.white} />
                  ) : (
                    <Mic size={22} color={colors.primary} />
                  )
                }
                size={28}
                style={styles.micButton}
                onPress={handleMicPress}
                disabled={voice.permissionLoading || voice.state === "interpreting"}
                accessibilityLabel={voice.state === "listening" ? "Detener dictado" : "Iniciar dictado por voz"}
              />
            </View>
          </View>

          {/* Quick AI test toggle button */}
          <View style={styles.aiToggleRow}>
            <Button
              compact
              mode="text"
              icon={() => <Sparkles size={16} color={colors.primary} />}
              onPress={() => setShowExamples(!showExamples)}
            >
              {showExamples ? "Ocultar frases de prueba IA" : "Probar con ejemplos de voz IA"}
            </Button>
          </View>

          {/* Example voice phrases drawer for quick demo / web testing */}
          {showExamples ? (
            <Surface style={styles.examplesCard} elevation={0}>
              <Text variant="labelSmall" style={styles.examplesTitle}>
                Tocá un ejemplo para auto-completar con IA:
              </Text>
              <View style={styles.examplesList}>
                {VOICE_EXAMPLES.map((phrase) => (
                  <Chip
                    key={phrase}
                    icon={() => <Lightbulb size={14} color={colors.primary} />}
                    onPress={() => {
                      voice.interpretPhrase(phrase);
                      setShowExamples(false);
                    }}
                    style={styles.exampleChip}
                    textStyle={styles.exampleChipText}
                  >
                    {phrase}
                  </Chip>
                ))}
              </View>
            </Surface>
          ) : null}

          {/* Voice status banner */}
          <VoiceStatusBar
            state={voice.state}
            transcript={voice.transcript}
            error={voice.error}
            onClear={voice.reset}
          />

          {/* Form fields with clean Lucide SVG icons */}
          <View style={styles.fieldsSection}>
            {/* Nombre */}
            <View style={styles.field}>
              <TextInput
                mode="outlined"
                label="Nombre del producto"
                value={values.nombre}
                onChangeText={(value) => update("nombre", value)}
                error={Boolean(errors.nombre)}
                left={<TextInput.Icon icon={() => <Tag size={20} color={colors.primary} />} />}
                placeholder="Ej: Jean Mom Fit Clásico Azul"
              />
              <HelperText type="error" visible={Boolean(errors.nombre)}>{errors.nombre}</HelperText>
            </View>

            {/* Código SKU */}
            <View style={styles.field}>
              <TextInput
                mode="outlined"
                label="Código SKU interno"
                value={values.codigo}
                onChangeText={(value) => update("codigo", value)}
                error={Boolean(errors.codigo)}
                autoCapitalize="characters"
                left={<TextInput.Icon icon={() => <Barcode size={20} color={colors.primary} />} />}
                right={
                  <TextInput.Icon
                    icon={() => <ScanBarcode size={20} color={colors.primary} />}
                    onPress={() => setScanModalTarget("codigo")}
                    accessibilityLabel="Escanear SKU con la cámara"
                  />
                }
                placeholder="Ej: BEL-001 o tocá para escanear"
              />
              <HelperText type="error" visible={Boolean(errors.codigo)}>{errors.codigo}</HelperText>
            </View>

            {/* Código de barras del fabricante */}
            <View style={styles.field}>
              <TextInput
                mode="outlined"
                label="Código de barras (EAN-13 / Fabricante)"
                value={values.codigo_barra}
                onChangeText={(value) => update("codigo_barra", value)}
                error={Boolean(errors.codigo_barra)}
                keyboardType="numeric"
                left={<TextInput.Icon icon={() => <Barcode size={20} color={colors.primary} />} />}
                right={
                  <TextInput.Icon
                    icon={() => <ScanBarcode size={20} color={colors.primary} />}
                    onPress={() => setScanModalTarget("codigo_barra")}
                    accessibilityLabel="Escanear código de barras con la cámara"
                  />
                }
                placeholder="Ej: 6924372664384 o tocá para escanear"
              />
              <HelperText type="error" visible={Boolean(errors.codigo_barra)}>{errors.codigo_barra}</HelperText>
            </View>

            {/* Categoría con chips de acceso rápido */}
            <View style={styles.field}>
              <TextInput
                mode="outlined"
                label="Categoría"
                value={values.categoria}
                onChangeText={(value) => update("categoria", value)}
                error={Boolean(errors.categoria)}
                left={<TextInput.Icon icon={() => <Layers size={20} color={colors.primary} />} />}
                placeholder="Elegí o escribí una categoría"
              />
              <View style={styles.categoryChipsContainer}>
                {LIDEMODA_CATEGORIES.map((cat) => {
                  const isSelected = values.categoria.toLowerCase() === cat.toLowerCase();
                  return (
                    <Chip
                      key={cat}
                      compact
                      selected={isSelected}
                      showSelectedCheck={false}
                      onPress={() => update("categoria", cat)}
                      style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                      textStyle={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}
                    >
                      {cat}
                    </Chip>
                  );
                })}
              </View>
              <HelperText type="error" visible={Boolean(errors.categoria)}>{errors.categoria}</HelperText>
            </View>

            {/* Precio */}
            <View style={styles.field}>
              <TextInput
                mode="outlined"
                label="Precio (Bs)"
                value={values.precio}
                onChangeText={(value) => update("precio", value)}
                keyboardType="decimal-pad"
                error={Boolean(errors.precio)}
                left={<TextInput.Icon icon={() => <DollarSign size={20} color={colors.primary} />} />}
                placeholder="Ej: 180.00"
              />
              <HelperText type="error" visible={Boolean(errors.precio)}>{errors.precio}</HelperText>
            </View>

            {/* Cantidad inicial */}
            <View style={styles.field}>
              <TextInput
                mode="outlined"
                label="Cantidad inicial"
                value={values.cantidad}
                onChangeText={(value) => update("cantidad", value)}
                keyboardType="number-pad"
                error={Boolean(errors.cantidad)}
                left={<TextInput.Icon icon={() => <Package size={20} color={colors.primary} />} />}
                placeholder="Ej: 25"
              />
              <HelperText type="error" visible={Boolean(errors.cantidad)}>{errors.cantidad}</HelperText>
            </View>
          </View>

          {/* Sucursal selector */}
          <View style={styles.branchSection}>
            <BranchSelect
              label="Sucursal de ingreso inicial"
              branches={branches}
              value={sucursalId}
              onChange={(id) => { if (id !== undefined) setSucursalId(id); }}
            />
            <HelperText type="error" visible={Boolean(errors.sucursal_id)}>{errors.sucursal_id}</HelperText>
          </View>

          {serverError ? <HelperText type="error" visible>{serverError}</HelperText> : null}

          {/* Submit Button */}
          <Button
            mode="contained"
            onPress={submit}
            loading={loading}
            disabled={loading || branches.length === 0 || isVoiceBusy}
            style={styles.submitButton}
            contentStyle={styles.submitButtonContent}
            icon={() => <CheckCircle2 size={20} color={colors.white} />}
          >
            Registrar prenda en catálogo
          </Button>
        </Card.Content>
      </Card>

      <CameraScanModal
        visible={scanModalTarget !== null}
        onClose={() => setScanModalTarget(null)}
        title={scanModalTarget === "codigo_barra" ? "Escanear código de barras" : "Escanear SKU"}
        onScan={(code) => {
          if (scanModalTarget) {
            update(scanModalTarget, code);
          }
          setScanModalTarget(null);
        }}
      />
    </ScrollView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  card: {
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    ...shadows.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  headerText: {
    flex: 1,
    marginRight: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontWeight: "800",
    fontSize: 22,
  },
  subtitle: {
    color: colors.textMuted,
    marginTop: 2,
  },
  micWrapper: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#EF4444",
  },
  micButton: {
    borderRadius: 24,
    ...shadows.floating,
  },
  aiToggleRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: spacing.sm,
  },
  examplesCard: {
    backgroundColor: "#F8FAFC",
    padding: spacing.md,
    borderRadius: 14,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: spacing.xs,
  },
  examplesTitle: {
    color: colors.textSecondary,
    fontWeight: "700",
    marginBottom: 4,
  },
  examplesList: {
    gap: 6,
  },
  exampleChip: {
    backgroundColor: colors.white,
    borderColor: "#E2E8F0",
    borderWidth: 1,
  },
  exampleChipText: {
    fontSize: 12,
    color: colors.textPrimary,
  },
  statusBar: {
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  statusIconWrapper: {
    marginRight: 4,
  },
  transcript: {
    color: colors.textSecondary,
    fontStyle: "italic",
    marginTop: 4,
    paddingLeft: 22,
  },
  fieldsSection: {
    gap: 2,
  },
  field: {
    marginBottom: 4,
  },
  categoryChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  categoryChip: {
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
  },
  categoryChipSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  categoryChipTextSelected: {
    color: colors.primary,
    fontWeight: "700",
  },
  branchSection: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  submitButton: {
    marginTop: spacing.xs,
    borderRadius: 14,
    backgroundColor: colors.primary,
    ...shadows.card,
  },
  submitButtonContent: {
    height: 52,
  },
});
