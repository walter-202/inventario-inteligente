import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { obtenerProductos } from "../api/productosApi";

export function useProductos(params: { q?: string; categoria?: string } = {}) {
  const query = useInfiniteQuery({
    queryKey: ["productos", params.q?.trim() ?? "", params.categoria ?? ""],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => obtenerProductos({ ...params, page: pageParam }),
    getNextPageParam: (lastPage) => lastPage.current_page < lastPage.last_page ? lastPage.current_page + 1 : undefined,
    placeholderData: keepPreviousData,
  });
  const pages = query.data?.pages ?? [];
  const data = pages.flatMap((page) => page.data);
  const categories = Array.from(new Set(pages.flatMap((page) => page.data.map((item) => item.categoria)))).sort((a, b) => a.localeCompare(b, "es"));
  return { ...query, data, categories, total: pages[0]?.total ?? 0 };
}
