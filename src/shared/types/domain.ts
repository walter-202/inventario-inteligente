export interface Producto {
  id: number;
  nombre: string;
  codigo: string;
  codigo_barra?: string | null;
  categoria: string;
  subcategoria?: string | null;
  precio: number;
  cantidad: number;
  stock_minimo?: number;
}

export interface ProductosRespuesta {
  data: Producto[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  next_page_url: string | null;
  prev_page_url: string | null;
}

export interface ProductosParams { q?: string; categoria?: string; page?: number }
export interface NuevoProductoParams {
  nombre: string;
  codigo: string;
  codigo_barra?: string | null;
  categoria: string;
  subcategoria?: string | null;
  precio: number;
  cantidad: number;
  sucursal_id: number;
}
export interface ProductoRegistrado {
  producto: Producto;
  sucursal: Sucursal;
  cantidad_inicial: number;
  mensaje: string;
}
export interface Sucursal {
  id: number;
  nombre: string;
  direccion?: string;
  ciudad?: string;
}
export interface InventarioItem {
  id: number;
  producto_id: number;
  sucursal_id: number;
  cantidad: number;
  producto: { id: number; nombre: string; codigo: string; categoria?: string };
  sucursal: { id: number; nombre: string };
}
export interface LineaVenta { producto_id: number; cantidad: number; precio?: number }
export const PAYMENT_METHODS = ["efectivo", "QR", "tarjeta", "transferencia"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export interface RegistrarVentaParams { sucursal_id: number; metodo_pago: PaymentMethod; productos: LineaVenta[] }
export interface DetalleVenta { id?: number; producto_id: number; cantidad: number; precio: number; subtotal?: number }
export interface VentaRegistrada {
  id: number;
  sucursal_id: number;
  fecha: string;
  metodo_pago: string;
  total: number;
  detalles: DetalleVenta[];
}
export interface MovimientoBaseParams { producto_id: number; cantidad: number; observacion?: string }
export interface MovimientoSucursalParams extends MovimientoBaseParams { sucursal_id: number }
export interface MovimientoTransferenciaParams extends MovimientoBaseParams {
  sucursal_origen_id: number;
  sucursal_destino_id: number;
}
export interface MovimientoRegistrado {
  id: number;
  producto_id: number;
  sucursal_id: number;
  sucursal_destino_id?: number | null;
  tipo: string;
  cantidad: number;
  observacion?: string | null;
}

export type EstadoVenta = "completada" | "anulada";

export interface VentaResumen {
  id: number;
  sucursal_id: number;
  fecha: string;
  total: number;
  metodo_pago: string;
  estado?: EstadoVenta;
  motivo_anulacion?: string | null;
  fecha_anulacion?: string | null;
}

export interface AnularVentaParams {
  venta_id: number;
  motivo: string;
}

export interface VentaAnuladaRespuesta {
  venta_id: number;
  estado: "anulada";
  items_revertidos: number;
  motivo: string;
  fecha_anulacion: string;
}

export const MOTIVOS_MERMA = [
  "rotura",
  "mancha",
  "falla_costura",
  "deterioro",
  "extravio",
  "otro",
] as const;

export type MotivoMerma = (typeof MOTIVOS_MERMA)[number];

export interface Merma {
  id: number;
  sucursal_id: number;
  producto_id: number;
  cantidad: number;
  motivo: MotivoMerma;
  observacion?: string | null;
  created_at: string;
  producto?: { id: number; nombre: string; codigo: string; categoria?: string };
  sucursal?: { id: number; nombre: string };
}

export interface RegistrarMermaParams {
  sucursal_id: number;
  producto_id: number;
  cantidad: number;
  motivo: MotivoMerma;
  observacion?: string;
}

export interface MermaRegistrada {
  merma_id: number;
  producto_id: number;
  producto_nombre: string;
  sucursal_id: number;
  cantidad: number;
  motivo: string;
  stock_restante: number;
}

export interface MovimientoKardexItem {
  id: number;
  fecha: string;
  producto_id: number;
  producto_nombre: string;
  producto_codigo: string;
  sucursal_id: number;
  sucursal_nombre: string;
  sucursal_destino_id?: number | null;
  sucursal_destino_nombre?: string | null;
  tipo: "entrada" | "salida" | "transferencia";
  subtipo?: "venta" | "anulacion" | "merma" | "despacho" | "recepcion" | "ajuste";
  cantidad: number;
  saldo_resultante?: number;
  observacion?: string | null;
}

export interface KardexFilterParams {
  sucursal_id?: number;
  producto_id?: number;
  tipo?: "entrada" | "salida" | "todas";
  limite?: number;
}

export interface VisualGarmentAnalysis {
  categoria: string;
  color_principal: string;
  tipo_corte: string;
  caracteristicas_distintivas: string;
}

export interface VisualMatchCandidate {
  producto_id: number;
  nombre: string;
  codigo: string;
  categoria: string;
  precio: number;
  confidence: number;
  razon: string;
}

export interface VisualRecognitionResult {
  analisis_prenda: VisualGarmentAnalysis;
  candidatos: VisualMatchCandidate[];
}


export interface DashboardDay { date: string; label: string; total: number; count: number }
export interface DashboardLowStockItem extends InventarioItem { threshold: number }
export interface DashboardMetrics {
  totalSales: number;
  salesCount: number;
  stockUnits: number;
  lowStockCount: number;
  weeklySales: DashboardDay[];
  lowStock: DashboardLowStockItem[];
}

export type EstadoDespacho = "en_transito" | "recibido" | "cancelado";

export interface OrdenDespacho {
  id: number;
  numero_guia: string;
  sucursal_origen_id: number;
  sucursal_destino_id: number;
  producto_id: number;
  cantidad_despachada: number;
  cantidad_recibida?: number | null;
  estado: EstadoDespacho;
  fecha_despacho: string;
  fecha_recepcion?: string | null;
  observacion?: string | null;
  created_at: string;
  producto?: { id: number; nombre: string; codigo: string; categoria?: string };
  sucursal_origen?: { id: number; nombre: string };
  sucursal_destino?: { id: number; nombre: string };
}

export interface EmitirDespachoParams {
  producto_id: number;
  sucursal_origen_id: number;
  sucursal_destino_id: number;
  cantidad: number;
  observacion?: string;
}

export interface ConfirmarRecepcionParams {
  orden_id: number;
  cantidad_recibida: number;
  observacion?: string;
}

export type StockAlertLevel = "critico" | "bajo" | "optimo";

export interface AlertaStockItem {
  id: number;
  producto_id: number;
  producto_nombre: string;
  producto_codigo: string;
  categoria: string;
  sucursal_id: number;
  sucursal_nombre: string;
  cantidad_actual: number;
  stock_minimo: number;
  deficit: number;
  nivel: StockAlertLevel;
  stock_central_disponible?: number;
  almacen_central_id?: number;
}

export interface SugerenciaReabastecimiento {
  id: string;
  producto_id: number;
  producto_nombre: string;
  producto_codigo: string;
  sucursal_origen_id: number;
  sucursal_origen_nombre: string;
  sucursal_destino_id: number;
  sucursal_destino_nombre: string;
  cantidad_sugerida: number;
  stock_origen_disponible: number;
  stock_destino_actual: number;
  stock_destino_minimo: number;
  urgencia: "urgente" | "alta" | "media";
  justificacion: string;
}

export type RotacionClasificacion = "alta" | "media" | "baja";

export interface ProductoRotacionItem {
  productoId: number;
  nombre: string;
  codigo: string;
  categoria: string;
  precio: number;
  stockActual: number;
  unidadesVendidas: number;
  ingresosTotales: number;
  tasaRotacion: number; // Unidades vendidas / (unidades vendidas + stock actual)
  clasificacion: RotacionClasificacion;
}

export interface CategoriaRendimiento {
  categoria: string;
  unidadesVendidas: number;
  ingresosTotales: number;
  porcentajeVentas: number;
}

export interface MarketingInsight {
  id: string;
  tipo: "estrella" | "estancado" | "oportunidad" | "categoria";
  titulo: string;
  descripcion: string;
  productoNombre?: string;
  productoCodigo?: string;
  accionSugerida: string;
  impactoEstimado?: string;
}

export interface AnalisisRotacionResumen {
  diasAnalizados: number;
  totalUnidadesVendidas: number;
  totalIngresos: number;
  productosAltaRotacion: number;
  productosMediaRotacion: number;
  productosBajaRotacion: number;
  capitalInmovilizado: number;
  items: ProductoRotacionItem[];
  rendimientoCategorias: CategoriaRendimiento[];
  insightsMarketing: MarketingInsight[];
}



