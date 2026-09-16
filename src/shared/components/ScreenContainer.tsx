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
  return <SafeAreaView style={[styles.safe, style]} edges={["top"]} {...rest}>{children}</SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
});
