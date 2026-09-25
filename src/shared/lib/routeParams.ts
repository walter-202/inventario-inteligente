/** Normaliza parámetros de Expo Router (string | string[] | undefined) a string. */
export function unwrapRouteParam(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

export function unwrapRouteParamNumber(value: string | string[] | undefined): number | undefined {
  const raw = unwrapRouteParam(value);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}
