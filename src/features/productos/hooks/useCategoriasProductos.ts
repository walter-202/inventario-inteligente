import { useQuery } from "@tanstack/react-query";
import { obtenerCategoriasProductos } from "../api/productosApi";

export function useCategoriasProductos() {
  return useQuery({
    queryKey: ["producto-categorias"],
    queryFn: obtenerCategoriasProductos,
    staleTime: 5 * 60 * 1000,
  });
}
