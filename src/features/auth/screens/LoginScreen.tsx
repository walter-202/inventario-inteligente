import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Card, Chip, HelperText, Text, TextInput } from "react-native-paper";

import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { DEFAULT_COLLABORATOR_PASSWORD } from "../../../shared/lib/constants";
import { colors, spacing } from "../../../shared/theme";
import { getAuthErrorMessage } from "../api/authApi";
import { useAuth } from "../hooks/useAuth";

const QUICK_ALIASES: Record<string, string> = {
  admin: "admin.lidemoda@gmail.com",
  administrador: "admin.lidemoda@gmail.com",
  cajera: "cajera.montenegro@gmail.com",
  encargada: "encargada.comercio@gmail.com",
  vendedora: "vendedora.ceja@gmail.com",
  almacen: "almacen.central@gmail.com",
};

export function LoginScreen() {
  const { status, error, session, profile, signIn, signOut, retryProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setFormError(null);
    setSubmitting(true);
    try {
      const raw = email.trim().toLowerCase();
      const targetEmail = QUICK_ALIASES[raw] ?? email.trim();
      await signIn(targetEmail, password);
    } catch (nextError) {
      setFormError(getAuthErrorMessage(nextError));
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading" && !session) {
    return (
      <ScreenContainer>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Comprobando sesión...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (status === "blocked" && session) {
    return (
      <ScreenContainer>
        <View style={styles.centered}>
          <Card mode="outlined" style={styles.card}>
            <Card.Content style={styles.content}>
              <Text variant="headlineSmall">Acceso pendiente</Text>
              <Text style={styles.copy}>
                {profile?.nombre ? `Hola, ${profile.nombre}. ` : ""}
                {error ?? "Administración debe habilitar tu perfil antes de usar Lidemoda."}
              </Text>
              <Text style={styles.copy}>
                No se asignan roles ni sucursales desde la aplicación. Contactá a administración para solicitar acceso.
              </Text>
              <Button mode="outlined" onPress={() => void retryProfile()}>
                Reintentar
              </Button>
              <Button mode="text" onPress={() => void signOut()}>
                Cerrar sesión
              </Button>
            </Card.Content>
          </Card>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <KeyboardAvoidingView style={styles.centered} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Card mode="outlined" style={styles.card}>
          <Card.Content style={styles.content}>
            <Text variant="headlineMedium" style={styles.title}>Lidemoda</Text>
            <Text style={styles.copy}>Ingresá con la cuenta que te asignó administración.</Text>
            <TextInput
              label="Correo electrónico"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              disabled={submitting}
            />
            <TextInput
              label="Contraseña"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              textContentType="password"
              disabled={submitting}
            />
            <HelperText type="error" visible={Boolean(formError || error)}>
              {formError ?? error ?? ""}
            </HelperText>
            <Button mode="contained" onPress={() => void submit()} loading={submitting} disabled={submitting}>
              Iniciar sesión
            </Button>

            {__DEV__ && (
              <View style={styles.devBox}>
                <Text variant="labelSmall" style={styles.devTitle}>Atajos de prueba rápida:</Text>
                <View style={styles.devChips}>
                  <Chip
                    compact
                    mode="outlined"
                    onPress={() => {
                      setEmail("admin.lidemoda@gmail.com");
                      setPassword(DEFAULT_COLLABORATOR_PASSWORD);
                    }}
                  >
                    Admin
                  </Chip>
                  <Chip
                    compact
                    mode="outlined"
                    onPress={() => {
                      setEmail("cajera.montenegro@gmail.com");
                      setPassword(DEFAULT_COLLABORATOR_PASSWORD);
                    }}
                  >
                    Cajera
                  </Chip>
                  <Chip
                    compact
                    mode="outlined"
                    onPress={() => {
                      setEmail("encargada.comercio@gmail.com");
                      setPassword(DEFAULT_COLLABORATOR_PASSWORD);
                    }}
                  >
                    Encargada
                  </Chip>
                  <Chip
                    compact
                    mode="outlined"
                    onPress={() => {
                      setEmail("almacen.central@gmail.com");
                      setPassword(DEFAULT_COLLABORATOR_PASSWORD);
                    }}
                  >
                    Almacén
                  </Chip>
                  <Chip
                    compact
                    mode="outlined"
                    onPress={() => {
                      setEmail("vendedora.ceja@gmail.com");
                      setPassword(DEFAULT_COLLABORATOR_PASSWORD);
                    }}
                  >
                    Vendedora
                  </Chip>
                </View>
              </View>
            )}

            <Text variant="bodySmall" style={styles.hint}>
              Si todavía no tenés una cuenta, solicitá acceso a administración. El registro público está deshabilitado.
            </Text>
          </Card.Content>
        </Card>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  card: { width: "100%", maxWidth: 460, alignSelf: "center" },
  content: { gap: spacing.md },
  title: { color: colors.primary, fontWeight: "700" },
  copy: { color: colors.textSecondary, lineHeight: 22 },
  muted: { color: colors.textSecondary },
  hint: { color: colors.textSecondary, textAlign: "center" },
  devBox: {
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.sm,
    borderRadius: 12,
    gap: spacing.xs,
  },
  devTitle: {
    color: colors.textMuted,
    fontWeight: "600",
  },
  devChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
});
