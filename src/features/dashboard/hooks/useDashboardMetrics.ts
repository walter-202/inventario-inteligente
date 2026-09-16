import { useQuery } from "@tanstack/react-query";
import { obtenerDashboardMetrics } from "../api/dashboardApi";

export function useDashboardMetrics(sucursalId?: number) {
  return useQuery({
    queryKey: ["dashboard", sucursalId ?? "all"],
    queryFn: () => obtenerDashboardMetrics(sucursalId),
  });
}
