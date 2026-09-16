import { useQuery } from "@tanstack/react-query";
import { obtenerVentas } from "../api/ventasApi";

export function useVentas(sucursalId?: number) {
  return useQuery({
    queryKey: ["ventas", sucursalId ?? "all"],
    queryFn: () => obtenerVentas(sucursalId),
  });
}
