import { APP_LOCALE, CURRENCY_LOCALE } from "./constants";

export function formatearPrecio(precio: number): string {
  return `$ ${precio.toLocaleString(CURRENCY_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function extraerMensajeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return fallback;
}

/** Formats an ISO date string, timestamp, or Date to a localized date + time string (e.g. "21/9/2026 22:30"). */
export function formatearFechaHora(fecha: string | number | Date): string {
  return new Date(fecha).toLocaleString(APP_LOCALE);
}

/** Formats an ISO date string, timestamp, or Date to a localized date string (e.g. "21/9/2026"). */
export function formatearFecha(fecha: string | number | Date): string {
  return new Date(fecha).toLocaleDateString(APP_LOCALE);
}

/** Formats an ISO date string, timestamp, or Date to a short date + time (e.g. "21 sep 2026 22:30"). */
export function formatearFechaCorta(fecha: string | number | Date): string {
  const d = new Date(fecha);
  return `${d.toLocaleDateString(APP_LOCALE)} ${d.toLocaleTimeString(APP_LOCALE, { hour: "2-digit", minute: "2-digit" })}`;
}

