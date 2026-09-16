import { useEffect, useState } from "react";
import { ActivityIndicator, Button, Card, Text } from "react-native-paper";
import { router } from "expo-router";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { colors, spacing } from "../../../shared/theme";
import { StyleSheet, View } from "react-native";

type VoiceView = React.ComponentType;
const unavailableMessage = "El registro por voz requiere la versión de desarrollo de la aplicación.";

/** Keeps the existing Expo Go/development-build fallback without putting logic in the route file. */
export function RegistroVozScreen() {
  const [view, setView] = useState<VoiceView | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([import("expo-speech-recognition"), import("./VoiceCommandView")])
      .then(([, module]) => { if (active) setView(() => module.default ?? module.VoiceCommandView); })
      .catch(() => { if (active) setUnavailable(true); });
    return () => { active = false; };
  }, []);
  if (unavailable) return <ScreenContainer scroll><Card mode="outlined"><Card.Content style={styles.content}><Text variant="titleLarge">Registro por voz</Text><Text style={styles.copy}>{unavailableMessage}</Text><Button mode="contained" onPress={() => router.back()}>Volver</Button></Card.Content></Card></ScreenContainer>;
  if (view) { const VoiceCommand = view; return <VoiceCommand />; }
  return <ScreenContainer><View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text>Cargando registro por voz...</Text></View></ScreenContainer>;
}

const styles = StyleSheet.create({ content: { gap: spacing.md }, copy: { color: colors.textSecondary, lineHeight: 22 }, loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md } });
