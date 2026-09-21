import { useQuery } from "@tanstack/react-query";
import { obtenerKardexMovimientos } from "../api/kardexApi";
import type { KardexFilterParams } from "../../../shared/types/domain";

export function useKardex(filters: KardexFilterParams = {}) {
  return useQuery({
    queryKey: ["kardex", filters.sucursal_id, filters.producto_id, filters.tipo, filters.limite],
    queryFn: () => obtenerKardexMovimientos(filters),
  });
}
