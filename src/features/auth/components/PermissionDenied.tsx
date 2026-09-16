import { StyleSheet, View } from "react-native";
import { Button, Card, Text } from "react-native-paper";
import { router } from "expo-router";

import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { colors, spacing } from "../../../shared/theme";

interface PermissionDeniedProps {
  title?: string;
  message?: string;
}

export function PermissionDenied({
  title = "Acceso restringido",
  message = "Tu rol no tiene permiso para realizar esta operación.",
}: PermissionDeniedProps) {
  return (
    <ScreenContainer>
      <View style={styles.centered}>
        <Card mode="outlined">
          <Card.Content style={styles.content}>
            <Text variant="titleLarge">{title}</Text>
            <Text style={styles.copy}>{message}</Text>
            <Button mode="outlined" onPress={() => router.back()}>Volver</Button>
          </Card.Content>
        </Card>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center" },
  content: { gap: spacing.md },
  copy: { color: colors.textSecondary, lineHeight: 22 },
});
