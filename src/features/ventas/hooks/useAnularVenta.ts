import { useMutation, useQueryClient } from "@tanstack/react-query";
import { anularVenta } from "../api/ventasApi";
import type { AnularVentaParams } from "../../../shared/types/domain";

export function useAnularVenta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: AnularVentaParams) => anularVenta(params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ventas"] });
      void queryClient.invalidateQueries({ queryKey: ["stock"] });
      void queryClient.invalidateQueries({ queryKey: ["inventario"] });
      void queryClient.invalidateQueries({ queryKey: ["kardex"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["movimientos"] });
    },
  });
}
