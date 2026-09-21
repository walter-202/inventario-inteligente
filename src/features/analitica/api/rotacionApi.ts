import { z } from "zod";
import { supabase } from "../../../shared/lib/supabase";
import { fetchAllPages } from "../../../shared/lib/pagination";
import type {
  AnalisisRotacionResumen,
  CategoriaRendimiento,
  MarketingInsight,
  ProductoRotacionItem,
  RotacionClasificacion,
} from "../../../shared/types/domain";

export interface OpcionesAnalisisRotacion {
  dias?: number;
  sucursalId?: number;
}

export function clasificarProductoRotacion(
  unidadesVendidas: number,
  stockActual: number,
  tasaRotacion: number,
): RotacionClasificacion {
  if (unidadesVendidas === 0) return "baja";
  if (unidadesVendidas >= 8 || tasaRotacion >= 0.45) return "alta";
  if (unidadesVendidas <= 2 && tasaRotacion < 0.2) return "baja";
  return "media";
}

export function generarInsightsMarketing(
  items: ProductoRotacionItem[],
  dias: number,
): MarketingInsight[] {
  const insights: MarketingInsight[] = [];

  // 1. Top Performers (Prendas Estrella)
  const estrellas = items
    .filter((i) => i.clasificacion === "alta" && i.unidadesVendidas > 0)
    .sort((a, b) => b.unidadesVendidas - a.unidadesVendidas);

  if (estrellas.length > 0) {
    const top = estrellas[0];
    insights.push({
      id: "top-estrella",
      tipo: "estrella",
      titulo: `Prenda Estrella: ${top.nombre}`,
      descripcion: `Lidera el período con ${top.unidadesVendidas} unidades vendidas y $${top.ingresosTotales.toFixed(2)} generados. Tasa de salida del ${(top.tasaRotacion * 100).toFixed(0)}%.`,
      productoNombre: top.nombre,
      productoCodigo: top.codigo,
      accionSugerida: "Destacar en la vitrina principal de tienda y promocionar en campañas digitales/redes sociales.",
      impactoEstimado: "Maximiza el ticket promedio y capitaliza la tendencia del cliente.",
    });

    // Check if the top performer has low stock (risk of lost sales)
    const enRiesgo = estrellas.find((e) => e.stockActual <= 5);
    if (enRiesgo) {
      insights.push({
        id: "riesgo-quiebre",
        tipo: "oportunidad",
        titulo: `Riesgo de Quiebre en Prenda Clave: ${enRiesgo.nombre}`,
        descripcion: `Producto de alta demanda con solo ${enRiesgo.stockActual} unidades disponibles en existencias.`,
        productoNombre: enRiesgo.nombre,
        productoCodigo: enRiesgo.codigo,
        accionSugerida: "Solicitar despacho inmediato desde Almacén Central antes de publicitar la prenda.",
        impactoEstimado: "Previene pérdida estimada de ventas por falta de stock.",
      });
    }
  }

  // 2. Dead Stock / Capital Inmovilizado (Prendas Estancadas)
  const estancados = items
    .filter((i) => i.clasificacion === "baja" && i.stockActual > 0)
    .sort((a, b) => (b.stockActual * b.precio) - (a.stockActual * a.precio));

  if (estancados.length > 0) {
    const peor = estancados[0];
    const valorRetenido = peor.stockActual * peor.precio;
    insights.push({
      id: "stock-estancado-critico",
      tipo: "estancado",
      titulo: `Capital Inmovilizado: ${peor.nombre}`,
      descripcion: `Tiene ${peor.stockActual} unidades sin rotación significativa en los últimos ${dias} días ($${valorRetenido.toFixed(2)} retenidos).`,
      productoNombre: peor.nombre,
      productoCodigo: peor.codigo,
      accionSugerida: "Activar descuento flash del 15% al 25% o incluirlo como beneficio en un combo promocional.",
      impactoEstimado: "Recuperación de liquidez y liberación de espacio en perchero.",
    });
  }

  // 3. Category Trend
  const categoriasMap = new Map<string, { unidades: number; ingresos: number }>();
  for (const item of items) {
    const cat = item.categoria || "General";
    const cur = categoriasMap.get(cat) ?? { unidades: 0, ingresos: 0 };
    cur.unidades += item.unidadesVendidas;
    cur.ingresos += item.ingresosTotales;
    categoriasMap.set(cat, cur);
  }

  const sortedCats = Array.from(categoriasMap.entries()).sort(
    (a, b) => b[1].unidades - a[1].unidades,
  );

  if (sortedCats.length > 0 && sortedCats[0][1].unidades > 0) {
    const [topCat, stats] = sortedCats[0];
    insights.push({
      id: "categoria-lider",
      tipo: "categoria",
      titulo: `Línea de Mayor Tracción: ${topCat}`,
      descripcion: `Concentra ${stats.unidades} prendas vendidas ($${stats.ingresos.toFixed(2)} en ingresos).`,
      accionSugerida: `Priorizar compras y reposición en la categoría ${topCat} para la próxima colección.`,
      impactoEstimado: "Alineación del inventario con la demanda real del mercado.",
    });
  }

  return insights;
}

export async function obtenerAnalisisRotacion(
  opciones: OpcionesAnalisisRotacion = {},
): Promise<AnalisisRotacionResumen> {
  const dias = opciones.dias ?? 30;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - dias);
  const cutoffIso = cutoffDate.toISOString();

  // 1. Fetch all products
  const products = await fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from("productos")
      .select("id, nombre, codigo, categoria, precio")
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

  // 2. Fetch inventory per product (optionally filtered by sucursal)
  let invQuery = supabase
    .from("inventarios")
    .select("producto_id, cantidad, sucursal_id");

  if (opciones.sucursalId !== undefined) {
    invQuery = invQuery.eq("sucursal_id", z.number().int().positive().parse(opciones.sucursalId));
  }

  const { data: invRows, error: invError } = await invQuery;
  if (invError) throw new Error(invError.message);

  const stockMap = new Map<number, number>();
  for (const inv of invRows ?? []) {
    const cur = stockMap.get(inv.producto_id) ?? 0;
    stockMap.set(inv.producto_id, cur + (inv.cantidad ?? 0));
  }

  // 3. Fetch sales in date range
  let salesQuery = supabase
    .from("ventas")
    .select("id, fecha, total, estado, sucursal_id")
    .neq("estado", "anulada")
    .gte("fecha", cutoffIso);

  if (opciones.sucursalId !== undefined) {
    salesQuery = salesQuery.eq("sucursal_id", opciones.sucursalId);
  }

  const { data: salesRows, error: salesError } = await salesQuery;
  if (salesError) throw new Error(salesError.message);

  const saleIds = (salesRows ?? []).map((s) => s.id);

  // 4. Fetch sales details for valid sales in range
  const salesDetailsMap = new Map<number, { unidades: number; ingresos: number }>();
  if (saleIds.length > 0) {
    // Fetch in batches of 500 sale IDs if necessary
    const batchSize = 300;
    for (let i = 0; i < saleIds.length; i += batchSize) {
      const chunk = saleIds.slice(i, i + batchSize);
      const { data: detRows, error: detError } = await supabase
        .from("ventas_detalles")
        .select("producto_id, cantidad, precio")
        .in("venta_id", chunk);

      if (detError) throw new Error(detError.message);

      for (const d of detRows ?? []) {
        const cur = salesDetailsMap.get(d.producto_id) ?? { unidades: 0, ingresos: 0 };
        cur.unidades += d.cantidad ?? 0;
        cur.ingresos += (d.cantidad ?? 0) * (d.precio ?? 0);
        salesDetailsMap.set(d.producto_id, cur);
      }
    }
  }

  // 5. Build rotation items
  let totalUnidadesVendidas = 0;
  let totalIngresos = 0;
  let capitalInmovilizado = 0;

  const items: ProductoRotacionItem[] = products.map((prod) => {
    const stockActual = stockMap.get(prod.id) ?? 0;
    const saleInfo = salesDetailsMap.get(prod.id) ?? { unidades: 0, ingresos: 0 };
    const unidadesVendidas = saleInfo.unidades;
    const ingresosTotales = saleInfo.ingresos;

    totalUnidadesVendidas += unidadesVendidas;
    totalIngresos += ingresosTotales;

    const totalGestionado = unidadesVendidas + stockActual;
    const tasaRotacion = totalGestionado > 0 ? unidadesVendidas / totalGestionado : 0;
    const clasificacion = clasificarProductoRotacion(unidadesVendidas, stockActual, tasaRotacion);

    if (clasificacion === "baja" && stockActual > 0) {
      capitalInmovilizado += stockActual * prod.precio;
    }

    return {
      productoId: prod.id,
      nombre: prod.nombre,
      codigo: prod.codigo,
      categoria: prod.categoria,
      precio: prod.precio,
      stockActual,
      unidadesVendidas,
      ingresosTotales,
      tasaRotacion,
      clasificacion,
    };
  });

  // Sort: High rotation first, then by units sold descending
  items.sort((a, b) => {
    const rank = { alta: 0, media: 1, baja: 2 };
    if (rank[a.clasificacion] !== rank[b.clasificacion]) {
      return rank[a.clasificacion] - rank[b.clasificacion];
    }
    return b.unidadesVendidas - a.unidadesVendidas;
  });

  // 6. Category breakdown
  const catAgg = new Map<string, { unidades: number; ingresos: number }>();
  for (const item of items) {
    const cat = item.categoria || "General";
    const cur = catAgg.get(cat) ?? { unidades: 0, ingresos: 0 };
    cur.unidades += item.unidadesVendidas;
    cur.ingresos += item.ingresosTotales;
    catAgg.set(cat, cur);
  }

  const rendimientoCategorias: CategoriaRendimiento[] = Array.from(catAgg.entries())
    .map(([categoria, stats]) => ({
      categoria,
      unidadesVendidas: stats.unidades,
      ingresosTotales: stats.ingresos,
      porcentajeVentas: totalUnidadesVendidas > 0 ? (stats.unidades / totalUnidadesVendidas) * 100 : 0,
    }))
    .sort((a, b) => b.unidadesVendidas - a.unidadesVendidas);

  // 7. Generate actionable marketing insights
  const insightsMarketing = generarInsightsMarketing(items, dias);

  return {
    diasAnalizados: dias,
    totalUnidadesVendidas,
    totalIngresos,
    productosAltaRotacion: items.filter((i) => i.clasificacion === "alta").length,
    productosMediaRotacion: items.filter((i) => i.clasificacion === "media").length,
    productosBajaRotacion: items.filter((i) => i.clasificacion === "baja").length,
    capitalInmovilizado,
    items,
    rendimientoCategorias,
    insightsMarketing,
  };
}
