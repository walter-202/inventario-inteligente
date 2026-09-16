import { useQuery } from "@tanstack/react-query";
import { obtenerSucursales } from "../api/sucursalesApi";

export function useSucursales() {
  return useQuery({ queryKey: ["sucursales"], queryFn: obtenerSucursales });
}
