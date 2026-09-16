import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RegistrarVentaParams } from "../../../shared/types/domain";
import { registrarVenta } from "../api/ventasApi";
import { createGuardedMutation, ventaSubmissionLock } from "../lib/submissionLock";

export function useProcesarVenta() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (variables: RegistrarVentaParams) => registrarVenta(variables),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ventas"] }),
        queryClient.invalidateQueries({ queryKey: ["inventario", variables.sucursal_id] }),
        queryClient.invalidateQueries({ queryKey: ["stock-multi"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
    onSettled: () => {
      ventaSubmissionLock.release();
    },
  });

  const guarded = createGuardedMutation(
    {
      mutate: mutation.mutate,
      mutateAsync: mutation.mutateAsync,
    },
    ventaSubmissionLock,
  );

  return { ...mutation, mutate: guarded.mutate, mutateAsync: guarded.mutateAsync };
}
