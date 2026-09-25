import { useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { useSucursales } from "../../../shared/hooks/useSucursales";
import { useRegistrarProducto } from "../hooks/useRegistrarProducto";
import { ProductForm } from "../components/ProductForm";
import { extraerMensajeError } from "../../../shared/lib/utils";
import { unwrapRouteParam, unwrapRouteParamNumber } from "../../../shared/lib/routeParams";
import { useAuth } from "../../auth/hooks/useAuth";
import { can } from "../../auth/lib/permissions";
import { PermissionDenied } from "../../auth/components/PermissionDenied";
import { useActiveBranch } from "../../../shared/hooks/useActiveBranch";
import { tomarRegistroPendiente } from "../lib/pendienteRegistro";

export function RegistrarProductoScreen() {
  const { profile } = useAuth();
  if (!can(profile?.rol, "products.write")) return <PermissionDenied message="Solo el rol Almacén puede registrar productos en el catálogo." />;
  return <RegistrarProductoForm />;
}

function RegistrarProductoForm() {
  const params = useLocalSearchParams<{
    codigo?: string;
    codigo_barra?: string;
    nombre?: string;
    categoria?: string;
    precio?: string;
    cantidad?: string;
  }>();
  const { activeBranchId, canChangeBranch } = useActiveBranch();
  const branches = useSucursales();
  const mutation = useRegistrarProducto();
  const [resetToken, setResetToken] = useState(0);
  const [pendingSeed] = useState(() => tomarRegistroPendiente());

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

  const initialValues = useMemo(() => {
    const codigo = unwrapRouteParam(params.codigo) ?? pendingSeed?.codigo;
    const codigoBarra = unwrapRouteParam(params.codigo_barra) ?? pendingSeed?.codigo_barra;
    const codigoFromParams = codigo ?? codigoBarra;
    const isEan = codigoFromParams ? /^\d{8,14}$/.test(codigoFromParams.trim()) : false;

    return {
      nombre: unwrapRouteParam(params.nombre) ?? pendingSeed?.nombre,
      codigo: !isEan && codigo ? codigo : pendingSeed?.codigo,
      codigo_barra: isEan ? codigoFromParams : (codigoBarra ?? pendingSeed?.codigo_barra ?? undefined),
      categoria: unwrapRouteParam(params.categoria) ?? pendingSeed?.categoria,
      precio: unwrapRouteParamNumber(params.precio) ?? pendingSeed?.precio,
      cantidad: unwrapRouteParamNumber(params.cantidad) ?? pendingSeed?.cantidad,
    };
  }, [params, pendingSeed]);

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
