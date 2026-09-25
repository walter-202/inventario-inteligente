import type { Producto } from "../../../shared/types/domain";
import type { LineaInterpretada } from "../api/voiceCommandApi";
import type { VentaConfirmationLine } from "../components/SaleConfirmationCard";

export class AmbiguousVoiceLineError extends Error {
  constructor(product: Producto) {
    super(`La interpretación devolvió precios distintos para "${product.nombre}".`);
    this.name = "AmbiguousVoiceLineError";
  }
}

/** Combines repeated products before stock validation and sale confirmation. */
export function aggregateVoiceLines(lines: LineaInterpretada[]): LineaInterpretada[] {
  const aggregated = new Map<number, LineaInterpretada>();
  for (const line of lines) {
    const existing = aggregated.get(line.producto.id);
    if (!existing) {
      aggregated.set(line.producto.id, { ...line });
      continue;
    }
    if (existing.producto.precio !== line.producto.precio) {
      throw new AmbiguousVoiceLineError(line.producto);
    }
    existing.cantidadSolicitada += line.cantidadSolicitada;
  }
  return Array.from(aggregated.values());
}

/** Merges new sale lines into an in-progress confirmation cart. */
export function mergeConfirmationLines(
  current: VentaConfirmationLine[],
  incoming: VentaConfirmationLine[],
): VentaConfirmationLine[] {
  const merged = new Map<number, VentaConfirmationLine>();
  for (const line of current) merged.set(line.producto_id, { ...line });
  for (const line of incoming) {
    const existing = merged.get(line.producto_id);
    if (!existing) {
      merged.set(line.producto_id, { ...line });
      continue;
    }
    if (existing.precio !== line.precio) {
      throw new AmbiguousVoiceLineError({ id: line.producto_id, nombre: line.nombre, codigo: "", categoria: "", precio: line.precio, cantidad: 0 });
    }
    merged.set(line.producto_id, { ...existing, cantidad: existing.cantidad + line.cantidad });
  }
  return Array.from(merged.values());
}
