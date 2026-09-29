import { z } from "zod";
import type { Ability } from "../../auth/lib/permissions";
import type { Producto } from "../../../shared/types/domain";
import { normalizarMonedaAsistente } from "../../../shared/lib/utils";
import type { AssistantScopeContext } from "./assistantAuthorization";
import type { IntentoDesambiguacion } from "./chatSession";
import type {
  AssistantAnalysisReport,
  AssistantInventoryGroupBy,
  AssistantSalesGroupBy,
} from "../api/assistantAnalyticsApi";
import {
  buildConsultaKardexResult,
  consultarStockDe,
  defaultAssistantReadApi,
  resolveScopedBranch,
  resolverCoincidencia,
  searchProductsWithVariants,
  type AssistantReadApi,
  type LineaInterpretada,
  type ResultadoInterpretacion,
} from "../api/voiceCommandApi";
import { RegistroProductoSchema, type RegistroProductoParsed } from "../api/voiceRegistrationService";
import { formatSalesPeriodLabel, type SalesQueryPeriod } from "../../dashboard/api/dashboardApi";

export {
  ASSISTANT_CONFIG_MESSAGE,
  ASSISTANT_PROVIDER_ERROR_MESSAGE,
  ASSISTANT_TIMEOUT_MESSAGE,
} from "./aiSdkProviders";

export type AssistantToolError = {
  error: string;
  message: string;
  suggestion: string;
};

export const TOOL_ABILITIES = {
  search_products: "products.read",
  get_stock: "inventory.read",
  list_low_stock: "inventory.read",
  list_inventory: "inventory.read",
  get_sales_summary: "sales.read",
  analyze_sales: "sales.read",
  analyze_inventory: "inventory.read",
  get_rotation_analysis: "dashboard.read",
  get_kardex: "inventory.read",
  propose_sale: "sales.write",
  propose_product_registration: "products.write",
} as const satisfies Record<string, Ability>;

export type AssistantToolName = keyof typeof TOOL_ABILITIES;

export type AssistantToolContext = {
  readApi?: AssistantReadApi;
  scope: AssistantScopeContext;
};

export type AssistantToolDefinition = {
  description: string;
  inputSchema: z.ZodType;
  execute: (input: any) => Promise<unknown>;
};

function toolError(error: string, message: string, suggestion: string): AssistantToolError {
  return { error, message, suggestion };
}

function unknownBranch(solicitada: string): AssistantToolError {
  return toolError(
    "unknown_branch",
    `No reconozco la sucursal "${solicitada}". Indicá una sucursal habilitada para aplicar el filtro.`,
    "Usá exactamente uno de los nombres de sucursal que aparecen en las instrucciones.",
  );
}

function assistantLocalDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function resolveAnalysisDateRange(from?: string | null, to?: string | null): { from: string; to: string } {
  const today = assistantLocalDate();
  const end = to ?? today;
  const startDate = new Date(`${(from ?? end)}T00:00:00.000Z`);
  if (!from) startDate.setUTCDate(startDate.getUTCDate() - 29);
  if (!Number.isFinite(startDate.getTime())) throw new Error("La fecha de inicio no es válida.");
  return { from: startDate.toISOString().slice(0, 10), to: end };
}

function formatAnalysisCurrency(value: number): string {
  return `Bs. ${value.toFixed(2)}`;
}

const productAlternativesSchema = z.array(z.string().trim().min(1).max(80)).max(4).nullable().optional();

async function resolveCanonicalProductFilter(
  query: string | null | undefined,
  alternatives: string[] | null | undefined,
  readApi: AssistantReadApi,
): Promise<{ query?: string; error?: AssistantToolError }> {
  const requested = query?.trim();
  if (!requested) return {};
  const result = await resolverCoincidencia(requested, readApi, alternatives ?? []);
  if (result.kind === "match") return { query: result.product.nombre };
  if (result.kind === "candidatos") {
    const names = result.products.slice(0, 5).map((product) => `${product.nombre} (${product.codigo})`).join(", ");
    return {
      error: toolError(
        "ambiguous_product",
        `El filtro "${requested}" coincide con varios productos: ${names}.`,
        "Acotá el análisis a un producto concreto o a una categoría.",
      ),
    };
  }
  return {
    error: toolError(
      "product_not_found",
      `No encontré "${requested}" en el catálogo para usarlo como filtro.`,
      "Probá con search_products y usá el nombre del producto que aparezca en el catálogo.",
    ),
  };
}

export function createAssistantToolExecutors(ctx: AssistantToolContext): Record<string, AssistantToolDefinition> {
  const readApi = ctx.readApi ?? defaultAssistantReadApi;
  const scope = ctx.scope;
  const all: Record<AssistantToolName, AssistantToolDefinition> = {
    search_products: {
      description:
        "Busca productos del catálogo por intención, nombre aproximado, categoría o SKU. Usala cuando el usuario describe un producto sin usar exactamente su nombre de catálogo; traduce conceptos cotidianos a prendas probables (por ejemplo 'algo abrigado' → suéter, chompa, chaqueta) y envía hasta 4 alternativas pertinentes, junto con el texto original. La búsqueda combina las variantes semánticas propuestas por el agente con texto completo, similitud de palabras y coincidencia exacta de SKU/código de barras. NO la uses para vender (usá propose_sale) ni para consultar stock de un producto ya identificado (usá get_stock).",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe("Nombre (aunque sea aproximado), categoría o SKU."),
        alternativas: productAlternativesSchema.describe("Hasta 4 sinónimos o variantes de escritura pertinentes en español."),
      }),
      execute: async ({ query, alternativas }) => {
        const productos = await searchProductsWithVariants(query, readApi, 12, alternativas ?? []);
        return {
          kind: "buscar_producto",
          consulta: query,
          productos,
          lineas: [] as const,
          mensaje: productos.length
            ? `Encontré ${productos.length} producto${productos.length === 1 ? "" : "s"} para "${query}".`
            : `No encontré productos para "${query}". Probá search_products otra vez con 1 o 2 palabras distintivas (sombra cejas, adhesivo pestañas). No le pidas el SKU a la persona todavía.`,
        };
      },
    },
    get_stock: {
      description:
        "Consulta el stock de UN producto ya identificado por nombre o SKU. Usala para 'cuánto me queda de labiales'. NO la uses para listar todo el inventario (list_inventory) ni para stock bajo (list_low_stock).",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe("Nombre o SKU del producto"),
        alternativas: productAlternativesSchema.describe("Sinónimos regionales o variantes del nombre si el usuario usó una palabra distinta al catálogo."),
        sucursal: z.string().trim().min(1).nullable().optional().describe("Sucursal mencionada, o null"),
      }),
      execute: async ({ query, alternativas, sucursal }) => {
        const branch = await resolveScopedBranch(sucursal, readApi, scope);
        if (branch.kind === "unknown") return unknownBranch(branch.solicitada);
        const coincidencia = await resolverCoincidencia(query, readApi, alternativas ?? []);
        if (coincidencia.kind === "candidatos") {
          return {
            kind: "desambiguacion",
            texto: query,
            candidatos: coincidencia.products,
            intento: { accion: "consulta_stock", sucursal: branch.branchName } satisfies IntentoDesambiguacion,
          };
        }
        if (coincidencia.kind === "none") {
          return toolError(
            "not_found",
            `No se encontró el producto "${query}".`,
            "Volvé a llamar get_stock con las palabras distintivas del producto. No le pidas el SKU a la persona todavía.",
          );
        }
        const stock = await consultarStockDe(
          coincidencia.product,
          branch.branchName ?? (typeof sucursal === "string" ? sucursal : undefined),
          readApi,
          scope.allowedBranchIds,
        );
        return { ...stock, kind: "consulta_stock" };
      },
    },
    list_low_stock: {
      description:
        "Lista EXCLUSIVAMENTE productos en alerta crítica de stock bajo (stock <= stock_minimo para reponer). Usala solo para 'qué está por agotarse' o 'qué falta reponer'. NUNCA la uses si el usuario pide ordenar o dictar inventario ('de menor a mayor', 'de mayor a menor', etc.): para ordenar productos usá SIEMPRE list_inventory con orden='asc' o 'desc'.",
      inputSchema: z.object({
        sucursal: z.string().trim().min(1).nullable().optional(),
      }),
      execute: async ({ sucursal }) => {
        const branch = await resolveScopedBranch(sucursal, readApi, scope);
        if (branch.kind === "unknown") return unknownBranch(branch.solicitada);
        const productos = await readApi.getLowStock(branch.branchId);
        const filtroSucursal = branch.branchName;
        return {
          kind: "consulta_bajo_stock",
          filtroSucursal,
          productos,
          lineas: [] as const,
          mensaje: productos.length
            ? `Hay ${productos.length} producto${productos.length === 1 ? "" : "s"} con stock bajo${filtroSucursal ? ` en ${filtroSucursal}` : ""}.`
            : `No hay productos con stock bajo${filtroSucursal ? ` en ${filtroSucursal}` : ""}.`,
        };
      },
    },
    list_inventory: {
      description:
        "Lista y ordena el inventario de productos de la sucursal. OBLIGATORIA para peticiones de ordenamiento o listado general como 'díctame de menor a mayor', 'de menor a mayor', 'de mayor a menor', 'ordenar por stock', 'qué productos tenemos' o 'con más de N unidades'. Usa orden='asc' para 'de menor a mayor' (menos stock primero) y orden='desc' para 'de mayor a menor'. NUNCA uses list_low_stock para ordenar de menor a mayor.",
      inputSchema: z.object({
        sucursal: z.string().trim().min(1).nullable().optional(),
        min_stock: z.number().int().nonnegative().nullable().optional(),
        orden: z.enum(["asc", "desc"]).nullable().optional(),
      }),
      execute: async ({ sucursal, min_stock, orden }) => {
        const branch = await resolveScopedBranch(sucursal, readApi, scope);
        if (branch.kind === "unknown") return unknownBranch(branch.solicitada);
        const minStock = min_stock ?? 0;
        const direction = orden === "asc" ? 1 : -1;
        const todas = await readApi.getStockList(branch.branchId);
        const filtrados = todas
          .filter((item) => item.cantidad >= minStock)
          .sort(
            (left, right) =>
              (left.cantidad - right.cantidad) * direction || left.nombre.localeCompare(right.nombre),
          );
        const umbralTexto = minStock > 0 ? ` con ${minStock}+ unidades` : "";
        const ordenTexto = orden === "asc" ? " de menor a mayor stock" : " de mayor a menor stock";
        const ambito = branch.branchName
          ? `en ${branch.branchName}`
          : branch.branchId !== undefined
            ? "en la sucursal activa"
            : "en todas las sucursales";
        return {
          kind: "listar_inventario",
          filtroSucursal: branch.branchName,
          minStock,
          productos: filtrados,
          lineas: [] as const,
          mensaje: filtrados.length
            ? `Encontré ${filtrados.length} producto${filtrados.length === 1 ? "" : "s"}${umbralTexto} ${ambito}${ordenTexto}.`
            : `No hay productos${umbralTexto} ${ambito}.`,
        };
      },
    },
    analyze_inventory: {
      description:
        "Consulta y agrega el inventario con datos de Supabase. Usala para análisis por producto, categoría o sucursal, valor referencial, unidades o alertas de mínimo. Elegí group_by según la pregunta y solo_bajo_minimo=true si piden faltantes/reposición. El valor estimado usa el precio de venta del catálogo, no el costo contable. La sucursal activa se aplica por defecto, salvo que un administrador pida agrupar por sucursal sin indicar una sucursal específica: en ese caso compara todas las sucursales.",
      inputSchema: z.object({
        group_by: z.enum(["producto", "categoria", "sucursal"]).nullable().optional(),
        sucursal: z.string().trim().min(1).nullable().optional(),
        solo_bajo_minimo: z.boolean().nullable().optional(),
        categoria: z.string().trim().min(1).max(100).nullable().optional(),
        producto: z.string().trim().min(1).max(100).nullable().optional(),
        alternativas_producto: productAlternativesSchema.describe("Sinónimos regionales del producto para resolverlo contra el catálogo."),
        limite: z.number().int().min(1).max(20).nullable().optional(),
      }),
      execute: async ({ group_by, sucursal, solo_bajo_minimo, categoria, producto, alternativas_producto, limite }) => {
        const groupBy: AssistantInventoryGroupBy = group_by ?? "categoria";
        const todasLasSucursales = groupBy === "sucursal" && !sucursal?.trim() && scope.role === "admin";
        const branch = todasLasSucursales
          ? { kind: "ok" as const, branchId: undefined, branchName: undefined }
          : await resolveScopedBranch(sucursal, readApi, scope);
        if (branch.kind === "unknown") return unknownBranch(branch.solicitada);
        const productFilter = await resolveCanonicalProductFilter(producto, alternativas_producto, readApi);
        if (productFilter.error) return productFilter.error;
        const analysis = await readApi.getInventoryAnalysis({
          groupBy,
          sucursalId: branch.branchId,
          soloBajoMinimo: solo_bajo_minimo ?? false,
          limite: limite ?? 10,
          categoria: categoria ?? undefined,
          producto: productFilter.query,
        });
        const scopeLabel = branch.branchName
          ?? (todasLasSucursales ? "Todas las sucursales habilitadas" : scope.activeBranchName ?? "Sucursal activa");
        const branchLabel = ` en ${scopeLabel}`;
        const top = analysis.rows.slice(0, 5).map((row) =>
          `${row.key}: ${row.stock_units} u., ${formatAnalysisCurrency(row.estimated_value)}`,
        ).join("; ");
        const filters = [categoria ? `categoría ${categoria}` : null, productFilter.query ? `producto ${productFilter.query}` : null].filter(Boolean).join(", ");
        const filterLabel = filters ? ` Filtros: ${filters}.` : "";
        const message = `Inventario${branchLabel}: ${analysis.summary.products} productos con stock, ${analysis.summary.stock_units} unidades, valor referencial ${formatAnalysisCurrency(analysis.summary.estimated_value)} y ${analysis.summary.below_minimum} registros bajo mínimo.${filterLabel} ${top ? `Principales grupos por ${groupBy}: ${top}.` : "No hay filas para este filtro."} El valor usa precios de catálogo, no costos de compra.`;
        return {
          kind: "consulta_analitica",
          message,
          analysis,
          scopeLabel,
        };
      },
    },
    get_sales_summary: {
      description:
        "Resumen de ventas por periodo. periodo='hoy' = día actual; 'semana' = últimos 7 días; 'mes' = mes calendario actual; 'dia' = un solo día calendario con dias_atras (0=hoy, 1=ayer, 3=hace 3 días). Para 'y hace 3 días?' o 'ventas de ayer' usá periodo='dia' con dias_atras correcto; NO uses 'semana' salvo que pidan explícitamente la semana o últimos 7 días. Si mencionan otra sucursal, pasala; si no, usá la sucursal activa.",
      inputSchema: z.object({
        periodo: z.enum(["hoy", "semana", "mes", "dia"]).describe("Periodo de ventas a consultar"),
        dias_atras: z
          .number()
          .int()
          .min(0)
          .max(90)
          .nullable()
          .optional()
          .describe("Solo con periodo='dia': 0=hoy, 1=ayer, 3=hace 3 días"),
        sucursal: z.string().trim().min(1).nullable().optional(),
      }),
      execute: async ({
        periodo,
        dias_atras,
        sucursal,
      }: {
        periodo: SalesQueryPeriod;
        dias_atras?: number | null;
        sucursal?: string | null;
      }) => {
        const branch = await resolveScopedBranch(sucursal, readApi, scope);
        if (branch.kind === "unknown") return unknownBranch(branch.solicitada);
        const diasAtras = periodo === "dia" ? (dias_atras ?? 0) : undefined;
        const metrics = await readApi.getSalesSummary(periodo, branch.branchId, diasAtras);
        const filtroSucursal = branch.branchName;
        const sucursalText = filtroSucursal ? `en ${filtroSucursal}` : "en la sucursal activa";
        const periodoTexto = formatSalesPeriodLabel(metrics.periodo, metrics.diasAtras);
        return {
          kind: "consulta_ventas",
          filtroSucursal,
          totalVentas: metrics.totalSales,
          cantidadVentas: metrics.salesCount,
          periodo: metrics.periodo,
          diasAtras: metrics.diasAtras,
          mensaje: `Ventas ${periodoTexto} ${sucursalText}: Bs. ${metrics.totalSales.toFixed(2)} (${metrics.salesCount} transacción${metrics.salesCount === 1 ? "" : "es"}).`,
        };
      },
    },
    analyze_sales: {
      description:
        "Construye un plan de consulta de ventas y devuelve agregados calculados en PostgreSQL: rango de fechas, sucursal, métrica y agrupación por día, producto, categoría, medio de pago o sucursal. Usala para preguntas comparativas o con varias condiciones (por ejemplo, qué categorías crecieron, mejores productos del mes, tendencia semanal o ventas por sucursal). La agrupación entre sucursales requiere rol administrador y sin filtro de sucursal compara todas. Los rangos son inclusivos y el máximo es 365 días. Si comparan, compara automáticamente con el período inmediatamente anterior de igual duración. Se excluyen ventas anuladas.",
      inputSchema: z.object({
        desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        group_by: z.enum(["dia", "producto", "categoria", "metodo_pago", "sucursal"]).nullable().optional(),
        comparar_periodo_anterior: z.boolean().nullable().optional(),
        sucursal: z.string().trim().min(1).nullable().optional(),
        categoria: z.string().trim().min(1).max(100).nullable().optional(),
        producto: z.string().trim().min(1).max(100).nullable().optional(),
        alternativas_producto: productAlternativesSchema.describe("Sinónimos regionales del producto para resolverlo contra el catálogo."),
        medio_pago: z.enum(["efectivo", "QR", "tarjeta", "transferencia"]).nullable().optional(),
        limite: z.number().int().min(1).max(20).nullable().optional(),
      }),
      execute: async ({ desde, hasta, group_by, comparar_periodo_anterior, sucursal, categoria, producto, alternativas_producto, medio_pago, limite }) => {
        const groupBy: AssistantSalesGroupBy = group_by ?? "dia";
        if (groupBy === "sucursal" && scope.role !== "admin") {
          return toolError(
            "admin_required",
            "El desglose de ventas entre sucursales está reservado para administradores.",
            "Consulta las ventas de una sucursal habilitada o agrupa por categoría, producto, día o medio de pago.",
          );
        }
        const compararSucursales = groupBy === "sucursal" && !sucursal?.trim() && scope.role === "admin";
        const branch = compararSucursales
          ? { kind: "ok" as const, branchId: undefined, branchName: undefined }
          : await resolveScopedBranch(sucursal, readApi, scope);
        if (branch.kind === "unknown") return unknownBranch(branch.solicitada);
        const productFilter = await resolveCanonicalProductFilter(producto, alternativas_producto, readApi);
        if (productFilter.error) return productFilter.error;
        const range = resolveAnalysisDateRange(desde, hasta);
        const analysis = await readApi.getSalesAnalysis({
          desde: range.from,
          hasta: range.to,
          groupBy,
          sucursalId: branch.branchId,
          compararPeriodoAnterior: comparar_periodo_anterior ?? false,
          limite: limite ?? 10,
          categoria: categoria ?? undefined,
          producto: productFilter.query,
          metodoPago: medio_pago ?? undefined,
        });
        const scopeLabel = branch.branchName
          ?? (compararSucursales ? "Todas las sucursales habilitadas" : scope.activeBranchName ?? "Sucursal activa");
        const branchLabel = ` en ${scopeLabel}`;
        const summary = analysis.summary;
        const change = analysis.previous_summary
          ? analysis.previous_summary.revenue > 0
            ? ` Variación contra ${analysis.previous_from}–${analysis.previous_to}: ${(((summary.revenue - analysis.previous_summary.revenue) / analysis.previous_summary.revenue) * 100).toFixed(1)}%.`
            : ` El período anterior registró ${formatAnalysisCurrency(analysis.previous_summary.revenue)}.`
          : "";
        const top = analysis.rows.slice(0, 5).map((row) =>
          `${row.key}: ${formatAnalysisCurrency(row.revenue)}, ${row.transactions} transacciones, ${row.units} u.`,
        ).join("; ");
        const filters = [categoria ? `categoría ${categoria}` : null, productFilter.query ? `producto ${productFilter.query}` : null, medio_pago ? `medio de pago ${medio_pago}` : null].filter(Boolean).join(", ");
        const filterLabel = filters ? ` Filtros: ${filters}.` : "";
        const message = `Ventas del ${analysis.from} al ${analysis.to}${branchLabel}: ${formatAnalysisCurrency(summary.revenue)}, ${summary.transactions} transacciones, ${summary.units} unidades y ticket promedio ${formatAnalysisCurrency(summary.average_ticket)}.${change}${filterLabel} ${top ? `Desglose por ${groupBy}: ${top}.` : "No hay detalle para este rango."}`;
        return {
          kind: "consulta_analitica",
          message,
          analysis,
          scopeLabel,
        };
      },
    },
    get_rotation_analysis: {
      description:
        "Analiza rotación de productos e insights de marketing. Usala para 'qué rota', 'prendas estrella', 'capital inmovilizado', 'productos estancados' o rendimiento por categoría. NO la uses para stock puntual (get_stock) ni ventas del día (get_sales_summary).",
      inputSchema: z.object({
        dias: z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(90)]).nullable().optional(),
        sucursal: z.string().trim().min(1).nullable().optional(),
        clasificacion: z.enum(["alta", "media", "baja", "todas"]).nullable().optional(),
        limite: z.number().int().min(1).max(20).nullable().optional(),
      }),
      execute: async ({ dias, sucursal, clasificacion, limite }) => {
        const branch = await resolveScopedBranch(sucursal, readApi, scope);
        if (branch.kind === "unknown") return unknownBranch(branch.solicitada);
        const analisis = await readApi.getRotationAnalysis({
          dias: dias ?? 30,
          sucursalId: branch.branchId,
        });
        const filtro = clasificacion && clasificacion !== "todas" ? clasificacion : null;
        const itemsFiltrados = filtro
          ? analisis.items.filter((item) => item.clasificacion === filtro)
          : analisis.items;
        const topItems = itemsFiltrados.slice(0, limite ?? 8).map((item) => ({
          nombre: item.nombre,
          codigo: item.codigo,
          unidadesVendidas: item.unidadesVendidas,
          stockActual: item.stockActual,
          clasificacion: item.clasificacion,
        }));
        const insights = analisis.insightsMarketing.slice(0, 3).map((insight) => ({
          titulo: insight.titulo,
          descripcion: insight.descripcion,
          accionSugerida: insight.accionSugerida,
        }));
        const categorias = analisis.rendimientoCategorias.slice(0, 5).map((cat) => ({
          categoria: cat.categoria,
          unidadesVendidas: cat.unidadesVendidas,
          porcentajeVentas: cat.porcentajeVentas,
        }));
        const ambito = branch.branchName ? ` en ${branch.branchName}` : "";
        const filtroTexto = filtro ? ` (${filtro} rotación)` : "";
        return {
          kind: "consulta_rotacion",
          filtroSucursal: branch.branchName,
          diasAnalizados: analisis.diasAnalizados,
          totalUnidadesVendidas: analisis.totalUnidadesVendidas,
          totalIngresos: analisis.totalIngresos,
          capitalInmovilizado: analisis.capitalInmovilizado,
          productosAltaRotacion: analisis.productosAltaRotacion,
          productosMediaRotacion: analisis.productosMediaRotacion,
          productosBajaRotacion: analisis.productosBajaRotacion,
          items: topItems,
          insights,
          categorias,
          mensaje: `Rotación de ${analisis.diasAnalizados} días${ambito}${filtroTexto}: ${analisis.totalUnidadesVendidas} u. vendidas, Bs. ${analisis.totalIngresos.toFixed(2)} y Bs. ${analisis.capitalInmovilizado.toFixed(2)} inmovilizados.`,
        };
      },
    },
    get_kardex: {
      description:
        "Consulta el historial de movimientos de inventario (kardex). Usala para 'últimos movimientos', 'entradas/salidas de X' o 'historial del producto'. NO registra movimientos. Si piden un producto, pasá query; si no, devuelve los movimientos recientes de la sucursal.",
      inputSchema: z.object({
        query: z.string().trim().min(1).nullable().optional(),
        alternativas: productAlternativesSchema.describe("Sinónimos regionales o variantes del nombre del producto."),
        sucursal: z.string().trim().min(1).nullable().optional(),
        tipo: z.enum(["entrada", "salida", "todas"]).nullable().optional(),
        limite: z.number().int().min(1).max(50).nullable().optional(),
      }),
      execute: async ({ query, alternativas, sucursal, tipo, limite }) => {
        const branch = await resolveScopedBranch(sucursal, readApi, scope);
        if (branch.kind === "unknown") return unknownBranch(branch.solicitada);
        const tipoMovimiento = tipo ?? "todas";
        const maxRows = limite ?? 15;
        const trimmedQuery = query?.trim();

        if (trimmedQuery) {
          const coincidencia = await resolverCoincidencia(trimmedQuery, readApi, alternativas ?? []);
          if (coincidencia.kind === "candidatos") {
            return {
              kind: "desambiguacion",
              texto: trimmedQuery,
              candidatos: coincidencia.products,
              intento: {
                accion: "consulta_kardex",
                sucursal: branch.branchName,
                tipo: tipoMovimiento,
              } satisfies IntentoDesambiguacion,
            };
          }
          if (coincidencia.kind === "none") {
            return toolError(
              "not_found",
              `No se encontró el producto "${trimmedQuery}".`,
              "Volvé a llamar get_kardex con palabras distintivas del producto o su SKU.",
            );
          }
          const movimientos = await readApi.getKardex({
            producto_id: coincidencia.product.id,
            sucursal_id: branch.branchId,
            tipo: tipoMovimiento,
            limite: maxRows,
          });
          return { kind: "consulta_kardex", ...buildConsultaKardexResult({
            movimientos,
            filtroSucursal: branch.branchName,
            producto: coincidencia.product,
            tipoMovimiento,
          }) };
        }

        const movimientos = await readApi.getKardex({
          sucursal_id: branch.branchId,
          tipo: tipoMovimiento,
          limite: maxRows,
        });
        return { kind: "consulta_kardex", ...buildConsultaKardexResult({
          movimientos,
          filtroSucursal: branch.branchName,
          tipoMovimiento,
        }) };
      },
    },
    propose_sale: {
      description:
        "Prepara una propuesta de venta. NUNCA registra la venta ni descuenta stock: solo valida productos y devuelve líneas para que la persona confirme en pantalla. Usala cuando el usuario quiere vender, cobrar o agregarle unidades a una venta. Pasá el nombre que dijo el usuario aunque sea aproximado ('sombra para cejas delicadas', 'agenda ahorradora'); la coincidencia es difusa. No pidas SKU antes de llamar esta tool.",
      inputSchema: z.object({
        items: z
          .array(
            z.object({
              query: z.string().trim().min(1).describe("Nombre aproximado o SKU"),
              alternativas: productAlternativesSchema.describe("Sinónimos regionales si el nombre del catálogo es distinto al usado por la persona."),
              cantidad: z.number().int().positive(),
            }),
          )
          .min(1),
      }),
      execute: async ({ items }) => {
        const lineas: LineaInterpretada[] = [];
        for (const item of items) {
          const coincidencia = await resolverCoincidencia(item.query, readApi, item.alternativas ?? []);
          if (coincidencia.kind === "candidatos") {
            return {
              kind: "desambiguacion",
              texto: item.query,
              candidatos: coincidencia.products,
              intento: { accion: "venta", cantidad: item.cantidad } satisfies IntentoDesambiguacion,
            };
          }
          if (coincidencia.kind === "none") {
            return toolError(
              "not_found",
              `No se encontró el producto "${item.query}".`,
              "Volvé a llamar propose_sale o search_products con las palabras distintivas (sin de/para). No le pidas el SKU a la persona todavía.",
            );
          }
          lineas.push({ producto: coincidencia.product, cantidadSolicitada: item.cantidad });
        }
        return {
          kind: "venta",
          lineas,
          mensaje: `Propuesta de venta (pendiente de confirmación): ${lineas
            .map((line) => `${line.cantidadSolicitada} × ${line.producto.nombre}`)
            .join(", ")}.`,
        };
      },
    },
    propose_product_registration: {
      description:
        "Prepara el alta de un producto. NUNCA escribe en el catálogo: solo devuelve los campos extraídos para que la persona confirme. Usala cuando el usuario quiere registrar, dar de alta o agregar una prenda nueva. Si el historial tiene un código de barras escaneado, pasalo en codigo_barra. Si un campo no se dictó, dejalo null.",
      inputSchema: RegistroProductoSchema,
      execute: async (datos: RegistroProductoParsed) => {
        const camposExtraidos = [
          datos.nombre ? `nombre "${datos.nombre}"` : null,
          datos.codigo ? `SKU ${datos.codigo}` : null,
          datos.codigo_barra ? `barras ${datos.codigo_barra}` : null,
          datos.categoria ? `categoría ${datos.categoria}` : null,
          datos.precio !== null ? `precio Bs. ${datos.precio}` : null,
          datos.cantidad !== null ? `stock inicial ${datos.cantidad}` : null,
        ]
          .filter(Boolean)
          .join(", ");
        return {
          kind: "registro_producto",
          datos,
          mensaje: camposExtraidos
            ? `Reconocí estos datos para el nuevo producto: ${camposExtraidos}. Podés confirmar el alta o completarla en el formulario.`
            : "Detecté la intención de dar de alta un producto. Revisá y confirmá los datos en la tarjeta.",
        };
      },
    },
  };

  const allowed: Record<string, AssistantToolDefinition> = {};
  for (const name of Object.keys(all) as AssistantToolName[]) {
    if (scope.abilities.includes(TOOL_ABILITIES[name])) {
      allowed[name] = all[name];
    }
  }
  return allowed;
}

export function listToolNamesForAbilities(abilities: Ability[]): AssistantToolName[] {
  return (Object.keys(TOOL_ABILITIES) as AssistantToolName[]).filter((name) => abilities.includes(TOOL_ABILITIES[name]));
}

type ToolOutput = { toolName: string; output: unknown };

function isToolError(output: unknown): output is AssistantToolError {
  return Boolean(output && typeof output === "object" && "error" in output && (output as AssistantToolError).error);
}

function taggedKind(output: unknown, toolName: string): string | undefined {
  if (output && typeof output === "object" && "kind" in output && typeof output.kind === "string") {
    return output.kind;
  }
  return toolName;
}

function stringField(output: object, key: string): string | undefined {
  return key in output && typeof (output as Record<string, unknown>)[key] === "string"
    ? String((output as Record<string, unknown>)[key])
    : undefined;
}

/**
 * Picks the last successful tool payload so the chat can render cards.
 * The model's text is preferred as the visible message when present.
 */
export function mapToolOutputsToResult(
  outputs: ToolOutput[],
  modelText: string,
  thoughts: string[],
): ResultadoInterpretacion {
  const text = normalizarMonedaAsistente(modelText.trim());
  const reports = outputs.flatMap((entry): AssistantAnalysisReport[] => {
    if (!entry || isToolError(entry.output) || !entry.output || typeof entry.output !== "object") return [];
    const output = entry.output as Record<string, unknown>;
    if (taggedKind(output, entry.toolName) !== "consulta_analitica" || !output.analysis || typeof output.analysis !== "object") return [];
    const analysis = output.analysis as AssistantAnalysisReport["analysis"];
    if (analysis.dataset !== "sales" && analysis.dataset !== "inventory") return [];
    return [{
      analysis,
      scopeLabel: stringField(output, "scopeLabel") ?? "Sucursal habilitada",
    }];
  }).slice(0, 6);
  if (reports.length > 0) {
    let fallbackMessage: string | undefined;
    for (let index = outputs.length - 1; index >= 0; index -= 1) {
      const entry = outputs[index];
      if (!entry || isToolError(entry.output) || !entry.output || typeof entry.output !== "object") continue;
      if (taggedKind(entry.output, entry.toolName) === "consulta_analitica") {
        fallbackMessage = stringField(entry.output, "message");
        break;
      }
    }
    return {
      tipo: "consulta_analitica",
      mensaje: text || fallbackMessage || "Preparé el análisis con los datos disponibles.",
      reports,
      pasosPensamiento: thoughts,
    };
  }
  for (let index = outputs.length - 1; index >= 0; index -= 1) {
    const entry = outputs[index];
    if (!entry || isToolError(entry.output)) continue;
    const output = entry.output;
    if (!output || typeof output !== "object") continue;
    const kind = taggedKind(output, entry.toolName);
    const mensaje = text || stringField(output, "mensaje") || "";

    if (kind === "consulta_analitica" && "analysis" in output) {
      return {
        tipo: "conversacion",
        mensaje: mensaje || stringField(output, "message") || "La consulta terminó, pero no llegó un resumen de los resultados.",
        pasosPensamiento: thoughts,
      };
    }

    if (kind === "venta" && "lineas" in output && Array.isArray(output.lineas) && output.lineas.length > 0) {
      return { tipo: "venta", lineas: output.lineas as LineaInterpretada[], pasosPensamiento: thoughts };
    }
    if (kind === "desambiguacion" && "candidatos" in output && "intento" in output && "texto" in output) {
      return {
        tipo: "desambiguacion",
        texto: String(output.texto),
        candidatos: output.candidatos as Producto[],
        intento: output.intento as IntentoDesambiguacion,
        pasosPensamiento: thoughts,
      };
    }
    if (kind === "registro_producto" && "datos" in output) {
      return {
        tipo: "registro_producto",
        datos: output.datos as RegistroProductoParsed,
        mensaje: mensaje || "Revisá y confirmá el alta del producto.",
        pasosPensamiento: thoughts,
      };
    }
    if (kind === "consulta_stock" && "producto" in output && "desglose" in output) {
      return {
        ...(output as Extract<ResultadoInterpretacion, { tipo: "consulta_stock" }>),
        tipo: "consulta_stock",
        mensaje: mensaje || "Listo.",
        pasosPensamiento: thoughts,
      };
    }
    if (kind === "buscar_producto" && "productos" in output && "consulta" in output) {
      return {
        tipo: "buscar_producto",
        consulta: String(output.consulta),
        productos: output.productos as Extract<ResultadoInterpretacion, { tipo: "buscar_producto" }>["productos"],
        lineas: [],
        mensaje: mensaje || "Listo.",
        pasosPensamiento: thoughts,
      };
    }
    if (kind === "consulta_bajo_stock" && "productos" in output) {
      return {
        tipo: "consulta_bajo_stock",
        filtroSucursal: "filtroSucursal" in output ? (output.filtroSucursal as string | undefined) : undefined,
        productos: output.productos as Extract<ResultadoInterpretacion, { tipo: "consulta_bajo_stock" }>["productos"],
        lineas: [],
        mensaje: mensaje || "Listo.",
        pasosPensamiento: thoughts,
      };
    }
    if (kind === "listar_inventario" && "productos" in output) {
      return {
        tipo: "listar_inventario",
        filtroSucursal: "filtroSucursal" in output ? (output.filtroSucursal as string | undefined) : undefined,
        minStock: "minStock" in output && typeof output.minStock === "number" ? output.minStock : 0,
        productos: output.productos as Extract<ResultadoInterpretacion, { tipo: "listar_inventario" }>["productos"],
        lineas: [],
        mensaje: mensaje || "Listo.",
        pasosPensamiento: thoughts,
      };
    }
    if (kind === "consulta_ventas" && "totalVentas" in output && "cantidadVentas" in output) {
      return {
        tipo: "consulta_ventas",
        filtroSucursal: "filtroSucursal" in output ? (output.filtroSucursal as string | undefined) : undefined,
        totalVentas: Number(output.totalVentas),
        cantidadVentas: Number(output.cantidadVentas),
        periodo: "periodo" in output && (output.periodo === "hoy" || output.periodo === "semana" || output.periodo === "mes" || output.periodo === "dia")
          ? output.periodo
          : "hoy",
        diasAtras: "diasAtras" in output && typeof output.diasAtras === "number" ? output.diasAtras : undefined,
        mensaje: mensaje || "Listo.",
        pasosPensamiento: thoughts,
      };
    }
    if (kind === "consulta_rotacion" && "diasAnalizados" in output && "items" in output) {
      return {
        ...(output as Extract<ResultadoInterpretacion, { tipo: "consulta_rotacion" }>),
        tipo: "consulta_rotacion",
        mensaje: mensaje || "Listo.",
        pasosPensamiento: thoughts,
      };
    }
    if (kind === "consulta_kardex" && "movimientos" in output && "resumen" in output) {
      return {
        ...(output as Extract<ResultadoInterpretacion, { tipo: "consulta_kardex" }>),
        tipo: "consulta_kardex",
        mensaje: mensaje || "Listo.",
        pasosPensamiento: thoughts,
      };
    }
  }

  if (text) {
    return { tipo: "conversacion", mensaje: text, pasosPensamiento: thoughts };
  }
  return {
    tipo: "aclaracion",
    mensaje: "¿En qué te ayudo? Puedo vender, consultar stock, ventas, rotación o movimientos del kardex.",
    pasosPensamiento: thoughts,
  };
}
