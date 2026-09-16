import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Button, Divider, Drawer, IconButton, Portal, Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { MessageSquareText, Plus, SlidersHorizontal, Trash2, X } from "lucide-react-native";
import type { ChatSession, EstadoSesion } from "../lib/chatSession";
import type { PreferredMode } from "../../../shared/lib/secureKeyStore";
import { ProviderSelectModal } from "./ProviderSelectModal";
import { colors, spacing } from "../../../shared/theme";

interface SessionDrawerProps {
  open: boolean;
  sessions: ChatSession[];
  activeSessionId: string | null;
  mode: PreferredMode;
  onClose: () => void;
  onNew: () => void;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onModeChange: (mode: PreferredMode) => void;
}

const PANEL_WIDTH = 300;

const ESTADO_COLOR: Record<EstadoSesion, string> = {
  activa: colors.primary,
  completada: colors.successDark,
  cancelada: colors.textSecondary,
};

const OBJETIVO_LABEL: Record<ChatSession["objetivo"], string> = {
  venta: "Venta",
  consulta: "Consulta",
  registro: "Alta",
  indefinido: "Chat",
};

const MOTORES: { id: PreferredMode; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "groq", label: "Groq" },
  { id: "cerebras", label: "Cerebras" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "gemini", label: "Gemini" },
  { id: "heuristic", label: "Offline" },
];

function fechaCorta(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString("es-BO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * Cajón lateral: entra desde la izquierda con deslizamiento + fundido.
 * Contenido con `Drawer.Section`/`Drawer.Item` de Paper. Las filas de chat
 * usan dos táctiles hermanos (elegir + borrar) para no anidar pressables.
 */
export function SessionDrawer({
  open,
  sessions,
  activeSessionId,
  mode,
  onClose,
  onNew,
  onSelect,
  onDelete,
  onModeChange,
}: SessionDrawerProps) {
  const [render, setRender] = useState(open);
  const slide = useRef(new Animated.Value(-PANEL_WIDTH - 20)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setRender(true);
      Animated.parallel([
        Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slide, { toValue: -PANEL_WIDTH - 20, duration: 180, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setRender(false);
      });
    }
  }, [open, slide, fade]);

  const [providerOpen, setProviderOpen] = useState(false);
  const motorActual = MOTORES.find((motor) => motor.id === mode)?.label ?? mode;

  if (!render) return null;
  const ordered = [...sessions].reverse();
  return (
    <Portal>
      <View style={styles.overlay}>
        <Animated.View style={[styles.panel, { transform: [{ translateX: slide }] }]}>
          <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
            <View style={styles.header}>
              <Text variant="titleMedium" style={styles.title}>
                Chats
              </Text>
              <IconButton icon={() => <X size={20} />} onPress={onClose} />
            </View>
            <Button mode="contained" icon={() => <Plus size={18} />} onPress={onNew} style={styles.newButton}>
              Nuevo chat
            </Button>
            <Divider />
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              <Drawer.Section title="Historial" showDivider={false}>
                {ordered.length === 0 ? (
                  <Text variant="bodySmall" style={styles.empty}>
                    Todavía no hay chats. Son cortos: una venta o una consulta y listo.
                  </Text>
                ) : (
                  ordered.map((session) => {
                    const isActive = session.id === activeSessionId;
                    const reanudable = session.estado !== "completada";
                    return (
                      <View key={session.id} style={[styles.chatRow, isActive && styles.chatRowActive]}>
                        <Pressable
                          onPress={() => onSelect(session.id)}
                          style={styles.chatMain}
                          accessibilityRole="button"
                          accessibilityLabel={`Abrir chat ${session.resumen ?? session.id}`}
                        >
                          <MessageSquareText size={18} color={isActive ? colors.primary : colors.textSecondary} />
                          <View style={styles.chatCopy}>
                            <Text variant="bodyMedium" style={styles.chatTitle} numberOfLines={1}>
                              {session.resumen ?? `${OBJETIVO_LABEL[session.objetivo]} nuevo`}
                            </Text>
                            <Text variant="bodySmall" style={[styles.chatMeta, { color: ESTADO_COLOR[session.estado] }]}>
                              {OBJETIVO_LABEL[session.objetivo]} · {session.estado}
                              {reanudable ? "" : " · solo lectura"} · {fechaCorta(session.updatedAt)}
                            </Text>
                          </View>
                        </Pressable>
                        <IconButton
                          icon={() => <Trash2 size={18} />}
                          onPress={() => onDelete(session.id)}
                          accessibilityLabel={`Borrar chat ${session.resumen ?? session.id}`}
                        />
                      </View>
                    );
                  })
                )}
              </Drawer.Section>
              <Drawer.Section title="Configuración" showDivider={false}>
                <Drawer.Item
                  label="Motor de IA"
                  icon={() => <SlidersHorizontal size={18} color={colors.textSecondary} />}
                  right={() => <Text variant="bodyMedium" style={styles.motorValue}>{motorActual}</Text>}
                  onPress={() => setProviderOpen(true)}
                />
              </Drawer.Section>
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
        <Animated.View style={[styles.scrim, { opacity: fade }]}>
          <Pressable style={styles.scrimPress} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar historial" />
        </Animated.View>
        <ProviderSelectModal
          visible={providerOpen}
          value={mode}
          onSelect={(next) => {
            onModeChange(next);
            setProviderOpen(false);
          }}
          onDismiss={() => setProviderOpen(false)}
        />
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, flexDirection: "row" },
  panel: {
    width: PANEL_WIDTH,
    maxWidth: "85%",
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    marginRight: -1,
    elevation: 16,
    shadowColor: colors.black,
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  scrim: { flex: 1, backgroundColor: colors.backdrop },
  scrimPress: { flex: 1 },
  safe: { flex: 1, paddingVertical: spacing.sm, gap: spacing.xs },
  motorValue: { color: colors.primary, fontWeight: "700" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.sm },
  title: { fontWeight: "800", color: colors.textPrimary },
  newButton: { marginHorizontal: spacing.sm, borderRadius: 10 },
  list: { flex: 1 },
  listContent: { paddingBottom: spacing.md },
  empty: { color: colors.textSecondary, lineHeight: 20, paddingHorizontal: spacing.md },
  chatRow: { flexDirection: "row", alignItems: "center", paddingLeft: spacing.xs, borderRadius: 10, marginHorizontal: spacing.xs },
  chatRowActive: { backgroundColor: colors.primarySoft },
  chatMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: 6 },
  chatCopy: { flex: 1, gap: 1 },
  chatTitle: { color: colors.textPrimary, fontWeight: "600" },
  chatMeta: { fontSize: 11 },
});
