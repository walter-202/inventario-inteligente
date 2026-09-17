import { router, useLocalSearchParams } from "expo-router";
import { BarcodeScannerView } from "../components/BarcodeScannerView";
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
        router.push("/nueva-venta");
      }}
      onViewStock={(product) => {
        router.push({ pathname: "/producto-detalle", params: { id: String(product.id) } });
      }}
      onRegisterNew={(codigo) => {
        router.push({ pathname: "/registrar-producto", params: { codigo } });
      }}
    />
  );
}

