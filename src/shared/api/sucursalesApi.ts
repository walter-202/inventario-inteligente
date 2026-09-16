import type { Sucursal } from "../types/domain";
import { supabase } from "../lib/supabase";
import { fetchAllPages } from "../lib/pagination";

export async function obtenerSucursales(): Promise<Sucursal[]> {
  const rows = await fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from("sucursales")
      .select("*")
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
  return rows as Sucursal[];
}
