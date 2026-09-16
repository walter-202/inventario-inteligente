import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors, radius, spacing } from "@/constants/theme";

type ComponenteVoz = React.ComponentType<object>;

const MENSAJE_NO_DISPONIBLE =
  "El registro por voz requiere la versión de desarrollo de la aplicación.";

export default function RegistroVozScreen() {
  const [estado, setEstado] = useState<"cargando" | "noDisponible" | "listo">(
    "cargando"
  );
  const [PantallaVoz, setPantallaVoz] = useState<ComponenteVoz | null>(null);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        await import("expo-speech-recognition");
        const modulo = await import("@/components/registro-voz-pantalla");
        if (!activo) return;
        setPantallaVoz(() => modulo.default as ComponenteVoz);
        setEstado("listo");
      } catch {
        if (activo) setEstado("noDisponible");
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  if (estado === "noDisponible") {
    return (
      <SafeAreaView style={styles.pantalla} edges={["top"]}>
        <View style={styles.contenido}>
          <Text style={styles.titulo}>Registro por voz</Text>
          <View style={styles.tarjetaInfo}>
            <Text style={styles.textoInfo}>{MENSAJE_NO_DISPONIBLE}</Text>
            <Text style={styles.textoSecundario}>
              Esta función estará disponible cuando ejecutes Lidemoda con un
              development build.
            </Text>
            <Pressable style={styles.boton} onPress={() => router.back()}>
              <Text style={styles.textoBoton}>Volver</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (estado === "listo" && PantallaVoz) {
    return <PantallaVoz />;
  }

  return (
    <SafeAreaView style={styles.pantalla} edges={["top"]}>
      <View style={styles.contenido}>
        <View style={styles.zonaCarga}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.textoSecundario}>Cargando registro por voz...</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contenido: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  zonaCarga: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  tarjetaInfo: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.lg,
  },
  titulo: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  textoInfo: {
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: "center",
    lineHeight: 22,
  },
  textoSecundario: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  boton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  textoBoton: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.white,
  },
});