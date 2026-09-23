import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Sparkles } from "lucide-react-native";
import { AssistantReply, type AssistantAction } from "./AssistantReply";
import { ThinkingTrace } from "./ThinkingTrace";
import type { ChatMessage } from "../lib/chatSession";
import { colors, spacing } from "../../../shared/theme";

interface ChatMessageBubbleProps {
  message: ChatMessage;
  actions?: AssistantAction[];
  children?: ReactNode;
  streaming?: boolean;
}

/** Burbuja estilo chat: usuario a la derecha, asistente con avatar, razonamiento y adjuntos. */
export function ChatMessageBubble({ message, actions, children, streaming }: ChatMessageBubbleProps) {
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
  const hasText = message.texto.trim().length > 0;
  return (
    <View style={styles.assistantRow}>
      <View style={styles.avatar}>
        <Sparkles size={15} color={colors.white} />
      </View>
      <View style={styles.assistantBubble}>
        {streaming && !hasText ? (
          <ThinkingTrace
            isActive
            activeStatusText={message.thoughts?.[message.thoughts.length - 1] ?? "Pensando..."}
          />
        ) : (
          <ThinkingTrace thoughts={message.thoughts} durationMs={message.durationMs} />
        )}
        {hasText ? (
          <AssistantReply message={{ tone: message.tone ?? "info", text: message.texto, actions }} />
        ) : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginVertical: 3,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 4,
    maxWidth: "85%",
  },
  userText: { color: colors.white, lineHeight: 20 },
  assistantRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    gap: spacing.xs + 2,
    marginVertical: 4,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  assistantBubble: {
    maxWidth: "88%",
    flex: 1,
    gap: spacing.xs,
  },
});

