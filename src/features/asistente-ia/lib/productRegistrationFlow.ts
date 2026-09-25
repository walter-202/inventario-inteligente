import type { RegistroProductoParsed } from "../api/voiceRegistrationService";

export function mergeRegistroProductoParsed(
  prev: RegistroProductoParsed | null | undefined,
  next: RegistroProductoParsed,
): RegistroProductoParsed {
  if (!prev) return next;
  return {
    nombre: next.nombre ?? prev.nombre,
    codigo: next.codigo ?? prev.codigo,
    codigo_barra: next.codigo_barra ?? prev.codigo_barra,
    categoria: next.categoria ?? prev.categoria,
    precio: next.precio ?? prev.precio,
    cantidad: next.cantidad ?? prev.cantidad,
  };
}

function normalizeIntentText(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function esConfirmacionRegistroProducto(texto: string): boolean {
  const normalized = normalizeIntentText(texto);
  if (!normalized) return false;
  return /^(si|sip|dale|ok|confirmo|confirmar|registralo|registra(lo)?|dar de alta|hacelo|hazlo|adelante|listo)\b/.test(normalized)
    || /\b(registralo|registra lo|confirmar alta|dar de alta)\b/.test(normalized);
}

export function esCancelacionRegistroProducto(texto: string): boolean {
  const normalized = normalizeIntentText(texto);
  return /^(no|cancelar|cancela|olvidalo|dejalo|mejor no)\b/.test(normalized);
}

export type RegistroProductoConfirmInput = {
  nombre: string;
  codigo: string;
  codigo_barra?: string | null;
  categoria: string;
  precio: number;
  cantidad: number;
  sucursal_id: number;
};

export function buildRegistroProductoConfirmInput(
  datos: RegistroProductoParsed,
  sucursalId: number,
): RegistroProductoConfirmInput | null {
  const nombre = datos.nombre?.trim();
  if (!nombre) return null;
  if (datos.precio === null || datos.precio === undefined) return null;
  const cantidad = datos.cantidad ?? 1;
  if (!Number.isFinite(cantidad) || cantidad < 0) return null;
  return {
    nombre,
    codigo: datos.codigo?.trim() || `SKU-${Date.now().toString().slice(-4)}`,
    codigo_barra: datos.codigo_barra?.trim() || null,
    categoria: datos.categoria?.trim() || "General",
    precio: datos.precio,
    cantidad,
    sucursal_id: sucursalId,
  };
}
