import type { Producto } from "../../../shared/types/domain";
import type { LineaInterpretada } from "../api/voiceCommandApi";

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
