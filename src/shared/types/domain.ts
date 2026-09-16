export interface Producto {
  id: number;
  nombre: string;
  codigo: string;
  categoria: string;
  precio: number;
  cantidad: number;
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
  categoria: string;
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

export interface VentaResumen {
  id: number;
  sucursal_id: number;
  fecha: string;
  total: number;
  metodo_pago: string;
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
