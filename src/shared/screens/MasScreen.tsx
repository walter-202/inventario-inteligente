import { StyleSheet } from "react-native";
import { AlertTriangle, BookOpen, LogOut, Mic, Sparkles, TrendingUp, Users } from "lucide-react-native";
import { Link } from "expo-router";
import { Button, Card, Text } from "react-native-paper";
import { ScreenContainer } from "../components/ScreenContainer";
import { AppHeader } from "../components/AppHeader";
import { useConfirm } from "../components/ConfirmDialog";
import { spacing } from "../theme";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { can, roleLabels } from "../../features/auth/lib/permissions";

export function MasScreen() {
  const { profile, signOut } = useAuth();
  const { requestConfirm, dialog } = useConfirm();

  const cerrarSesion = async () => {
    const ok = await requestConfirm({
      title: "Cerrar sesión",
      message: "Vas a salir de tu cuenta en este dispositivo y vas a tener que iniciar sesión de nuevo.",
      confirmLabel: "Cerrar sesión",
      danger: false,
    });
    if (ok) void signOut();
  };

  return (
    <ScreenContainer scroll>
      {dialog}
      <AppHeader title="Más" subtitle={profile ? `${profile.nombre ?? profile.email ?? "Cuenta"} · ${roleLabels[profile.rol]}` : "Herramientas de Lidemoda"} />
      <Card mode="outlined">
        <Card.Content style={styles.content}>
          <Text variant="titleMedium">Sesión</Text>
          <Text>{profile?.email ?? "Cuenta autenticada"}</Text>
          <Button mode="outlined" icon={() => <LogOut size={18} />} onPress={() => void cerrarSesion()}>
            Cerrar sesión
          </Button>
        </Card.Content>
      </Card>
      <Card mode="outlined">
        <Card.Content style={styles.content}>
          <Text variant="titleMedium">Operaciones y Auditoría</Text>
          {can(profile?.rol, "users.manage") && (
            <Link href={"/usuarios" as any} asChild>
              <Button mode="contained-tonal" icon={() => <Users size={18} color="#7C3AED" />}>
                Colaboradores y Roles (Admin)
              </Button>
            </Link>
          )}
          <Link href={"/rotacion" as any} asChild>
            <Button mode="outlined" icon={() => <TrendingUp size={18} color="#2563EB" />}>
              Rotación y Marketing IA (RF-26/28)
            </Button>
          </Link>
          <Link href={"/alertas-stock" as any} asChild>
            <Button mode="outlined" icon={() => <AlertTriangle size={18} color="#D97706" />}>
              Stock Crítico y Reabastecimiento IA (RF-08/26)
            </Button>
          </Link>
          <Link href={"/kardex" as any} asChild>
            <Button mode="outlined" icon={() => <BookOpen size={18} />}>
              Kardex e Historial de Movimientos (RF-12)
            </Button>
          </Link>
          <Link href="/movimientos" asChild>
            <Button mode="outlined">Movimientos y Despachos</Button>
          </Link>
          <Link href="/registro-voz" asChild>
            <Button mode="outlined" icon={() => <Mic size={18} />}>
              Registrar por voz
            </Button>
          </Link>
          <Link href="/ajustes-ia" asChild>
            <Button mode="outlined" icon={() => <Sparkles size={18} />}>
              Configuración de IA (API Keys & Modelos)
            </Button>
          </Link>
        </Card.Content>
      </Card>
    </ScreenContainer>
  );
}
const styles = StyleSheet.create({ content: { gap: spacing.md } });
