import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Divider, Surface, Text, TextInput } from "react-native-paper";
import { Layers, PackagePlus, Store, Tag } from "lucide-react-native";
import type { RegistroProductoParsed } from "../api/voiceRegistrationService";
import { colors, spacing } from "../../../shared/theme";
import { formatearPrecio } from "../../../shared/lib/utils";

interface ProductRegistrationCardProps {
  initialData: RegistroProductoParsed;
  branchName: string;
  branchId: number;
  loading?: boolean;
  canWrite?: boolean;
  onConfirm: (input: {
    nombre: string;
    codigo: string;
    codigo_barra?: string | null;
    categoria: string;
    precio: number;
    cantidad: number;
    sucursal_id: number;
  }) => void;
  onOpenForm: (input: RegistroProductoParsed) => void;
  onCancel: () => void;
}

/**
 * Tarjeta interactiva en el chat para previsualizar y dar de alta
 * un nuevo producto en catálogo sin salir del flujo conversacional.
 */
export function ProductRegistrationCard({
  initialData,
  branchName,
  branchId,
  loading = false,
  canWrite = true,
  onConfirm,
  onOpenForm,
  onCancel,
}: ProductRegistrationCardProps) {
  const [nombre, setNombre] = useState(initialData.nombre ?? "");
  const [codigo, setCodigo] = useState(initialData.codigo ?? "");
  const [codigoBarra, setCodigoBarra] = useState(initialData.codigo_barra ?? "");
  const [categoria, setCategoria] = useState(initialData.categoria ?? "Ropa");
  const [precio, setPrecio] = useState(initialData.precio != null ? String(initialData.precio) : "");
  const [cantidad, setCantidad] = useState(initialData.cantidad != null ? String(initialData.cantidad) : "1");

  useEffect(() => {
    setNombre(initialData.nombre ?? "");
    setCodigo(initialData.codigo ?? "");
    setCodigoBarra(initialData.codigo_barra ?? "");
    setCategoria(initialData.categoria ?? "Ropa");
    setPrecio(initialData.precio != null ? String(initialData.precio) : "");
    setCantidad(initialData.cantidad != null ? String(initialData.cantidad) : "1");
  }, [initialData]);

  const numPrecio = Number(precio.replace(",", "."));
  const numCantidad = Number.parseInt(cantidad, 10);
  const isValid = nombre.trim().length > 1 && !Number.isNaN(numPrecio) && numPrecio >= 0 && !Number.isNaN(numCantidad) && numCantidad >= 0;

  const handleCreate = () => {
    if (!isValid || !canWrite) return;
    const finalCode = codigo.trim() || `SKU-${Date.now().toString().slice(-4)}`;
    onConfirm({
      nombre: nombre.trim(),
      codigo: finalCode,
      codigo_barra: codigoBarra.trim() || null,
      categoria: categoria.trim() || "General",
      precio: numPrecio,
      cantidad: numCantidad,
      sucursal_id: branchId,
    });
  };

  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <PackagePlus size={18} color={colors.primary} />
          <Text variant="titleSmall" style={styles.title}>
            Nuevo Producto en Catálogo
          </Text>
        </View>
        <View style={styles.branchBadge}>
          <Store size={12} color={colors.primary} />
          <Text variant="labelSmall" style={styles.branchText}>
            {branchName}
          </Text>
        </View>
      </View>

      <Text variant="bodySmall" style={styles.subtitle}>
        Revisá los campos interpretados. Podés ajustar los valores acá mismo antes de guardar:
      </Text>

      <View style={styles.form}>
        <TextInput
          label="Nombre del producto"
          value={nombre}
          onChangeText={setNombre}
          mode="outlined"
          dense
          style={styles.input}
        />

        <View style={styles.row}>
          <TextInput
            label="Código / SKU"
            value={codigo}
            onChangeText={setCodigo}
            placeholder="Auto si vacío"
            mode="outlined"
            dense
            style={[styles.input, styles.half]}
          />
          <TextInput
            label="Categoría"
            value={categoria}
            onChangeText={setCategoria}
            mode="outlined"
            dense
            style={[styles.input, styles.half]}
          />
        </View>

        <View style={styles.row}>
          <TextInput
            label="Precio (Bs)"
            value={precio}
            onChangeText={setPrecio}
            keyboardType="decimal-pad"
            mode="outlined"
            dense
            style={[styles.input, styles.half]}
          />
          <TextInput
            label="Stock inicial"
            value={cantidad}
            onChangeText={setCantidad}
            keyboardType="number-pad"
            mode="outlined"
            dense
            style={[styles.input, styles.half]}
          />
        </View>
      </View>

      {!canWrite ? (
        <Text variant="bodySmall" style={styles.errorText}>
          Tu rol no tiene permiso para crear productos en catálogo (requiere Almacén).
        </Text>
      ) : null}

      <Divider style={styles.divider} />

      <View style={styles.actions}>
        <Button mode="text" compact onPress={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button
          mode="outlined"
          compact
          onPress={() => onOpenForm({ nombre, codigo, codigo_barra: codigoBarra || null, categoria, precio: numPrecio, cantidad: numCantidad })}
          disabled={loading}
        >
          Formulario completo
        </Button>
        <Button
          mode="contained"
          compact
          onPress={handleCreate}
          loading={loading}
          disabled={!isValid || loading || !canWrite}
        >
          Dar de alta
        </Button>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    padding: spacing.sm + 2,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  title: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  branchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(224, 76, 56, 0.08)",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  branchText: {
    color: colors.primary,
    fontWeight: "600",
  },
  subtitle: {
    color: colors.textSecondary,
    marginBottom: 4,
  },
  form: {
    gap: 6,
  },
  input: {
    backgroundColor: colors.surface,
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  half: {
    flex: 1,
  },
  errorText: {
    color: colors.danger,
    fontWeight: "500",
    marginTop: 4,
  },
  divider: {
    marginVertical: 4,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
});
