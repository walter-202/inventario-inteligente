import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  Button,
  Card,
  Chip,
  HelperText,
  Modal,
  Portal,
  SegmentedButtons,
  Text,
  TextInput,
} from "react-native-paper";
import { ShieldCheck, Sparkles, KeyRound } from "lucide-react-native";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { AppHeader } from "../../../shared/components/AppHeader";
import {
  deleteApiKey,
  getApiKey,
  getCustomModel,
  getPreferredMode,
  setApiKey,
  setCustomModel,
  setPreferredMode,
  type PreferredMode,
  type ProviderId,
} from "../../../shared/lib/secureKeyStore";
import {
  PROVIDER_LIST,
  AI_PROVIDERS,
  type AIProviderDefinition,
} from "../../asistente-ia/lib/aiProviders";
import { testProviderConnection } from "../../asistente-ia/lib/aiGateway";
import { ProviderCard } from "../components/ProviderCard";
import { colors, spacing, radius } from "../../../shared/theme";

export function AISettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [preferredMode, setPreferredModeState] = useState<PreferredMode>("auto");
  const [keys, setKeys] = useState<Record<ProviderId, string | null>>({
    groq: null,
    cerebras: null,
    openrouter: null,
    gemini: null,
  });
  const [customModels, setCustomModels] = useState<Record<ProviderId, string | null>>({
    groq: null,
    cerebras: null,
    openrouter: null,
    gemini: null,
  });

  // Modal edit state
  const [editingProvider, setEditingProvider] = useState<AIProviderDefinition | null>(null);
  const [inputKey, setInputKey] = useState("");
  const [inputModel, setInputModel] = useState("");
  const [showKeyPassword, setShowKeyPassword] = useState(false);
  const [modalTesting, setModalTesting] = useState(false);
  const [modalTestResult, setModalTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const mode = await getPreferredMode();
      setPreferredModeState(mode);

      const loadedKeys: Record<ProviderId, string | null> = {
        groq: await getApiKey("groq"),
        cerebras: await getApiKey("cerebras"),
        openrouter: await getApiKey("openrouter"),
        gemini: await getApiKey("gemini"),
      };
      setKeys(loadedKeys);

      const loadedModels: Record<ProviderId, string | null> = {
        groq: await getCustomModel("groq"),
        cerebras: await getCustomModel("cerebras"),
        openrouter: await getCustomModel("openrouter"),
        gemini: await getCustomModel("gemini"),
      };
      setCustomModels(loadedModels);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleModeChange = async (value: string) => {
    const mode = value as PreferredMode;
    setPreferredModeState(mode);
    await setPreferredMode(mode);
  };

  const handleOpenEdit = (provider: AIProviderDefinition) => {
    setEditingProvider(provider);
    setInputKey(keys[provider.id] ?? "");
    setInputModel(customModels[provider.id] ?? "");
    setShowKeyPassword(false);
    setModalTestResult(null);
  };

  const handleCloseEdit = () => {
    setEditingProvider(null);
    setInputKey("");
    setInputModel("");
    setModalTestResult(null);
  };

  const handleSaveKey = async () => {
    if (!editingProvider) return;
    await setApiKey(editingProvider.id, inputKey);
    await setCustomModel(editingProvider.id, inputModel);
    await loadSettings();
    handleCloseEdit();
  };

  const handleDeleteKey = async (providerId: ProviderId) => {
    await deleteApiKey(providerId);
    await setCustomModel(providerId, null);
    await loadSettings();
  };

  const handleModalTest = async () => {
    if (!editingProvider || !inputKey.trim()) return;
    setModalTesting(true);
    setModalTestResult(null);
    try {
      const result = await testProviderConnection(
        editingProvider.id,
        inputKey.trim(),
        inputModel.trim() || editingProvider.defaultModel,
      );
      if (result.ok) {
        setModalTestResult({
          ok: true,
          message: `Conexión verificada exitosamente (${result.modelUsed})`,
        });
      } else {
        setModalTestResult({
          ok: false,
          message: result.error || "Fallo en la prueba de conexión.",
        });
      }
    } catch (err: unknown) {
      setModalTestResult({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setModalTesting(false);
    }
  };

  const maskKey = (key: string | null): string | null => {
    if (!key) return null;
    const trimmed = key.trim();
    if (trimmed.length <= 8) return "••••••••";
    return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
  };

  return (
    <ScreenContainer scroll>
      <AppHeader
        title="Configuración de IA"
        subtitle="Proveedores y modelos para ventas y catálogos por voz"
      />

      {/* Security Guarantee Banner */}
      <Card mode="outlined" style={styles.securityCard}>
        <Card.Content style={styles.securityContent}>
          <ShieldCheck size={24} color={colors.primary} />
          <View style={styles.securityTextWrap}>
            <Text variant="labelLarge" style={styles.securityTitle}>
              Almacenamiento Seguro en Hardware
            </Text>
            <Text variant="bodySmall" style={styles.securityDesc}>
              Tus claves se guardan encriptadas en el Keystore/Keychain de tu teléfono. Nunca se
              incluyen en el código ni se comparten con servidores de terceros.
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* Routing Mode Selector */}
      <Card mode="outlined" style={styles.sectionCard}>
        <Card.Content style={styles.sectionContent}>
          <View style={styles.sectionHeader}>
            <Sparkles size={18} color={colors.primary} />
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Modo de Enrutamiento
            </Text>
          </View>
          <Text variant="bodySmall" style={styles.sectionSubtitle}>
            Define cómo la aplicación procesa los comandos dictados por voz.
          </Text>

          <SegmentedButtons
            value={preferredMode}
            onValueChange={handleModeChange}
            buttons={[
              { value: "auto", label: "Auto", showSelectedCheck: false },
              { value: "groq", label: "Groq", showSelectedCheck: false },
              { value: "cerebras", label: "Cerebras", showSelectedCheck: false },
              { value: "openrouter", label: "OpenRouter", showSelectedCheck: false },
              { value: "gemini", label: "Gemini", showSelectedCheck: false },
              { value: "heuristic", label: "Offline", showSelectedCheck: false },
            ]}
            style={styles.segmentedButtons}
          />

          <HelperText type="info" visible>
            {preferredMode === "auto" &&
              "Intenta en orden de velocidad y cuota gratuita disponible (Groq → Cerebras → OpenRouter → Gemini). Si fallan, usa heurística local."}
            {preferredMode === "groq" &&
              `Fuerza el uso de Groq Cloud (${customModels.groq || AI_PROVIDERS.groq.defaultModel}).`}
            {preferredMode === "cerebras" &&
              `Fuerza el uso de Cerebras Cloud (${customModels.cerebras || AI_PROVIDERS.cerebras.defaultModel}).`}
            {preferredMode === "openrouter" &&
              `Fuerza el uso de OpenRouter (${customModels.openrouter || AI_PROVIDERS.openrouter.defaultModel}).`}
            {preferredMode === "gemini" &&
              `Fuerza el uso de Google Gemini (${customModels.gemini || AI_PROVIDERS.gemini.defaultModel}).`}
            {preferredMode === "heuristic" && "Modo sin IA externa: procesa comandos localmente sin internet."}
          </HelperText>
        </Card.Content>
      </Card>

      {/* Providers List */}
      <View style={styles.providersSection}>
        <Text variant="titleMedium" style={styles.providersHeaderTitle}>
          Proveedores Disponibles
        </Text>
        <Text variant="bodySmall" style={styles.providersHeaderSubtitle}>
          Configura tus propias API keys gratuitas para activar la transcripción inteligente.
        </Text>

        {PROVIDER_LIST.map((provider) => {
          const currentKey = keys[provider.id];
          const currentModel = customModels[provider.id] || provider.defaultModel;
          return (
            <ProviderCard
              key={provider.id}
              provider={provider}
              hasKey={Boolean(currentKey && currentKey.trim().length > 0)}
              maskedKey={maskKey(currentKey)}
              currentModel={currentModel}
              apiKey={currentKey}
              onEdit={() => handleOpenEdit(provider)}
              onDeleteKey={() => handleDeleteKey(provider.id)}
            />
          );
        })}
      </View>

      {/* Modal for editing key */}
      <Portal>
        <Modal
          visible={Boolean(editingProvider)}
          onDismiss={handleCloseEdit}
          contentContainerStyle={styles.modal}
        >
          {editingProvider ? (
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <KeyRound size={22} color={colors.primary} />
                <Text variant="titleLarge" style={styles.modalTitle}>
                  {editingProvider.name}
                </Text>
              </View>

              <Text variant="bodySmall" style={styles.modalInfo}>
                Puedes obtener tu clave gratuita directamente en:{"\n"}
                <Text style={styles.modalUrl}>{editingProvider.consoleUrl}</Text>
              </Text>

              <TextInput
                label="API Key"
                value={inputKey}
                onChangeText={setInputKey}
                placeholder={editingProvider.keyPlaceholder}
                mode="outlined"
                secureTextEntry={!showKeyPassword}
                right={
                  <TextInput.Icon
                    icon={showKeyPassword ? "eye-off" : "eye"}
                    onPress={() => setShowKeyPassword((v) => !v)}
                  />
                }
                style={styles.input}
              />

              <TextInput
                label="Modelo (Opcional)"
                value={inputModel}
                onChangeText={setInputModel}
                placeholder={`Por defecto: ${editingProvider.defaultModel}`}
                mode="outlined"
                style={styles.input}
              />

              <View style={styles.recommendedModelsWrap}>
                <Text variant="labelSmall" style={styles.recommendedTitle}>
                  Modelos destacados (toca para elegir):
                </Text>
                <View style={styles.chipRow}>
                  {editingProvider.recommendedModels.map((model) => {
                    const isSelected =
                      inputModel === model || (!inputModel && model === editingProvider.defaultModel);
                    return (
                      <Chip
                        key={model}
                        compact
                        mode={isSelected ? "flat" : "outlined"}
                        selected={isSelected}
                        style={[styles.modelChip, isSelected && styles.modelChipSelected]}
                        textStyle={styles.modelChipText}
                        onPress={() => setInputModel(model)}
                      >
                        {model}
                      </Chip>
                    );
                  })}
                </View>
              </View>

              {modalTestResult ? (
                <HelperText
                  type={modalTestResult.ok ? "info" : "error"}
                  visible
                  style={modalTestResult.ok ? styles.testSuccess : styles.testError}
                >
                  {modalTestResult.ok ? "✅ " : "❌ "}
                  {modalTestResult.message}
                </HelperText>
              ) : null}

              <View style={styles.modalActions}>
                <Button
                  mode="outlined"
                  onPress={handleModalTest}
                  loading={modalTesting}
                  disabled={modalTesting || !inputKey.trim()}
                  style={styles.modalBtn}
                >
                  Probar
                </Button>
                <Button mode="text" onPress={handleCloseEdit} style={styles.modalBtn}>
                  Cancelar
                </Button>
                <Button
                  mode="contained"
                  onPress={handleSaveKey}
                  style={styles.modalBtn}
                >
                  Guardar
                </Button>
              </View>
            </View>
          ) : null}
        </Modal>
      </Portal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  securityCard: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
    marginBottom: spacing.md,
    borderRadius: radius.md,
  },
  securityContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  securityTextWrap: {
    flex: 1,
  },
  securityTitle: {
    color: colors.primaryDark,
    fontWeight: "700",
  },
  securityDesc: {
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  sectionCard: {
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  sectionContent: {
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  sectionTitle: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  segmentedButtons: {
    marginVertical: spacing.xs,
  },
  providersSection: {
    gap: spacing.xs,
    marginBottom: spacing.xxl,
  },
  providersHeaderTitle: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  providersHeaderSubtitle: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  modal: {
    backgroundColor: colors.surface,
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  modalContent: {
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  modalTitle: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  modalInfo: {
    color: colors.textSecondary,
    lineHeight: 18,
  },
  modalUrl: {
    color: colors.primary,
    fontWeight: "600",
  },
  input: {
    backgroundColor: colors.surface,
  },
  recommendedModelsWrap: {
    gap: spacing.xs,
  },
  recommendedTitle: {
    color: colors.textSecondary,
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  modelChip: {
    height: 28,
  },
  modelChipSelected: {
    backgroundColor: colors.primarySoft,
  },
  modelChipText: {
    fontSize: 11,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  modalBtn: {
    borderRadius: radius.sm,
  },
  testSuccess: {
    color: colors.success,
  },
  testError: {
    color: colors.danger,
  },
});
