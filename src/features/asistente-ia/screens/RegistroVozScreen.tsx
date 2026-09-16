import { useEffect, useState } from "react";
import { ActivityIndicator, Button, Card, Text } from "react-native-paper";
import { router } from "expo-router";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { colors, spacing } from "../../../shared/theme";
import { StyleSheet, View } from "react-native";

type VoiceView = React.ComponentType;

/**
 * La voz es opcional: los hooks usan loader seguro (Expo Go compatible),
 * así que esta pantalla solo carga la vista y deja que el micrófono
 * se degrade a entrada manual cuando no hay módulo nativo.
 */
export function RegistroVozScreen() {
  const [view, setView] = useState<VoiceView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    import("./VoiceCommandView")
      .then((module) => { if (active) setView(() => module.default ?? module.VoiceCommandView); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  if (failed) return <ScreenContainer scroll><Card mode="outlined"><Card.Content style={styles.content}><Text variant="titleLarge">Registro por voz</Text><Text style={styles.copy}>No se pudo cargar el registro por voz.</Text><Button mode="contained" onPress={() => router.back()}>Volver</Button></Card.Content></Card></ScreenContainer>;
  if (view) { const VoiceCommand = view; return <VoiceCommand />; }
  return <ScreenContainer><View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text>Cargando registro por voz...</Text></View></ScreenContainer>;
}

const styles = StyleSheet.create({ content: { gap: spacing.md }, copy: { color: colors.textSecondary, lineHeight: 22 }, loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md } });
