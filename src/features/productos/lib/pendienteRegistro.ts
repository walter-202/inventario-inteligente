import type { NuevoProductoParams } from "../../../shared/types/domain";

let datos: Partial<NuevoProductoParams> | null = null;

export function establecerRegistroPendiente(input: Partial<NuevoProductoParams>) {
  datos = { ...input };
}

export function peekRegistroPendiente(): Partial<NuevoProductoParams> | null {
  return datos ? { ...datos } : null;
}

export function tomarRegistroPendiente(): Partial<NuevoProductoParams> | null {
  const value = peekRegistroPendiente();
  datos = null;
  return value;
}

export function limpiarRegistroPendiente() {
  datos = null;
}
