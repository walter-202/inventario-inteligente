import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  confirmarRecepcionDespacho,
  emitirOrdenDespacho,
  obtenerOrdenesDespacho,
} from "../api/despachosApi";
import type {
  ConfirmarRecepcionParams,
  EmitirDespachoParams,
  EstadoDespacho,
} from "../../../shared/types/domain";

export function useOrdenesDespacho(filtros: {
  sucursalDestinoId?: number;
  sucursalOrigenId?: number;
  estado?: EstadoDespacho;
} = {}) {
  return useQuery({
    queryKey: ["ordenes_despacho", filtros.sucursalDestinoId, filtros.sucursalOrigenId, filtros.estado],
    queryFn: () => obtenerOrdenesDespacho(filtros),
  });
}

export function useEmitirDespacho() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: EmitirDespachoParams) => emitirOrdenDespacho(params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ordenes_despacho"] });
      void queryClient.invalidateQueries({ queryKey: ["inventarios"] });
      void queryClient.invalidateQueries({ queryKey: ["movimientos"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard_metrics"] });
    },
  });
}

export function useConfirmarRecepcionDespacho() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: ConfirmarRecepcionParams) => confirmarRecepcionDespacho(params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ordenes_despacho"] });
      void queryClient.invalidateQueries({ queryKey: ["inventarios"] });
      void queryClient.invalidateQueries({ queryKey: ["movimientos"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard_metrics"] });
    },
  });
}
