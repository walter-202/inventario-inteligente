import { queryClient } from "../../../shared/lib/queryClient";
import { limpiarProductoPendiente } from "../../ventas/lib/pendienteVenta";

/** Clear all user/branch scoped client state before a session changes. */
export function clearAuthScopedState(): void {
  queryClient.clear();
  limpiarProductoPendiente();
}
