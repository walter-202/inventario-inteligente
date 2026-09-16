import { StyleSheet, Text, View } from "react-native";
import { Producto } from "@/lib/api";
import { colors, radius, spacing } from "@/constants/theme";
import { formatearPrecio } from "@/lib/utils";

interface Props {
  producto: Producto;
}

export function ProductoCard({ producto }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.filaSuperior}>
        <Text style={styles.nombre} numberOfLines={1}>
          {producto.nombre}
        </Text>
        <Text style={styles.precio}>{formatearPrecio(producto.precio)}</Text>
      </View>
      <View style={styles.filaInferior}>
        <Text style={styles.codigo}>Código: {producto.codigo}</Text>
        <View style={styles.etiqueta}>
          <Text style={styles.etiquetaTexto} numberOfLines={1}>
            {producto.categoria}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  filaSuperior: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  nombre: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  precio: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.primary,
  },
  filaInferior: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  codigo: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
  },
  etiqueta: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    maxWidth: "55%",
  },
  etiquetaTexto: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primaryDark,
  },
});