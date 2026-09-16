import { router } from "expo-router";
import { BarcodeScannerView } from "../components/BarcodeScannerView";
import { establecerProductoPendiente } from "../../ventas/lib/pendienteVenta";

export function EscanearScreen() {
  return <BarcodeScannerView onCancel={() => router.back()} onProductFound={(product) => { establecerProductoPendiente(product); router.push("/nueva-venta"); }} />;
}
