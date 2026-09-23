import { useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { ActivityIndicator, Surface, Text } from "react-native-paper";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react-native";
import { colors, spacing } from "../../../shared/theme";

interface ThinkingTraceProps {
  thoughts?: string[];
  durationMs?: number;
  isActive?: boolean;
  activeStatusText?: string;
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * Indicador de pensamientos y razonamiento al estilo Claude, ChatGPT y Gemini.
 * Mientras corre, muestra un spinner y el tiempo transcurrido para que se note
 * que sigue ejecutando aunque el modelo no emita texto.
 */
export function ThinkingTrace({ thoughts, durationMs, isActive, activeStatusText }: ThinkingTraceProps) {
  const [expanded, setExpanded] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    setElapsedMs(0);
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 400);
    return () => clearInterval(timer);
  }, [isActive]);

  if (isActive) {
    const status = activeStatusText?.trim() || thoughts?.[thoughts.length - 1] || "Pensando…";
    const headline = elapsedMs < 1000 ? "Trabajando…" : `Sigue trabajando · ${formatElapsed(elapsedMs)}`;
    const hint = elapsedMs >= 8000 ? "Sigue consultando, no se trabó." : status;
    return (
      <Surface style={styles.activeContainer} elevation={0}>
        <View style={styles.activeRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <View style={styles.activeCopy}>
            <Text variant="bodySmall" style={styles.activeText}>
              {headline}
            </Text>
            <Text variant="labelSmall" style={styles.activeHint}>
              {hint}
            </Text>
          </View>
        </View>
      </Surface>
    );
  }

  if (!thoughts || thoughts.length === 0) return null;

  const durationText = durationMs ? ` · ${(durationMs / 1000).toFixed(1)}s` : "";

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((prev) => !prev)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Sparkles size={13} color={colors.textSecondary} />
          <Text variant="labelSmall" style={styles.headerTitle}>
            Razonamiento ({thoughts.length} pasos{durationText})
          </Text>
        </View>
        {expanded ? (
          <ChevronUp size={14} color={colors.textSecondary} />
        ) : (
          <ChevronDown size={14} color={colors.textSecondary} />
        )}
      </TouchableOpacity>

      {expanded ? (
        <Surface style={styles.stepsBox} elevation={0}>
          {thoughts.map((step, index) => (
            <View key={`${index}-${step.slice(0, 10)}`} style={styles.stepRow}>
              <View style={styles.stepDot} />
              <Text variant="bodySmall" style={styles.stepText}>
                {step}
              </Text>
            </View>
          ))}
        </Surface>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  activeContainer: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    alignSelf: "flex-start",
    marginBottom: spacing.xs,
  },
  activeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  activeCopy: {
    gap: 2,
    flexShrink: 1,
  },
  activeText: {
    color: colors.primary,
    fontWeight: "700",
  },
  activeHint: {
    color: colors.textSecondary,
  },
  container: {
    marginBottom: spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.03)",
    alignSelf: "flex-start",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  headerTitle: {
    color: colors.textSecondary,
    fontWeight: "500",
  },
  stepsBox: {
    marginTop: 4,
    padding: spacing.xs + 2,
    backgroundColor: "#F9FAFB",
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
    borderRadius: 4,
    gap: 4,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  stepDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  stepText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
});
