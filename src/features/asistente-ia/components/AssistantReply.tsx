import { Button, Surface, Text } from "react-native-paper";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { colors, spacing } from "../../../shared/theme";

export type AssistantTone = "info" | "success" | "warning" | "error";

export interface AssistantAction {
  label: string;
  onPress: () => void;
}

export interface AssistantMessage {
  tone: AssistantTone;
  text: string;
  actions?: AssistantAction[];
}

const TONE_STYLE: Record<AssistantTone, { bg: string; border: string; color: string }> = {
  info: { bg: "#EFF6FF", border: "#93C5FD", color: "#1D4ED8" },
  success: { bg: "#ECFDF5", border: "#6EE7B7", color: "#047857" },
  warning: { bg: "#FFFBEB", border: "#FCD34D", color: "#B45309" },
  error: { bg: "#FEF2F2", border: "#FCA5A5", color: "#B91C1C" },
};

function ToneIcon({ tone }: { tone: AssistantTone }) {
  const color = TONE_STYLE[tone].color;
  if (tone === "success") return <CheckCircle2 size={18} color={color} />;
  if (tone === "warning") return <AlertTriangle size={18} color={color} />;
  if (tone === "error") return <AlertCircle size={18} color={color} />;
  return <Info size={18} color={color} />;
}

/** Burbuja conversacional del asistente: explica qué pasó y ofrece correcciones. */
export function AssistantReply({ message }: { message: AssistantMessage }) {
  const tone = TONE_STYLE[message.tone];
  return (
    <Surface
      style={[styles.card, { backgroundColor: tone.bg, borderColor: tone.border }]}
      elevation={0}
    >
      <View style={styles.row}>
        <ToneIcon tone={message.tone} />
        <Text variant="bodyMedium" style={[styles.text, { color: tone.color }]}>
          {message.text}
        </Text>
      </View>
      {message.actions?.length ? (
        <View style={styles.actions}>
          {message.actions.map((action) => (
            <Button
              key={action.label}
              compact
              mode="outlined"
              onPress={action.onPress}
              textColor={tone.color}
              style={[styles.actionButton, { borderColor: tone.border }]}
            >
              {action.label}
            </Button>
          ))}
        </View>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: spacing.sm + 2,
    borderWidth: 1,
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  text: {
    flex: 1,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: 2,
    paddingLeft: 26,
  },
  actionButton: {
    borderRadius: 8,
  },
});
