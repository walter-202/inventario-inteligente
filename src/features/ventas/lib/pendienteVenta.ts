import type { Producto } from "../../../shared/types/domain";

let pendiente: Producto | null = null;
export function establecerProductoPendiente(producto: Producto) { pendiente = producto; }
export function peekProductoPendiente() { return pendiente; }
export function limpiarProductoPendiente() { pendiente = null; }
export function tomarProductoPendiente() {
  const value = peekProductoPendiente();
  limpiarProductoPendiente();
  return value;
}
