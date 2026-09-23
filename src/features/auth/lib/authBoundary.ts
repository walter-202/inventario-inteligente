import { queryClient } from "../../../shared/lib/queryClient";
import { clearAllLocalAIKeys } from "../../../shared/lib/secureKeyStore";
import { clearAuthorizationScopedSalesState } from "../../ventas/lib/pendienteVenta";

/** Clear cached and pending data governed by the server-owned auth profile. */
export function clearAuthorizationScopedState(): void {
  queryClient.clear();
  clearAuthorizationScopedSalesState();
}

/** Clear all user/branch scoped client state before a session changes. */
export function clearAuthScopedState(): void {
  clearAuthorizationScopedState();
  void clearAllLocalAIKeys();
}
