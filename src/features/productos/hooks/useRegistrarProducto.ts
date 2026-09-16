import { useMutation, useQueryClient } from "@tanstack/react-query";
import { registrarProducto } from "../api/productosApi";

export function useRegistrarProducto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: registrarProducto,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["productos"] }),
        queryClient.invalidateQueries({ queryKey: ["producto-categorias"] }),
        queryClient.invalidateQueries({ queryKey: ["inventario"] }),
        queryClient.invalidateQueries({ queryKey: ["stock-multi"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });
}
