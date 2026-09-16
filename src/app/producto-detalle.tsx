import { useLocalSearchParams } from "expo-router";
import { ProductoDetalleScreen } from "../features/productos/screens/ProductoDetalleScreen";

export default function ProductoDetalleRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const productId = Number(id);

  return <ProductoDetalleScreen id={productId} />;
}
