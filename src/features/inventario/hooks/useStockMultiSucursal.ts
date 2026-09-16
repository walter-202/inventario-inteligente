import { useQuery } from "@tanstack/react-query";
import { obtenerStockMultiSucursal } from "../api/inventarioApi";

export function useStockMultiSucursal() {
  return useQuery({
    queryKey: ["stock-multi"],
    queryFn: obtenerStockMultiSucursal,
  });
}
