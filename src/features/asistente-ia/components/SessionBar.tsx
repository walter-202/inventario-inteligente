import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Chip, Text } from "react-native-paper";
import { Plus } from "lucide-react-native";
import type { ChatSession, EstadoSesion } from "../lib/chatSession";
import { colors, spacing } from "../../../shared/theme";

interface SessionBarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  inspectingId: string | null;
  onNew: () => void;
  onInspect: (sessionId: string | null) => void;
}

const ESTADO_LABEL: Record<EstadoSesion, string> = {
  activa: "Activa",
  completada: "Completada",
  cancelada: "Cancelada",
};

const OBJETIVO_LABEL: Record<ChatSession["objetivo"], string> = {
  venta: "Venta",
  consulta: "Consulta",
  registro: "Alta",
  indefinido: "Chat",
};

/** Sesiones de vida corta: la activa arriba, historial reciente debajo. */
export function SessionBar({ sessions, activeSessionId, inspectingId, onNew, onInspect }: SessionBarProps) {
  const active = sessions.find((session) => session.id === activeSessionId) ?? null;
  const history = sessions.filter((session) => session.id !== activeSessionId).slice(-6).reverse();
  return (
    <View style={styles.bar}>
      <View style={styles.activeRow}>
        {active ? (
          <Chip compact icon="lightning-bolt" style={styles.activeChip} textStyle={styles.activeText}>
            {OBJETIVO_LABEL[active.objetivo]} · {ESTADO_LABEL[active.estado]}
          </Chip>
        ) : (
          <Text variant="bodySmall" style={styles.idle}>
            Sin sesión activa. Escribí abajo para empezar.
          </Text>
        )}
        <Button compact mode="text" icon={() => <Plus size={16} />} onPress={onNew}>
          Nueva
        </Button>
      </View>
      {history.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.history}>
          {history.map((session) => {
            const selected = inspectingId === session.id;
            return (
              <Chip
                key={session.id}
                compact
                selected={selected}
                showSelectedCheck={false}
                onPress={() => onInspect(selected ? null : session.id)}
                style={styles.historyChip}
              >
                {session.resumen ?? `${OBJETIVO_LABEL[session.objetivo]} · ${ESTADO_LABEL[session.estado]}`}
              </Chip>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { gap: spacing.xs, paddingBottom: spacing.xs },
  activeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  activeChip: { backgroundColor: colors.primarySoft },
  activeText: { color: colors.primary, fontWeight: "700" },
  idle: { color: colors.textSecondary },
  history: { gap: 6, paddingVertical: 2 },
  historyChip: { marginRight: 6 },
});
