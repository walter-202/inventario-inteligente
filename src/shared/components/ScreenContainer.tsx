import type { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, View, type ScrollViewProps, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../theme";

type ScreenContainerProps = PropsWithChildren<{
  scroll?: boolean;
  contentContainerStyle?: ScrollViewProps["contentContainerStyle"];
}> & ViewProps;

export function ScreenContainer({ children, scroll = false, contentContainerStyle, style, ...rest }: ScreenContainerProps) {
  if (scroll) {
    return (
      <SafeAreaView style={[styles.safe, style]} edges={["top"]}>
        <ScrollView contentContainerStyle={[styles.content, contentContainerStyle]} keyboardShouldPersistTaps="handled" {...rest}>
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={[styles.safe, style]} edges={["top"]} {...rest}>
      <View style={styles.centered}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  // Columna centrada con ancho máximo: en teléfono respira con padding,
  // en tablet/web no se estira a los bordes.
  content: { width: "100%", maxWidth: 720, alignSelf: "center", padding: spacing.lg, paddingBottom: spacing.xxxl },
  centered: {
    flex: 1,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
