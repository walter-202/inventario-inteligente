import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Card, HelperText, Text, TextInput, Chip } from "react-native-paper";
import { ProductoInputSchema } from "../api/productosApi";
import type { NuevoProductoParams, Sucursal } from "../../../shared/types/domain";
import { colors, spacing } from "../../../shared/theme";

interface ProductFormProps {
  branches: Sucursal[];
  resetToken?: number;
  loading?: boolean;
  serverError?: string | null;
  onSubmit: (input: NuevoProductoParams) => void;
}

type Field = "nombre" | "codigo" | "categoria" | "precio" | "cantidad" | "sucursal_id";

export function ProductForm({ branches, resetToken = 0, loading = false, serverError, onSubmit }: ProductFormProps) {
  const [values, setValues] = useState({ nombre: "", codigo: "", categoria: "", precio: "", cantidad: "" });
  const [sucursalId, setSucursalId] = useState<number | null>(branches[0]?.id ?? null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  useEffect(() => {
    setValues({ nombre: "", codigo: "", categoria: "", precio: "", cantidad: "" });
    setSucursalId(branches[0]?.id ?? null);
    setErrors({});
  }, [resetToken]);
  useEffect(() => {
    if (sucursalId === null && branches[0]) setSucursalId(branches[0].id);
  }, [branches, sucursalId]);
  const update = (field: keyof typeof values, value: string) => setValues((current) => ({ ...current, [field]: value }));

  const submit = () => {
    const precioText = values.precio.trim();
    const cantidadText = values.cantidad.trim();
    const precio = Number(precioText.replace(",", "."));
    const cantidad = Number(cantidadText);
    const numericErrors: Partial<Record<Field, string>> = {};
    if (!precioText) numericErrors.precio = "El precio es obligatorio.";
    else if (!Number.isFinite(precio) || precio < 0) numericErrors.precio = "El precio debe ser un número mayor o igual a 0.";
    if (!cantidadText) numericErrors.cantidad = "La cantidad inicial es obligatoria.";
    else if (!/^\d+$/.test(cantidadText)) numericErrors.cantidad = "La cantidad inicial debe ser un entero mayor o igual a 0.";
    const result = ProductoInputSchema.safeParse({
      nombre: values.nombre,
      codigo: values.codigo,
      categoria: values.categoria,
      precio: precioText ? precio : Number.NaN,
      cantidad: cantidadText ? cantidad : Number.NaN,
      sucursal_id: sucursalId,
    });
    if (!result.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as Field;
        if (!next[field]) next[field] = issue.message;
      }
      setErrors({ ...next, ...numericErrors });
      return;
    }
    if (Object.keys(numericErrors).length > 0) {
      setErrors(numericErrors);
      return;
    }
    setErrors({});
    onSubmit(result.data);
  };

  const input = (field: keyof typeof values, label: string, keyboardType?: "default" | "decimal-pad" | "number-pad") => (
    <View key={field} style={styles.field}>
      <TextInput
        mode="outlined"
        label={label}
        value={values[field]}
        onChangeText={(value) => update(field, value)}
        keyboardType={keyboardType}
        error={Boolean(errors[field])}
        autoCapitalize={field === "codigo" ? "characters" : "sentences"}
      />
      <HelperText type="error" visible={Boolean(errors[field])}>{errors[field]}</HelperText>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Card mode="outlined"><Card.Content>
        <Text variant="titleLarge" style={styles.title}>Registrar producto</Text>
        {input("nombre", "Nombre del producto")}
        {input("codigo", "Código")}
        {input("categoria", "Categoría")}
        {input("precio", "Precio", "decimal-pad")}
        {input("cantidad", "Cantidad inicial", "number-pad")}
        <Text variant="labelLarge" style={styles.label}>Sucursal</Text>
        <View style={styles.chips}>{branches.map((branch) => <Chip key={branch.id} selected={branch.id === sucursalId} showSelectedCheck={false} onPress={() => setSucursalId(branch.id)}>{branch.nombre}</Chip>)}</View>
        <HelperText type="error" visible={Boolean(errors.sucursal_id)}>{errors.sucursal_id}</HelperText>
        {serverError ? <HelperText type="error" visible>{serverError}</HelperText> : null}
        <Button mode="contained" onPress={submit} loading={loading} disabled={loading || branches.length === 0} style={styles.button}>Registrar producto</Button>
      </Card.Content></Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  title: { marginBottom: spacing.md, color: colors.textPrimary },
  field: { marginBottom: spacing.xs },
  label: { marginTop: spacing.md, marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  button: { marginTop: spacing.lg },
});
