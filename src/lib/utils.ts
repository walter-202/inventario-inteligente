export function formatearPrecio(precio: number): string {
  return `$ ${precio.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}