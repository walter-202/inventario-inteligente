import { useQuery } from "@tanstack/react-query";
import { obtenerAnalisisRotacion, type OpcionesAnalisisRotacion } from "../api/rotacionApi";

export function useAnalisisRotacion(opciones: OpcionesAnalisisRotacion = {}) {
  return useQuery({
    queryKey: ["analisis-rotacion", opciones.dias ?? 30, opciones.sucursalId],
    queryFn: () => obtenerAnalisisRotacion(opciones),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}
