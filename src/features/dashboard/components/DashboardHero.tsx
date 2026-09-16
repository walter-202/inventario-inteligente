import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "react-native-paper";
import { formatearPrecio } from "../../../shared/lib/utils";
import { colors, gradients, spacing } from "../../../shared/theme";

interface DashboardHeroProps {
  totalHoy: number;
  total7d: number;
  operaciones: number;
  sucursal?: string | null;
}

/** Tarjeta héroe con degradado cálido: lo primero que se ve del panel. */
export function DashboardHero({ totalHoy, total7d, operaciones, sucursal }: DashboardHeroProps) {
  return (
    <LinearGradient
      colors={[gradients.sunset[0], gradients.sunset[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={styles.circleA} pointerEvents="none" />
      <View style={styles.circleB} pointerEvents="none" />
      <Text variant="bodyMedium" style={styles.label}>
        Ventas de hoy{sucursal ? ` · ${sucursal}` : ""}
      </Text>
      <Text variant="displaySmall" style={styles.total}>
        {formatearPrecio(totalHoy)}
      </Text>
      <Text variant="bodySmall" style={styles.sub}>
        Últimos 7 días {formatearPrecio(total7d)} · {operaciones} operaciones
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 20,
    padding: spacing.lg,
    gap: 2,
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  label: { color: "#FFFFFF", opacity: 0.9 },
  total: { color: "#FFFFFF", fontWeight: "800" },
  sub: { color: "#FFFFFF", opacity: 0.9 },
  circleA: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    right: -50,
    top: -70,
    backgroundColor: "#FFFFFF",
    opacity: 0.14,
  },
  circleB: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    right: 60,
    bottom: -60,
    backgroundColor: "#FFFFFF",
    opacity: 0.12,
  },
});
