import { useEffect, useRef } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, Button, IconButton, Portal, Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Mic, Square, X } from "lucide-react-native";
import { colors, spacing } from "../../../shared/theme";

interface VoiceModeOverlayProps {
  visible: boolean;
  transcript: string;
  recording: boolean;
  interpreting: boolean;
  isAvailable: boolean;
  permissionGranted: boolean;
  onToggle: () => void;
  onSend: () => void;
  onClose: () => void;
  onRequestPermission: () => void;
}

/**
 * Símbolo de espera/escucha: barras que bailan mientras graba y quedan
 * quietas como indicador de "te escucho" cuando espera tu voz.
 */
function WaveBars({ active }: { active: boolean }) {
  const bars = useRef(Array.from({ length: 7 }, () => new Animated.Value(0.35))).current;

  useEffect(() => {
    if (!active) {
      bars.forEach((bar) => bar.setValue(0.35));
      return;
    }
    const loops = bars.map((bar) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(bar, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(bar, { toValue: 0.3, duration: 320, useNativeDriver: true }),
        ]),
      ),
    );
    const starters = loops.map((loop, index) => setTimeout(() => loop.start(), index * 110));
    return () => {
      starters.forEach((timer) => clearTimeout(timer));
      loops.forEach((loop) => loop.stop());
    };
  }, [active, bars]);

  return (
    <View style={waveStyles.row} accessibilityLabel={active ? "Escuchando" : "En espera de tu voz"}>
      {bars.map((bar, index) => (
        <Animated.View key={index} style={[waveStyles.bar, { transform: [{ scaleY: bar }] }]} />
      ))}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 36 },
  bar: { width: 6, height: 30, borderRadius: 3, backgroundColor: colors.primary },
});
/**
 * Modo voz simple: orbe central para dictar, símbolo de espera animado,
 * texto en vivo y enviar. STT on-device del sistema (sin Whisper ni
 * multimodales); en Expo Go explica cómo seguir por texto.
 */
export function VoiceModeOverlay({
  visible,
  transcript,
  recording,
  interpreting,
  isAvailable,
  permissionGranted,
  onToggle,
  onSend,
  onClose,
  onRequestPermission,
}: VoiceModeOverlayProps) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible || !recording) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.1, duration: 550, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, recording, pulse]);

  if (!visible) return null;
  const canTalk = isAvailable && permissionGranted;
  return (
    <Portal>
      <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
        <View style={styles.overlay}>
          <View style={styles.header}>
        <Text variant="titleMedium" style={styles.title}>
          Modo voz
        </Text>
        <IconButton icon={() => <X size={22} />} onPress={onClose} accessibilityLabel="Cerrar modo voz" />
      </View>

      {!isAvailable ? (
        <View style={styles.notice}>
          <Text variant="bodyMedium" style={styles.noticeText}>
            El dictado por voz necesita un development build con el micrófono del sistema. Podés dictar en ese build o
            escribir acá mismo y enviar.
          </Text>
        </View>
      ) : !permissionGranted ? (
        <View style={styles.notice}>
          <Text variant="bodyMedium" style={styles.noticeText}>
            Para dictar necesitamos permiso del micrófono.
          </Text>
          <Button mode="contained" onPress={onRequestPermission}>
            Permitir micrófono
          </Button>
        </View>
      ) : (
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <Pressable
            onPress={onToggle}
            style={[styles.orbHit, recording && styles.orbRecording]}
            accessibilityRole="button"
            accessibilityLabel={recording ? "Detener dictado" : "Iniciar dictado"}
          >
            <LinearGradient
              colors={[colors.primary, colors.secondary, colors.tertiary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.orb}
            >
              {recording ? <Square size={36} color={colors.white} /> : <Mic size={40} color={colors.white} />}
            </LinearGradient>
          </Pressable>
        </Animated.View>
      )}

      {interpreting ? null : <WaveBars active={recording || (!transcript && canTalk)} />}

      <Text variant="bodySmall" style={styles.status}>
        {interpreting
          ? "Interpretando…"
          : recording
            ? "Escuchando… tocá el micrófono para terminar"
            : transcript
              ? "Revisá el texto y envialo"
              : canTalk
                ? "Tocá el micrófono y dictá la operación"
                : "Texto reconocido"}
      </Text>

      <ScrollView style={styles.transcriptBox} contentContainerStyle={styles.transcriptContent}>
        {interpreting ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text variant="bodyLarge" style={styles.transcript}>
            {transcript || "—"}
          </Text>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Button mode="outlined" onPress={onClose} style={styles.actionButton}>
          Cerrar
        </Button>
        <Button
          mode="contained"
          onPress={onSend}
          loading={interpreting}
          disabled={interpreting || !transcript.trim()}
          style={styles.actionButton}
        >
          Usar este texto
        </Button>
      </View>
      </View>
    </SafeAreaView>
  </Portal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  overlay: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontWeight: "800", color: colors.textPrimary },
  notice: { backgroundColor: colors.primarySoft, borderRadius: 12, padding: spacing.md, gap: spacing.sm },
  noticeText: { color: colors.textPrimary, lineHeight: 22 },
  orbHit: {
    borderRadius: 60,
    alignSelf: "center",
  },
  orbRecording: {
    borderWidth: 4,
    borderColor: colors.danger,
  },
  orb: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: spacing.md,
  },
  status: { textAlign: "center", color: colors.textSecondary },
  transcriptBox: { flex: 1, backgroundColor: colors.background, borderRadius: 12, padding: spacing.md },
  transcriptContent: { flexGrow: 1, justifyContent: "center" },
  transcript: { color: colors.textPrimary, lineHeight: 26, textAlign: "center" },
  actions: { flexDirection: "row", gap: spacing.sm },
  actionButton: { flex: 1, borderRadius: 12 },
});
