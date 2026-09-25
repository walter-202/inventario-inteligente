import { router, useLocalSearchParams } from "expo-router";
import { BarcodeScannerView } from "../components/BarcodeScannerView";
import { establecerRegistroPendiente } from "../lib/pendienteRegistro";
import { establecerProductoPendiente } from "../../ventas/lib/pendienteVenta";

export function EscanearScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();

  return (
    <BarcodeScannerView
      mode={mode}
      onCancel={() => router.back()}
      onProductFound={(product) => {
        if (mode === "stock" || mode === "registro") {
          router.push({ pathname: "/producto-detalle", params: { id: String(product.id) } });
          return;
        }
        establecerProductoPendiente(product);
        router.replace({ pathname: "/nueva-venta", params: { producto_id: String(product.id) } });
      }}
      onViewStock={(product) => {
        router.push({ pathname: "/producto-detalle", params: { id: String(product.id) } });
      }}
      onRegisterNew={(codigo) => {
        const isEan = /^\d{8,14}$/.test(codigo.trim());
        const params = isEan ? { codigo_barra: codigo } : { codigo };
        establecerRegistroPendiente(params);
        router.replace({ pathname: "/registrar-producto", params });
      }}
    />
  );
}

