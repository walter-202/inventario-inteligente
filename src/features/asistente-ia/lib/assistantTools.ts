import { z } from "zod";
import type { Ability } from "../../auth/lib/permissions";
import type { Producto } from "../../../shared/types/domain";
import { normalizarMonedaAsistente } from "../../../shared/lib/utils";
import type { AssistantScopeContext } from "./assistantAuthorization";
import type { IntentoDesambiguacion } from "./chatSession";
import {
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
  get_sales_today: "sales.read",
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
        "Lista productos con stock bajo. Usala para 'qué está por agotarse'. NO la uses para un producto puntual (get_stock) ni para listar todo el inventario.",
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
        "Lista el inventario de la sucursal (opcionalmente con umbral mínimo de unidades). Usala para 'qué productos tenemos' o 'productos con más de 10 unidades'. orden=asc menor a mayor, orden=desc mayor a menor (por defecto desc). NO la uses si el usuario nombra un producto concreto (get_stock / search_products).",
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
    get_sales_today: {
      description:
        "Resumen de ventas SOLO de hoy. No existe periodo semana ni mes. Usala para 'cuánto se vendió hoy'. Si mencionan otra sucursal, pasala; si no, usá la sucursal activa.",
      inputSchema: z.object({
        sucursal: z.string().trim().min(1).nullable().optional(),
      }),
      execute: async ({ sucursal }) => {
        const branch = await resolveScopedBranch(sucursal, readApi, scope);
        if (branch.kind === "unknown") return unknownBranch(branch.solicitada);
        const metrics = await readApi.getTodaySales(branch.branchId);
        const filtroSucursal = branch.branchName;
        const sucursalText = filtroSucursal ? `en ${filtroSucursal}` : "en la sucursal activa";
        return {
          kind: "consulta_ventas",
          filtroSucursal,
          totalVentas: metrics.totalSales,
          cantidadVentas: metrics.salesCount,
          periodo: "hoy" as const,
          mensaje: `Ventas de hoy ${sucursalText}: Bs. ${metrics.totalSales.toFixed(2)} (${metrics.salesCount} transacción${metrics.salesCount === 1 ? "" : "es"}).`,
        };
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
        periodo: "hoy",
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
    mensaje: "¿En qué te ayudo? Puedo vender, consultar stock o las ventas de hoy.",
    pasosPensamiento: thoughts,
  };
}
