import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { AssistantReply, type AssistantAction } from "./AssistantReply";
import type { ChatMessage } from "../lib/chatSession";
import { colors, spacing } from "../../../shared/theme";

interface ChatMessageBubbleProps {
  message: ChatMessage;
  actions?: AssistantAction[];
  children?: ReactNode;
}

/** Burbuja estilo chat: usuario a la derecha, asistente con tono + adjuntos. */
export function ChatMessageBubble({ message, actions, children }: ChatMessageBubbleProps) {
  if (message.role === "usuario") {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text variant="bodyMedium" style={styles.userText}>
            {message.texto}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.assistantRow}>
      <View style={styles.assistantBubble}>
        <AssistantReply message={{ tone: message.tone ?? "info", text: message.texto, actions }} />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: { flexDirection: "row", justifyContent: "flex-end" },
  userBubble: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
    maxWidth: "85%",
  },
  userText: { color: colors.white, lineHeight: 20 },
  assistantRow: { flexDirection: "row", justifyContent: "flex-start" },
  assistantBubble: { maxWidth: "92%", flex: 1, gap: spacing.xs },
});
