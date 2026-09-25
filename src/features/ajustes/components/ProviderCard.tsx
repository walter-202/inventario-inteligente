import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, Chip, HelperText, Text } from "react-native-paper";
import { CheckCircle2, Key, AlertCircle, PlayCircle, Trash2, Cpu } from "lucide-react-native";
import type { AIProviderDefinition } from "../../asistente-ia/lib/aiProviders";
import { testProviderConnection } from "../../asistente-ia/lib/aiSdkProviders";
import { colors, spacing, radius } from "../../../shared/theme";

interface ProviderCardProps {
  provider: AIProviderDefinition;
  hasKey: boolean;
  maskedKey: string | null;
  currentModel: string;
  onEdit: () => void;
  onDeleteKey: () => void;
  apiKey: string | null;
}

export function ProviderCard({
  provider,
  hasKey,
  maskedKey,
  currentModel,
  onEdit,
  onDeleteKey,
  apiKey,
}: ProviderCardProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleTest = async () => {
    if (!apiKey) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testProviderConnection(provider.id, apiKey, currentModel);
      if (result.ok) {
        setTestResult({
          ok: true,
          message: `Conexión exitosa con modelo ${result.modelUsed}`,
        });
      } else {
        setTestResult({
          ok: false,
          message: result.error || "Fallo de autenticación o cuota excedida.",
        });
      }
    } catch (err: unknown) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card mode="outlined" style={[styles.card, hasKey && styles.cardActive]}>
      <Card.Content style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.titleArea}>
            <View style={styles.nameRow}>
              <Cpu size={18} color={colors.primary} />
              <Text variant="titleMedium" style={styles.providerName}>
                {provider.name}
              </Text>
            </View>
            <Text variant="bodySmall" style={styles.description}>
              {provider.description}
            </Text>
          </View>
          <Chip
            compact
            mode="flat"
            style={[styles.statusChip, hasKey ? styles.chipSuccess : styles.chipInactive]}
            textStyle={hasKey ? styles.chipSuccessText : styles.chipInactiveText}
            icon={() =>
              hasKey ? (
                <CheckCircle2 size={13} color={colors.success} />
              ) : (
                <AlertCircle size={13} color={colors.textMuted} />
              )
            }
          >
            {hasKey ? "Activo" : "Sin clave"}
          </Chip>
        </View>

        <View style={styles.infoBox}>
          <Text variant="labelSmall" style={styles.freeTierLabel}>
            {provider.badge} • {provider.freeTierInfo}
          </Text>
          <Text variant="bodySmall" style={styles.modelInfo}>
            Modelo: <Text style={styles.modelBold}>{currentModel}</Text>
          </Text>
          {hasKey && maskedKey ? (
            <Text variant="bodySmall" style={styles.keyInfo}>
              Clave guardada: <Text style={styles.keyMono}>{maskedKey}</Text>
            </Text>
          ) : null}
        </View>

        {testResult ? (
          <HelperText
            type={testResult.ok ? "info" : "error"}
            visible
            style={[styles.testFeedback, testResult.ok ? styles.testSuccess : styles.testError]}
          >
            {testResult.ok ? "✅ " : "❌ "}
            {testResult.message}
          </HelperText>
        ) : null}

        <View style={styles.actionsRow}>
          <Button
            mode="contained-tonal"
            icon={() => <Key size={16} />}
            onPress={onEdit}
            style={styles.actionButton}
          >
            {hasKey ? "Editar clave" : "Configurar clave"}
          </Button>

          {hasKey ? (
            <>
              <Button
                mode="outlined"
                icon={() => <PlayCircle size={16} />}
                onPress={handleTest}
                loading={testing}
                disabled={testing}
                style={styles.actionButton}
              >
                Probar
              </Button>
              <Button
                mode="text"
                textColor={colors.danger}
                icon={() => <Trash2 size={16} color={colors.danger} />}
                onPress={onDeleteKey}
                disabled={testing}
              >
                Eliminar
              </Button>
            </>
          ) : null}
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  cardActive: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surface,
  },
  content: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  titleArea: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  providerName: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  description: {
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  statusChip: {
    height: 26,
    alignSelf: "flex-start",
  },
  chipSuccess: {
    backgroundColor: colors.successSoft,
  },
  chipSuccessText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "600",
  },
  chipInactive: {
    backgroundColor: colors.surfaceSecondary,
  },
  chipInactiveText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  infoBox: {
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.sm,
    borderRadius: radius.sm,
    gap: 4,
  },
  freeTierLabel: {
    color: colors.primary,
    fontWeight: "600",
  },
  modelInfo: {
    color: colors.textSecondary,
  },
  modelBold: {
    fontWeight: "600",
    color: colors.textPrimary,
  },
  keyInfo: {
    color: colors.textMuted,
  },
  keyMono: {
    fontFamily: "monospace",
    color: colors.textSecondary,
  },
  testFeedback: {
    paddingHorizontal: 0,
    fontSize: 12,
  },
  testSuccess: {
    color: colors.success,
  },
  testError: {
    color: colors.danger,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  actionButton: {
    borderRadius: radius.sm,
  },
});
