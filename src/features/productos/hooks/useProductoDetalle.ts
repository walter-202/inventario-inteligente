import { useQuery } from "@tanstack/react-query";
import { obtenerHistorialProducto, obtenerStockProducto } from "../api/productosApi";

export function useProductoDetalle(productoId: number | null) {
  const stock = useQuery({
    queryKey: ["producto-stock", productoId],
    queryFn: () => (productoId ? obtenerStockProducto(productoId) : Promise.resolve([])),
    enabled: productoId !== null,
  });

  const historial = useQuery({
    queryKey: ["producto-historial", productoId],
    queryFn: () => (productoId ? obtenerHistorialProducto(productoId) : Promise.resolve([])),
    enabled: productoId !== null,
  });

  return {
    stock,
    historial,
    refetch: async () => {
      await Promise.all([stock.refetch(), historial.refetch()]);
    },
  };
}
