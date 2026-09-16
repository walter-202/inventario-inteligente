import { useEffect, useRef, useState } from "react";
import { Animated, Easing, ScrollView, StyleSheet, View } from "react-native";
import { Button, Card, Chip, HelperText, IconButton, Surface, Text, TextInput } from "react-native-paper";
import { ProductoInputSchema } from "../api/productosApi";
import type { NuevoProductoParams, Sucursal } from "../../../shared/types/domain";
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
            Animated.timing(scale, { toValue: 1.6, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.35, duration: 0, useNativeDriver: true }),
          ]),
        ]),
      );
      opacity.setValue(0.35);
      loop.start();
      return () => loop.stop();
    }
    scale.setValue(1);
    opacity.setValue(0);
  }, [active, scale, opacity]);

  return { scale, opacity };
}

// ─── Voice status bar ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<VoiceRegistrationState, { icon: string; label: string; color: string; bg: string }> = {
  idle: { icon: "microphone", label: "Toca el micrófono para dictar", color: colors.textMuted, bg: colors.surfaceSecondary },
  listening: { icon: "microphone", label: "Escuchando...", color: colors.primary, bg: colors.primarySoft },
  interpreting: { icon: "brain", label: "Interpretando...", color: colors.secondary, bg: colors.secondarySoft },
  done: { icon: "check-circle", label: "Campos completados", color: colors.success, bg: colors.successSoft },
  error: { icon: "alert-circle", label: "Error al interpretar", color: colors.danger, bg: colors.dangerSoft },
};

function VoiceStatusBar({ state, transcript, error }: { state: VoiceRegistrationState; transcript: string; error: string | null }) {
  const config = STATUS_CONFIG[state];
  return (
    <Surface style={[styles.statusBar, { backgroundColor: config.bg }]} elevation={0}>
      <View style={styles.statusRow}>
        <IconButton icon={config.icon} iconColor={config.color} size={18} style={styles.statusIcon} />
        <Text variant="labelMedium" style={{ color: config.color, flex: 1 }}>
          {state === "error" && error ? error : config.label}
        </Text>
      </View>
      {transcript && state !== "idle" ? (
        <Text variant="bodySmall" style={styles.transcript} numberOfLines={3}>
          &ldquo;{transcript}&rdquo;
        </Text>
      ) : null}
    </Surface>
  );
}

// ─── Main form ─────────────────────────────────────────────────────────────────

interface ProductFormProps {
  branches: Sucursal[];
  resetToken?: number;
  loading?: boolean;
  serverError?: string | null;
  onSubmit: (input: NuevoProductoParams) => void;
}

type Field = "nombre" | "codigo" | "categoria" | "precio" | "cantidad" | "sucursal_id";

export function ProductForm({ branches, resetToken = 0, loading = false, serverError, onSubmit }: ProductFormProps) {
  const [values, setValues] = useState({ nombre: "", codigo: "", categoria: "", precio: "", cantidad: "" });
  const [sucursalId, setSucursalId] = useState<number | null>(branches[0]?.id ?? null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const voice = useVoiceRegistration();
  const pulse = usePulse(voice.state === "listening");

  // Reset form
  useEffect(() => {
    setValues({ nombre: "", codigo: "", categoria: "", precio: "", cantidad: "" });
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
      categoria: voice.result!.categoria ?? prev.categoria,
      precio: voice.result!.precio != null ? String(voice.result!.precio) : prev.precio,
      cantidad: voice.result!.cantidad != null ? String(voice.result!.cantidad) : prev.cantidad,
    }));
    setErrors({});
  }, [voice.state, voice.result]);

  const update = (field: keyof typeof values, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  const submit = () => {
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
      categoria: values.categoria,
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
    setErrors({});
    onSubmit(result.data);
  };

  const handleMicPress = async () => {
    if (voice.state === "listening") {
      voice.stopListening();
      return;
    }
    if (!voice.permission?.granted) {
      await voice.requestPermission();
      // Re-check after request
      if (!voice.permission?.granted) return;
    }
    voice.reset();
    voice.startListening();
  };

  const isVoiceBusy = voice.state === "listening" || voice.state === "interpreting";
  const micIcon = voice.state === "listening" ? "stop" : "microphone";
  const micColor = voice.state === "listening" ? colors.danger : colors.white;
  const micBg = voice.state === "listening" ? colors.dangerSoft : colors.primary;

  const input = (field: keyof typeof values, label: string, icon: string, keyboardType?: "default" | "decimal-pad" | "number-pad") => (
    <View key={field} style={styles.field}>
      <TextInput
        mode="outlined"
        label={label}
        value={values[field]}
        onChangeText={(value) => update(field, value)}
        keyboardType={keyboardType}
        error={Boolean(errors[field])}
        autoCapitalize={field === "codigo" ? "characters" : "sentences"}
        left={<TextInput.Icon icon={icon} color={colors.textMuted} />}
      />
      <HelperText type="error" visible={Boolean(errors[field])}>{errors[field]}</HelperText>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Card mode="outlined" style={styles.card}>
        <Card.Content>
          {/* Header with mic button */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text variant="titleLarge" style={styles.title}>Registrar producto</Text>
              <Text variant="bodySmall" style={styles.subtitle}>
                Completa los campos o usa el micrófono
              </Text>
            </View>
            <View style={styles.micContainer}>
              {/* Animated pulse ring */}
              <Animated.View
                style={[
                  styles.pulseRing,
                  {
                    backgroundColor: colors.primary,
                    transform: [{ scale: pulse.scale }],
                    opacity: pulse.opacity,
                  },
                ]}
              />
              <IconButton
                icon={micIcon}
                iconColor={micColor}
                size={28}
                style={[styles.micButton, { backgroundColor: micBg }]}
                onPress={handleMicPress}
                disabled={voice.permissionLoading || voice.state === "interpreting"}
                accessibilityLabel={voice.state === "listening" ? "Detener dictado" : "Iniciar dictado por voz"}
              />
            </View>
          </View>

          {/* Voice status */}
          {voice.state !== "idle" ? (
            <VoiceStatusBar state={voice.state} transcript={voice.transcript} error={voice.error} />
          ) : null}

          {/* Form fields */}
          <View style={styles.fieldsSection}>
            {input("nombre", "Nombre del producto", "tag-outline")}
            {input("codigo", "Código", "barcode")}
            {input("categoria", "Categoría", "shape-outline")}
            {input("precio", "Precio (Bs)", "currency-usd", "decimal-pad")}
            {input("cantidad", "Cantidad inicial", "package-variant-closed", "number-pad")}
          </View>

          {/* Branch selector */}
          <Text variant="labelLarge" style={styles.label}>Sucursal</Text>
          <View style={styles.chips}>
            {branches.map((branch) => (
              <Chip
                key={branch.id}
                selected={branch.id === sucursalId}
                showSelectedCheck={false}
                onPress={() => setSucursalId(branch.id)}
                style={branch.id === sucursalId ? styles.chipSelected : styles.chip}
                textStyle={branch.id === sucursalId ? styles.chipTextSelected : undefined}
              >
                {branch.nombre}
              </Chip>
            ))}
          </View>
          <HelperText type="error" visible={Boolean(errors.sucursal_id)}>{errors.sucursal_id}</HelperText>

          {serverError ? <HelperText type="error" visible>{serverError}</HelperText> : null}

          <Button
            mode="contained"
            onPress={submit}
            loading={loading}
            disabled={loading || branches.length === 0 || isVoiceBusy}
            style={styles.button}
            contentStyle={styles.buttonContent}
            icon="check-circle-outline"
          >
            Registrar producto
          </Button>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  card: {
    borderRadius: radius.lg,
    ...shadows.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  headerText: { flex: 1, marginRight: spacing.md },
  title: { color: colors.textPrimary, fontWeight: "700" },
  subtitle: { color: colors.textMuted, marginTop: 2 },
  micContainer: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  micButton: {
    borderRadius: 24,
    ...shadows.floating,
  },
  statusBar: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusIcon: { margin: 0, marginRight: spacing.xs },
  transcript: {
    color: colors.textSecondary,
    fontStyle: "italic",
    marginTop: spacing.xs,
    marginLeft: spacing.xxl + spacing.sm,
  },
  fieldsSection: { marginTop: spacing.xs },
  field: { marginBottom: spacing.xs },
  label: { marginTop: spacing.md, marginBottom: spacing.sm, color: colors.textPrimary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    backgroundColor: colors.surfaceSecondary,
  },
  chipSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 1,
  },
  chipTextSelected: { color: colors.primary, fontWeight: "600" },
  button: { marginTop: spacing.lg, borderRadius: radius.md },
  buttonContent: { paddingVertical: spacing.xs },
});
