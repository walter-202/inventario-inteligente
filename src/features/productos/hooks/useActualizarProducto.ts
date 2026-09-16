import { useMutation, useQueryClient } from "@tanstack/react-query";
import { actualizarProducto, type ActualizarProductoParams } from "../api/productosApi";
import type { Producto } from "../../../shared/types/domain";

export function useActualizarProducto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, params }: { id: number; params: ActualizarProductoParams }): Promise<Producto> => {
      return actualizarProducto(id, params);
    },
    onSuccess: (updatedProduct) => {
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      queryClient.invalidateQueries({ queryKey: ["stock-multi"] });
      queryClient.invalidateQueries({ queryKey: ["producto-stock", updatedProduct.id] });
    },
  });
}
