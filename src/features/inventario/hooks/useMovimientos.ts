import { useMutation, useQueryClient } from "@tanstack/react-query";
import { registrarMovimiento, type MovimientoParams } from "../api/inventarioApi";

export function useMovimientos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MovimientoParams) => registrarMovimiento(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventario"] }),
        queryClient.invalidateQueries({ queryKey: ["stock-multi"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });
}
