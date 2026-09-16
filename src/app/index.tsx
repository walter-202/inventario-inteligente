import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/constants/theme";

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Lidemoda</Text>
      <Text style={styles.subtitle}>Bienvenido</Text>
      <View style={styles.botones}>
        <Link href="/productos" asChild>
          <Pressable style={styles.botonAzul}>
            <Text style={styles.textoBoton}>Productos</Text>
          </Pressable>
        </Link>
        <Link href="/registrar-producto" asChild>
          <Pressable style={styles.botonNegro}>
            <Text style={styles.textoBoton}>Registrar producto</Text>
          </Pressable>
        </Link>
        <Link href="/inventario" asChild>
          <Pressable style={styles.botonNegro}>
            <Text style={styles.textoBoton}>Inventario</Text>
          </Pressable>
        </Link>
        <Link href="/movimientos" asChild>
          <Pressable style={styles.botonAzul}>
            <Text style={styles.textoBoton}>Movimientos de inventario</Text>
          </Pressable>
        </Link>
        <Link href="/nueva-venta" asChild>
          <Pressable style={styles.botonAzul}>
            <Text style={styles.textoBoton}>Nueva venta</Text>
          </Pressable>
        </Link>
        <Link href="/escanear" asChild>
          <Pressable style={styles.botonNegro}>
            <Text style={styles.textoBoton}>Escanear producto</Text>
          </Pressable>
        </Link>
        <Link href="/registro-voz" asChild>
          <Pressable style={styles.botonAzul}>
            <Text style={styles.textoBoton}>Registro por voz</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: 16,
    color: colors.textSecondary,
  },
  botones: {
    marginTop: spacing.xxl,
    gap: spacing.md,
    alignSelf: "stretch",
  },
  botonAzul: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  botonNegro: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: "center",
    backgroundColor: colors.black,
  },
  textoBoton: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.white,
  },
});