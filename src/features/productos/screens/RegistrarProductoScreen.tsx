import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { useSucursales } from "../../../shared/hooks/useSucursales";
import { useRegistrarProducto } from "../hooks/useRegistrarProducto";
import { ProductForm } from "../components/ProductForm";
import { extraerMensajeError } from "../../../shared/lib/utils";
import { useAuth } from "../../auth/hooks/useAuth";
import { can } from "../../auth/lib/permissions";
import { PermissionDenied } from "../../auth/components/PermissionDenied";
import { useActiveBranch } from "../../../shared/hooks/useActiveBranch";

export function RegistrarProductoScreen() {
  const { profile } = useAuth();
  if (!can(profile?.rol, "products.write")) return <PermissionDenied message="Solo administración o almacén pueden registrar productos." />;
  return <RegistrarProductoForm />;
}

function RegistrarProductoForm() {
  const { codigo, codigo_barra } = useLocalSearchParams<{ codigo?: string; codigo_barra?: string }>();
  const { activeBranchId, canChangeBranch } = useActiveBranch();
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
  const availableBranches = canChangeBranch ? branches.data ?? [] : (branches.data ?? []).filter((branch) => branch.id === activeBranchId);

  const isEan = codigo && /^\d{8,14}$/.test(codigo.trim());
  const initialValues = {
    codigo: !isEan && codigo ? codigo : undefined,
    codigo_barra: isEan ? codigo : (codigo_barra || undefined),
  };

  return (
    <ScreenContainer>
      <ProductForm
        resetToken={resetToken}
        branches={availableBranches}
        initialValues={initialValues}
        loading={mutation.isPending}
        serverError={mutation.error ? extraerMensajeError(mutation.error, "No se pudo registrar el producto.") : null}
        onSubmit={(input) => mutation.mutate(input)}
      />
    </ScreenContainer>
  );
}
