import { StyleSheet, Text, View } from "react-native";
import { InventarioItem } from "@/lib/api";
import { colors, radius, spacing } from "@/constants/theme";

interface Props {
  item: InventarioItem;
}

export function InventarioCard({ item }: Props) {
  const sinStock = item.cantidad === 0;
  const { nombre, codigo, categoria } = item.producto;

  return (
    <View
      style={[styles.card, sinStock ? styles.cardSinStock : styles.cardConStock]}
    >
      <View style={styles.filaSuperior}>
        <Text style={styles.nombre} numberOfLines={1}>
          {nombre}
        </Text>
        <View
          style={[
            styles.insignia,
            sinStock ? styles.insigniaSinStock : styles.insigniaDisponible,
          ]}
        >
          <Text
            style={[
              styles.insigniaTexto,
              sinStock
                ? styles.insigniaTextoSinStock
                : styles.insigniaTextoDisponible,
            ]}
          >
            {sinStock ? "Sin stock" : `Disponible: ${item.cantidad}`}
          </Text>
        </View>
      </View>
      <View style={styles.filaInferior}>
        <Text style={styles.codigo} numberOfLines={1}>
          Código: {codigo}
        </Text>
        {categoria ? (
          <View style={styles.etiqueta}>
            <Text style={styles.etiquetaTexto} numberOfLines={1}>
              {categoria}
            </Text>
          </View>
        ) : null}
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
    borderLeftWidth: 4,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardConStock: {
    borderLeftColor: colors.primary,
  },
  cardSinStock: {
    borderLeftColor: colors.danger,
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
  insignia: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  insigniaDisponible: {
    backgroundColor: colors.primarySoft,
  },
  insigniaSinStock: {
    backgroundColor: colors.dangerSoft,
  },
  insigniaTexto: {
    fontSize: 12,
    fontWeight: "700",
  },
  insigniaTextoDisponible: {
    color: colors.primaryDark,
  },
  insigniaTextoSinStock: {
    color: colors.danger,
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