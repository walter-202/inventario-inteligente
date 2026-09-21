import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  configurarStockMinimo,
  obtenerAlertasStock,
  obtenerSugerenciasReabastecimiento,
} from "../api/reabastecimientoApi";

export function useAlertasStock(sucursalId?: number) {
  return useQuery({
    queryKey: ["alertas_stock", sucursalId],
    queryFn: () => obtenerAlertasStock(sucursalId),
  });
}

export function useSugerenciasReabastecimiento(sucursalDestinoId?: number) {
  return useQuery({
    queryKey: ["sugerencias_reabastecimiento", sucursalDestinoId],
    queryFn: () => obtenerSugerenciasReabastecimiento(sucursalDestinoId),
  });
}

export function useConfigurarStockMinimo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productoId, stockMinimo }: { productoId: number; stockMinimo: number }) =>
      configurarStockMinimo(productoId, stockMinimo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["alertas_stock"] });
      void queryClient.invalidateQueries({ queryKey: ["sugerencias_reabastecimiento"] });
      void queryClient.invalidateQueries({ queryKey: ["productos"] });
      void queryClient.invalidateQueries({ queryKey: ["stock"] });
      void queryClient.invalidateQueries({ queryKey: ["inventario"] });
    },
  });
}
