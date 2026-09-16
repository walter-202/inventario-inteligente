import { StyleSheet } from "react-native";
import { Mic, Sparkles } from "lucide-react-native";
import { Link } from "expo-router";
import { Button, Card, Text } from "react-native-paper";
import { ScreenContainer } from "../components/ScreenContainer";
import { AppHeader } from "../components/AppHeader";
import { spacing } from "../theme";

export function MasScreen() {
  return (
    <ScreenContainer scroll>
      <AppHeader title="Más" subtitle="Herramientas de Lidemoda" />
      <Card mode="outlined">
        <Card.Content style={styles.content}>
          <Text variant="titleMedium">Operaciones</Text>
          <Link href="/movimientos" asChild>
            <Button mode="outlined">Movimientos de inventario</Button>
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
