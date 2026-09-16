import { useEffect, useState } from "react";
import { StyleSheet, View, ScrollView } from "react-native";
import { Portal, Modal, Button, Text, TextInput, HelperText, Chip } from "react-native-paper";
import { Tag, Barcode, Layers, DollarSign, CheckCircle2 } from "lucide-react-native";
import { colors, radius, shadows, spacing } from "../../../shared/theme";
import type { Producto } from "../../../shared/types/domain";
import { ActualizarProductoSchema, type ActualizarProductoParams } from "../api/productosApi";

interface ProductEditModalProps {
  visible: boolean;
  producto: Producto | null;
  loading?: boolean;
  onDismiss: () => void;
  onSubmit: (id: number, params: ActualizarProductoParams) => void;
}

const FASHION_CATEGORIES = [
  "Pantalones",
  "Chompas",
  "Blusas",
  "Vestidos",
  "Poleras",
  "Chaquetas",
  "Accesorios",
];

export function ProductEditModal({
  visible,
  producto,
  loading = false,
  onDismiss,
  onSubmit,
}: ProductEditModalProps) {
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [categoria, setCategoria] = useState("");
  const [precio, setPrecio] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof ActualizarProductoParams, string>>>({});

  useEffect(() => {
    if (producto) {
      setNombre(producto.nombre);
      setCodigo(producto.codigo);
      setCategoria(producto.categoria);
      setPrecio(String(producto.precio));
      setErrors({});
    }
  }, [producto, visible]);

  const handleSave = () => {
    if (!producto) return;
    const precioNum = Number(precio.trim().replace(",", "."));
    const validation = ActualizarProductoSchema.safeParse({
      nombre,
      codigo,
      categoria,
      precio: Number.isFinite(precioNum) ? precioNum : Number.NaN,
    });

    if (!validation.success) {
      const fieldErrors: Partial<Record<keyof ActualizarProductoParams, string>> = {};
      for (const issue of validation.error.issues) {
        const field = issue.path[0] as keyof ActualizarProductoParams;
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    onSubmit(producto.id, validation.data);
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={loading ? undefined : onDismiss} contentContainerStyle={styles.modal}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text variant="titleLarge" style={styles.title}>
            Editar producto
          </Text>
          <Text variant="bodySmall" style={styles.subtitle}>
            Modificá los datos del catálogo en tiempo real
          </Text>

          <View style={styles.form}>
            {/* Nombre */}
            <View>
              <TextInput
                mode="outlined"
                label="Nombre del producto"
                value={nombre}
                onChangeText={setNombre}
                error={Boolean(errors.nombre)}
                left={<TextInput.Icon icon={() => <Tag size={20} color={colors.primary} />} />}
              />
              <HelperText type="error" visible={Boolean(errors.nombre)}>
                {errors.nombre}
              </HelperText>
            </View>

            {/* Código SKU */}
            <View>
              <TextInput
                mode="outlined"
                label="Código SKU"
                value={codigo}
                onChangeText={setCodigo}
                autoCapitalize="characters"
                error={Boolean(errors.codigo)}
                left={<TextInput.Icon icon={() => <Barcode size={20} color={colors.primary} />} />}
              />
              <HelperText type="error" visible={Boolean(errors.codigo)}>
                {errors.codigo}
              </HelperText>
            </View>

            {/* Categoría */}
            <View>
              <TextInput
                mode="outlined"
                label="Categoría"
                value={categoria}
                onChangeText={setCategoria}
                error={Boolean(errors.categoria)}
                left={<TextInput.Icon icon={() => <Layers size={20} color={colors.primary} />} />}
              />
              <View style={styles.categoryChips}>
                {FASHION_CATEGORIES.map((cat) => {
                  const isSelected = categoria.toLowerCase() === cat.toLowerCase();
                  return (
                    <Chip
                      key={cat}
                      compact
                      selected={isSelected}
                      showSelectedCheck={false}
                      onPress={() => setCategoria(cat)}
                      style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                      textStyle={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}
                    >
                      {cat}
                    </Chip>
                  );
                })}
              </View>
              <HelperText type="error" visible={Boolean(errors.categoria)}>
                {errors.categoria}
              </HelperText>
            </View>

            {/* Precio */}
            <View>
              <TextInput
                mode="outlined"
                label="Precio (Bs)"
                value={precio}
                onChangeText={setPrecio}
                keyboardType="decimal-pad"
                error={Boolean(errors.precio)}
                left={<TextInput.Icon icon={() => <DollarSign size={20} color={colors.primary} />} />}
              />
              <HelperText type="error" visible={Boolean(errors.precio)}>
                {errors.precio}
              </HelperText>
            </View>
          </View>

          <View style={styles.actions}>
            <Button onPress={onDismiss} disabled={loading} style={styles.actionButton}>
              Cancelar
            </Button>
            <Button
              mode="contained"
              onPress={handleSave}
              loading={loading}
              disabled={loading}
              icon={() => <CheckCircle2 size={18} color={colors.white} />}
              style={styles.saveButton}
            >
              Guardar cambios
            </Button>
          </View>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 20,
    maxHeight: "85%",
  },
  container: {
    gap: spacing.xs,
  },
  title: {
    fontWeight: "800",
    color: colors.textPrimary,
  },
  subtitle: {
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  form: {
    gap: 2,
  },
  categoryChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  categoryChip: {
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
  },
  categoryChipSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  categoryChipTextSelected: {
    color: colors.primary,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: {
    borderRadius: 10,
  },
  saveButton: {
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
});
