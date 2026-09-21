import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { obtenerMermas, registrarMerma } from "../api/mermasApi";
import type { RegistrarMermaParams } from "../../../shared/types/domain";

export function useMermas(sucursalId?: number) {
  return useQuery({
    queryKey: ["mermas", sucursalId],
    queryFn: () => obtenerMermas(sucursalId),
  });
}

export function useRegistrarMerma() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: RegistrarMermaParams) => registrarMerma(params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["stock"] });
      void queryClient.invalidateQueries({ queryKey: ["inventario"] });
      void queryClient.invalidateQueries({ queryKey: ["mermas"] });
      void queryClient.invalidateQueries({ queryKey: ["kardex"] });
      void queryClient.invalidateQueries({ queryKey: ["movimientos"] });
    },
  });
}
