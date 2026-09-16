/** @deprecated Feature APIs live below src/features; kept for route compatibility. */
export * from "../shared/types/domain";
export { obtenerSucursales } from "../shared/api/sucursalesApi";
export { obtenerProductos, registrarProducto, buscarProductoPorCodigo } from "../features/productos/api/productosApi";
export { obtenerInventario, registrarEntrada, registrarSalida, registrarTransferencia } from "../features/inventario/api/inventarioApi";
export { obtenerVentas, registrarVenta } from "../features/ventas/api/ventasApi";
export {
  interpretarTextoVoz,
  interpretarTextoVoz as interpretarTexto,
  VoiceInterpretationSchema,
} from "../features/asistente-ia/api/aiInterpretationService";
export type {
  ProductoInterpretado,
  RespuestaInterpretacion,
} from "../features/asistente-ia/api/aiInterpretationService";
export { interpretarVoz, InterpretacionError } from "../features/asistente-ia/api/voiceCommandApi";
export { extraerMensajeError } from "../shared/lib/utils";
