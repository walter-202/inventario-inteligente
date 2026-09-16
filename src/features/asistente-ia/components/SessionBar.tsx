import { StyleSheet, View } from "react-native";
import { Chip, Text } from "react-native-paper";
import type { ChatSession, EstadoSesion } from "../lib/chatSession";
import { colors, spacing } from "../../../shared/theme";

interface SessionBarProps {
  active: ChatSession | null;
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

/** Estado de la sesión en curso. El historial vive en el cajón lateral. */
export function SessionBar({ active }: SessionBarProps) {
  return (
    <View style={styles.bar}>
      {active ? (
        <Chip compact icon="lightning-bolt" style={styles.activeChip} textStyle={styles.activeText}>
          {OBJETIVO_LABEL[active.objetivo]} · {ESTADO_LABEL[active.estado]}
        </Chip>
      ) : (
        <Text variant="bodySmall" style={styles.idle}>
          Sin sesión activa. Escribí abajo para empezar.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", paddingBottom: 2 },
  activeChip: { backgroundColor: colors.primarySoft },
  activeText: { color: colors.primary, fontWeight: "700" },
  idle: { color: colors.textSecondary },
});
