import { z } from "zod";
import type { Ability } from "../../auth/lib/permissions";
import type { Producto } from "../../../shared/types/domain";
import { normalizarMonedaAsistente } from "../../../shared/lib/utils";
import type { AssistantScopeContext } from "./assistantAuthorization";
import type { IntentoDesambiguacion } from "./chatSession";
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

export function createAssistantToolExecutors(ctx: AssistantToolContext): Record<string, AssistantToolDefinition> {
  const readApi = ctx.readApi ?? defaultAssistantReadApi;
  const scope = ctx.scope;
  const all: Record<AssistantToolName, AssistantToolDefinition> = {
    search_products: {
      description:
        "Busca productos del catálogo por nombre aproximado, categoría o SKU. Usala cuando el usuario pregunta qué hay o no hay coincidencia. NO la uses para vender (usá propose_sale) ni para stock de un producto ya identificado (usá get_stock). Podés pasar el nombre que dijo el usuario; la búsqueda tolera plurales y de/para.",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe("Nombre (aunque sea aproximado), categoría o SKU."),
      }),
      execute: async ({ query }) => {
        const productos = await searchProductsWithVariants(query, readApi, 12);
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
        sucursal: z.string().trim().min(1).nullable().optional().describe("Sucursal mencionada, o null"),
      }),
      execute: async ({ query, sucursal }) => {
        const branch = await resolveScopedBranch(sucursal, readApi, scope);
        if (branch.kind === "unknown") return unknownBranch(branch.solicitada);
        const coincidencia = await resolverCoincidencia(query, readApi);
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
        sucursal: z.string().trim().min(1).nullable().optional(),
        tipo: z.enum(["entrada", "salida", "todas"]).nullable().optional(),
        limite: z.number().int().min(1).max(50).nullable().optional(),
      }),
      execute: async ({ query, sucursal, tipo, limite }) => {
        const branch = await resolveScopedBranch(sucursal, readApi, scope);
        if (branch.kind === "unknown") return unknownBranch(branch.solicitada);
        const tipoMovimiento = tipo ?? "todas";
        const maxRows = limite ?? 15;
        const trimmedQuery = query?.trim();

        if (trimmedQuery) {
          const coincidencia = await resolverCoincidencia(trimmedQuery, readApi);
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
              cantidad: z.number().int().positive(),
            }),
          )
          .min(1),
      }),
      execute: async ({ items }) => {
        const lineas: LineaInterpretada[] = [];
        for (const item of items) {
          const coincidencia = await resolverCoincidencia(item.query, readApi);
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
  for (let index = outputs.length - 1; index >= 0; index -= 1) {
    const entry = outputs[index];
    if (!entry || isToolError(entry.output)) continue;
    const output = entry.output;
    if (!output || typeof output !== "object") continue;
    const kind = taggedKind(output, entry.toolName);
    const mensaje = text || stringField(output, "mensaje") || "";

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
