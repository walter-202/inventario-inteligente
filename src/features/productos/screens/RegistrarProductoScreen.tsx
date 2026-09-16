import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { useSucursales } from "../../../shared/hooks/useSucursales";
import { useRegistrarProducto } from "../hooks/useRegistrarProducto";
import { ProductForm } from "../components/ProductForm";
import { extraerMensajeError } from "../../../shared/lib/utils";

export function RegistrarProductoScreen() {
  const branches = useSucursales();
  const mutation = useRegistrarProducto();
  const [resetToken, setResetToken] = useState(0);
  useEffect(() => {
    if (!mutation.isSuccess || !mutation.data) return;
    const created = mutation.data;
    Alert.alert(
      "Producto registrado",
      `${created.producto.nombre} se registró correctamente.\nSucursal: ${created.sucursal.nombre}\nCantidad inicial: ${created.cantidad_inicial}`,
      [
        { text: "Registrar otro", onPress: () => { mutation.reset(); setResetToken((value) => value + 1); } },
        { text: "Volver a Productos", onPress: () => { mutation.reset(); router.back(); } },
      ],
    );
  }, [mutation.data, mutation.isSuccess, mutation.reset]);
  return <ScreenContainer><ProductForm resetToken={resetToken} branches={branches.data ?? []} loading={mutation.isPending} serverError={mutation.error ? extraerMensajeError(mutation.error, "No se pudo registrar el producto.") : null} onSubmit={(input) => mutation.mutate(input)} /></ScreenContainer>;
}
