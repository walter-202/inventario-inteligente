import { Producto } from "@/lib/api";

let productoPendiente: Producto | null = null;

export function establecerProductoPendiente(producto: Producto): void {
  productoPendiente = producto;
}

export function tomarProductoPendiente(): Producto | null {
  const pendiente = productoPendiente;
  productoPendiente = null;
  return pendiente;
}