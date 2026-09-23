import type { Producto } from "../../../shared/types/domain";

export interface ItemPendienteVenta {
  producto: Producto;
  cantidad: number;
}

let pendiente: Producto | null = null;
let lotePendiente: ItemPendienteVenta[] = [];
const authorizationScopeResetListeners = new Set<() => void>();

export function establecerProductoPendiente(producto: Producto) { pendiente = producto; }
export function peekProductoPendiente() { return pendiente; }
export function limpiarProductoPendiente() { pendiente = null; }
export function tomarProductoPendiente() {
  const value = peekProductoPendiente();
  limpiarProductoPendiente();
  return value;
}

export function establecerLotePendiente(items: ItemPendienteVenta[]) {
  lotePendiente = [...items];
}
export function peekLotePendiente(): ItemPendienteVenta[] {
  return [...lotePendiente];
}
export function limpiarLotePendiente() {
  lotePendiente = [];
}
export function tomarLotePendiente(): ItemPendienteVenta[] {
  const value = peekLotePendiente();
  limpiarLotePendiente();
  return value;
}

export function subscribeAuthorizationScopeReset(listener: () => void): () => void {
  authorizationScopeResetListeners.add(listener);
  return () => authorizationScopeResetListeners.delete(listener);
}

export function clearAuthorizationScopedSalesState(): void {
  limpiarProductoPendiente();
  limpiarLotePendiente();
  for (const listener of [...authorizationScopeResetListeners]) listener();
}
