import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";

interface AppModalOverlayProps {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
}

/**
 * Contenedor modal nativo que se dibuja por encima de pantallas con
 * presentation:"modal" en React Navigation. Los Portal de Paper quedan detrás
 * de esas capas nativas y los diálogos no se ven.
 */
export function AppModalOverlay({ visible, onDismiss, children }: AppModalOverlayProps) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityRole="button" />
        <View style={styles.content} pointerEvents="box-none">
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  content: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
});
