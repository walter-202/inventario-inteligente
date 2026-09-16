export class ProductoNoEncontradoError extends Error {
  constructor() {
    super("Producto no encontrado.");
    this.name = "ProductoNoEncontradoError";
  }
}

export class ProductoLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductoLookupError";
  }
}

export function esProductoNoEncontrado(error: unknown): boolean {
  return error instanceof ProductoNoEncontradoError || (error instanceof Error && error.name === "ProductoNoEncontradoError");
}
