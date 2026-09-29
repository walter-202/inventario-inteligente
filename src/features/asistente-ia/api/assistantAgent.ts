import { isStepCount, ToolLoopAgent, tool, type ModelMessage, type ToolSet } from "ai";
import type { AssistantScopeContext } from "../lib/assistantAuthorization";
import {
  ASSISTANT_CONFIG_MESSAGE,
  ASSISTANT_PROVIDER_ERROR_MESSAGE,
  ASSISTANT_TIMEOUT_MESSAGE,
  listAssistantModels,
  type ResolvedAssistantModel,
} from "../lib/aiSdkProviders";
import {
  createAssistantToolExecutors,
  mapToolOutputsToResult,
  type AssistantToolContext,
} from "../lib/assistantTools";
import type { AssistantReadApi, ResultadoInterpretacion } from "./voiceCommandApi";
import { normalizarMonedaAsistente } from "../../../shared/lib/utils";

export const BARCODE_SCAN_PREFIX = "Código de barras escaneado:";

export function extractScannedBarcode(texts: string[]): string | null {
  const patterns = [
    /c[oó]digo de barras escaneado:\s*([0-9]{8,14})/i,
    /consultar stock de\s+([0-9]{8,14})/i,
  ];
  for (let index = texts.length - 1; index >= 0; index -= 1) {
    const text = texts[index] ?? "";
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1];
    }
  }
  return null;
}

export function scannedBarcodeMessage(code: string): string {
  return `${BARCODE_SCAN_PREFIX} ${code.trim()}`;
}

export function buildAssistantInstructions(scope: AssistantScopeContext): string {
  const sucursales = scope.allowedBranchNames.length
    ? scope.allowedBranchNames.join(", ")
    : "ninguna";
  const today = new Intl.DateTimeFormat("es-BO", {
    dateStyle: "long",
    timeZone: "America/La_Paz",
  }).format(new Date());
  return [
    "Sos el asistente de Lidemoda, un punto de venta de moda.",
    "Respondé en español natural de Bolivia, con claridad y en el nivel de detalle que pida la persona.",
    `La fecha local de negocio es ${today} (America/La_Paz). Interpretá con ella expresiones relativas como hoy, ayer, esta semana o este mes.`,
    "Consultá datos reales antes de afirmar cifras. Sintetizá los resultados de Supabase y aclará el rango, sucursal y métrica; nunca inventes productos, precios, stock, ventas ni sucursales.",
    "Para una pregunta analítica, definí qué dato se consulta, el rango de fechas, la sucursal, la métrica y la agrupación. Usa analyze_sales para ventas por día, producto, categoría, medio de pago o sucursal (el desglose entre sucursales solo está habilitado para administradores), además de comparaciones y tendencias. Usa analyze_inventory para stock por producto, categoría o sucursal y alertas de mínimo. Estas tools ejecutan consultas agregadas y parametrizadas en PostgreSQL; no propongas ni inventes SQL.",
    "Al buscar productos, interpreta el concepto que describe la persona y tradúcelo a palabras que sí podrían figurar en el catálogo: por ejemplo 'algo abrigado para el frío' puede buscar suéter, chompa o chaqueta. Conserva también las palabras originales y usa hasta 4 alternativas pertinentes entre sinónimos regionales, materiales o tipos de prenda probables, plural/singular y errores de escritura. No inventes atributos que el catálogo no almacena. Nunca reemplaces un SKU o código de barras con sinónimos. En filtros de producto de analyze_sales y analyze_inventory, pasa el nombre original en producto y, si aplica, alternativas_producto: la tool lo resuelve al producto canónico antes de consultar; si hay varios posibles, informa cuáles y pide acotar. Si la persona pide una categoría, usa el filtro de categoría.",
    "Si la pregunta contiene varias condiciones, cubrilas en la consulta y explica el criterio usado. Si falta un detalle menor, usa un valor razonable y dilo; pide aclaración solo cuando cambie materialmente la respuesta.",
    "Si piden comparar dos productos y el filtro admite uno solo, consulta cada producto por separado con el mismo rango y sucursal, y luego compara resultados equivalentes. Para comparar categorías, usa una agrupación por categoría cuando sea posible. No sumes ni mezcles los resultados de productos distintos.",
    "Al combinar resultados de varias tools, compara períodos y sucursales equivalentes. Distingue ventas netas, detalle de productos y valor referencial a precio de catálogo; ese valor no es costo de compra ni margen.",
    "Para consultas difíciles trabaja en etapas: identifica la pregunta de negocio y sus criterios, ejecuta las consultas mínimas que cubren todos los criterios y revisa que los resultados comparados compartan rango, sucursal y métrica. Si falta un dato, consulta otra dimensión compatible antes de concluir. No hagas una llamada aislada si la pregunta pide comparar productos, explicar una variación o relacionar ventas con inventario.",
    "En la respuesta final no uses frases vacías como 'listo' o 'aquí tienes'. Empieza con la respuesta directa; luego cita de 2 a 4 cifras o filas que la sostienen; explica qué cambió o qué patrón aparece; termina con una acción concreta solo cuando los datos la respalden. Di el rango y la sucursal. Separa hechos de interpretación, marca cuando una explicación sea una hipótesis y reconoce si los datos no alcanzan para responder.",
    "No reveles razonamiento interno paso a paso. Puedes resumir el método de consulta y mostrar los datos, supuestos y cálculos que justifican la conclusión.",
    "La moneda es boliviano (Bs.). Al mencionar precios escribí siempre Bs. (ej. Bs. 35,00). Nunca uses $, USD ni dólares.",
    "Para vender, llamá propose_sale con cada producto que dijo el usuario (el nombre aproximado vale: 'sombra para cejas delicadas', 'adhesivo de pestañas'), alternativas regionales solo si corresponden y la cantidad. Si ya hay un carrito armado, los productos nuevos se suman al mismo carrito.",
    "Si el usuario pide agregar otro producto a la venta en curso, llamá propose_sale otra vez con el producto adicional; no reinicies la venta.",
    "propose_sale y propose_product_registration NO registran nada: solo arman una propuesta para confirmación en pantalla.",
    "Para una cifra sencilla de ventas usá get_sales_summary con periodo 'hoy', 'semana' (últimos 7 días), 'mes' (mes calendario) o 'dia' con dias_atras (1=ayer, 3=hace 3 días). Para desgloses o comparaciones usá analyze_sales.",
    "Para rotación, prendas estrella o capital inmovilizado usá get_rotation_analysis (15/30/60/90 días).",
    "Para historial de entradas, salidas o kardex usá get_kardex. Si nombran un producto, pasá query y alternativas cuando el vocabulario regional difiera del catálogo.",
    "El stock es el actual (no histórico). Si piden 'stock de la semana' probablemente quieren ventas → get_sales_summary; si quieren inventario actual → list_inventory o get_stock.",
    `Sucursal activa: ${scope.activeBranchName ?? "ninguna"}.`,
    `Sucursales habilitadas: ${sucursales}.`,
    "Si propose_sale o search_products devuelven candidatos, no preguntes el SKU: la app muestra el selector. Solo pedí un nombre más claro si la tool no encontró nada.",
    "Si el usuario corrige una cantidad (por ejemplo \"sino 5\"), usá el producto del historial.",
    "Si el historial trae \"Código de barras escaneado: <ean>\", ese EAN es codigo_barra. Usalo al registrar o al buscar; no lo pidas de nuevo si el usuario dice que ya te lo pasó.",
    "Si piden una lista de productos u ordenamiento de existencias, usá list_inventory con orden='asc' (menor stock primero) u orden='desc' (mayor stock primero); list_low_stock es solo para productos que requieren reposición.",
    "Si piden dictar la lista, menciona en el texto los primeros 3 a 5 productos con cantidad y avisa que el resto aparece en pantalla. En otras consultas de lista, resume el total y criterio; la app muestra el detalle.",
  ].join("\n");
}

export function toModelMessages(
  history: Array<{ role: "usuario" | "asistente"; texto: string }>,
): ModelMessage[] {
  return history
    .filter((message) => message.texto.trim().length > 0)
    .map((message) => ({
      role: message.role === "usuario" ? "user" : "assistant",
      content: message.texto,
    }));
}

function toolOutputsFromResult(result: {
  toolResults?: Array<{ toolName?: string; output?: unknown }>;
  steps?: Array<{ toolResults?: Array<{ toolName?: string; output?: unknown }> }>;
}): Array<{ toolName: string; output: unknown }> {
  const fromTop = (result.toolResults ?? [])
    .filter((entry) => entry.toolName)
    .map((entry) => ({ toolName: entry.toolName as string, output: entry.output }));
  if (fromTop.length > 0) return fromTop;
  const fromSteps: Array<{ toolName: string; output: unknown }> = [];
  for (const step of result.steps ?? []) {
    for (const entry of step.toolResults ?? []) {
      if (entry.toolName) fromSteps.push({ toolName: entry.toolName, output: entry.output });
    }
  }
  return fromSteps.length > 0 ? fromSteps : fromTop;
}

function activitiesFromResult(
  providerLabel: string,
  outputs: Array<{ toolName: string }>,
  stepCount: number,
): string[] {
  const activities = [`Proveedor: ${providerLabel}`];
  if (stepCount > 0) activities.push(`Se completaron ${stepCount} pasos del agente`);
  for (const output of outputs) activities.push(toolProgressLabel(output.toolName));
  return activities;
}

const TOOL_PROGRESS_LABEL: Record<string, string> = {
  search_products: "Buscando productos en el catálogo",
  get_stock: "Consultando stock del producto",
  list_low_stock: "Buscando productos con stock bajo",
  list_inventory: "Consultando el inventario de la sucursal",
  get_sales_summary: "Consultando ventas",
  analyze_sales: "Analizando ventas en Supabase",
  analyze_inventory: "Analizando inventario en Supabase",
  get_rotation_analysis: "Analizando rotación de productos",
  get_kardex: "Consultando movimientos del kardex",
  propose_sale: "Preparando la propuesta de venta",
  propose_product_registration: "Armando el alta del producto",
};

function toolProgressLabel(name: string): string {
  return TOOL_PROGRESS_LABEL[name] ?? `Ejecutando ${name}`;
}

async function awaitMaybe<T>(value: PromiseLike<T> | T | undefined, fallback: T): Promise<T> {
  if (value == null) return fallback;
  try {
    return await value;
  } catch {
    return fallback;
  }
}

export type AssistantTurnProgress = {
  text: string;
  thoughts: string[];
};

export type RunAssistantTurnInput = {
  text: string;
  history: Array<{ role: "usuario" | "asistente"; texto: string }>;
  scope: AssistantScopeContext;
  readApi?: AssistantReadApi;
  onProgress?: (progress: AssistantTurnProgress) => void;
  abortSignal?: AbortSignal;
};

type AssistantTools = ToolSet;

type TurnCallInput = {
  resolved: ResolvedAssistantModel;
  instructions: string;
  messages: ModelMessage[];
  tools: AssistantTools;
  abortSignal: AbortSignal;
  maxSteps: number;
  onProgress?: (progress: AssistantTurnProgress) => void;
  onFailure?: (error: unknown) => void;
};

function hasUsableTurn(text: string, outputs: Array<{ toolName: string }>): boolean {
  return text.trim().length > 0 || outputs.length > 0;
}

export function isAssistantAbortError(error: unknown): boolean {
  if (error == null) return false;
  if (typeof error === "object" && "name" in error && (error as { name?: string }).name === "AbortError") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /abort|timed out|timeout/i.test(message);
}

export function isAssistantNoOutputError(error: unknown): boolean {
  if (error == null) return false;
  if (typeof error === "object" && "name" in error && (error as { name?: string }).name === "AI_NoOutputGeneratedError") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /no output generated/i.test(message);
}

export function assistantUserFacingError(error: unknown): string {
  if (isAssistantAbortError(error)) return ASSISTANT_TIMEOUT_MESSAGE;
  return ASSISTANT_PROVIDER_ERROR_MESSAGE;
}

export function isRetryableAssistantResult(result: ResultadoInterpretacion): boolean {
  return result.tipo === "aclaracion" && result.retryable === true;
}

export type AssistantRequestBudget = { maxSteps: number; timeoutMs: number; totalTimeoutMs: number };

const COMPLEX_REQUEST_PATTERN = /\b(compara|comparar|comparaci[oó]n|variaci[oó]n|diferencia|tendencia|evoluci[oó]n|creci[oó]|disminu|cayer|vendid|an[aá]lisis|analiza|desglos|rentabilidad|margen|rotaci[oó]n|reposici[oó]n|reponer|desabastecimiento|sobreinventario|estancad|por categor[ií]a|por producto|por sucursal|entre .+ y .+|contra|frente al mes|quiebre|anomal[ií]a|predic|mejores productos|m[aá]s vendidos)\b/i;

export function assistantRequestBudget(text: string): AssistantRequestBudget {
  const complex = text.trim().length >= 140
    || COMPLEX_REQUEST_PATTERN.test(text)
    || (text.match(/\b(y|adem[aá]s|tambi[eé]n)\b/gi)?.length ?? 0) >= 2;
  return complex
    ? { maxSteps: 12, timeoutMs: 90_000, totalTimeoutMs: 120_000 }
    : { maxSteps: 6, timeoutMs: 30_000, totalTimeoutMs: 45_000 };
}

function startTimeout(ms: number, parentSignal?: AbortSignal): { controller: AbortController; cancel: () => void } {
  const controller = new AbortController();
  const abortFromParent = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = controller.signal.aborted ? undefined : setTimeout(() => {
    try {
      // Do not pass an Error as abort reason: Hermes treats it as an uncaught exception.
      controller.abort();
    } catch {
      /* never throw from the timer */
    }
  }, ms);
  return {
    controller,
    cancel: () => {
      if (timer !== undefined) clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

async function completeTurnWithStream(input: TurnCallInput): Promise<ResultadoInterpretacion | null> {
  try {
    if (input.abortSignal.aborted) return null;
    const label = `${input.resolved.providerId} · ${input.resolved.modelId}`;
    input.onProgress?.({ text: "", thoughts: [`Proveedor: ${label}`, "Conectando con el proveedor…"] });

    const agent = new ToolLoopAgent({
      model: input.resolved.model,
      instructions: input.instructions,
      tools: input.tools,
      stopWhen: isStepCount(input.maxSteps),
      reasoning: input.maxSteps > 6 ? "high" : "medium",
      providerOptions: input.resolved.providerId === "groq" && /openai\/gpt-oss-(20|120)b/i.test(input.resolved.modelId)
        ? { groq: { reasoningEffort: input.maxSteps > 6 ? "high" : "medium" } }
        : input.resolved.providerId === "cerebras" && /gpt-oss-120b/i.test(input.resolved.modelId)
          ? { cerebras: { reasoningEffort: input.maxSteps > 6 ? "high" : "medium" } }
          : undefined,
      maxRetries: 0,
    });
    let streamedText = "";
    const result = await agent.stream({
      messages: input.messages,
      abortSignal: input.abortSignal,
      onStepStart: ({ stepNumber }) => {
        input.onProgress?.({
          text: streamedText,
          thoughts: [`Proveedor: ${label}`, `Preparando la consulta · paso ${stepNumber + 1} de ${input.maxSteps}`],
        });
      },
    });

    let streamFailed = false;
    let streamError: unknown;
    try {
      for await (const chunk of result.textStream) {
        streamedText += chunk;
        input.onProgress?.({
          text: normalizarMonedaAsistente(streamedText),
          thoughts: [`Proveedor: ${label}`, streamedText.trim() ? "Redactando la respuesta…" : "Consultando y relacionando datos…"],
        });
      }
    } catch (error) {
      streamFailed = true;
      streamError = error;
    }

    const text = normalizarMonedaAsistente((await awaitMaybe(result.text, streamedText)) || streamedText);
    const toolResults = await awaitMaybe(result.toolResults, []);
    const steps = await awaitMaybe(result.steps, []);
    await awaitMaybe(result.finishReason, undefined);
    const outputs = toolOutputsFromResult({ toolResults, steps });
    if (input.abortSignal.aborted) {
      const cancelledError = new Error("Request cancelled");
      cancelledError.name = "AbortError";
      input.onFailure?.(cancelledError);
      return null;
    }
    // Do not replay a partial or failed request through a second generation call.
    if (outputs.length === 0 && (streamFailed || !hasUsableTurn(text, outputs))) {
      if (streamFailed) {
        input.onFailure?.(streamError);
      }
      return null;
    }

    const thoughts = activitiesFromResult(`${label} · agente`, outputs, steps.length);
    input.onProgress?.({ text, thoughts });
    return mapToolOutputsToResult(outputs, text, thoughts);
  } catch (error) {
    input.onFailure?.(error);
    return null;
  }
}

export async function runAssistantTurn(input: RunAssistantTurnInput): Promise<ResultadoInterpretacion> {
  const phrase = input.text.trim();
  if (!phrase) {
    return {
      tipo: "aclaracion",
      mensaje: "Escribí o dictá la operación que querés hacer.",
      pasosPensamiento: ["Mensaje vacío"],
    };
  }

  const models = await listAssistantModels();
  if (models.length === 0) {
    return {
      tipo: "aclaracion",
      mensaje: ASSISTANT_CONFIG_MESSAGE,
      pasosPensamiento: ["Sin clave de IA configurada"],
      retryable: true,
    };
  }

  const executors = createAssistantToolExecutors({
    scope: input.scope,
    readApi: input.readApi,
  } satisfies AssistantToolContext);
  let latestText = "";
  const report = (thoughts: string[], text = latestText) => {
    latestText = text;
    input.onProgress?.({ text: latestText, thoughts });
  };
  const tools = Object.fromEntries(
    Object.entries(executors).map(([name, definition]) => [
      name,
      tool({
        description: definition.description,
        inputSchema: definition.inputSchema,
        execute: async (toolInput) => {
          report([toolProgressLabel(name), "Sigue trabajando…"]);
          const output = await definition.execute(toolInput);
          report([`${toolProgressLabel(name)} · listo`, "Armando la respuesta…"]);
          return output;
        },
      }),
    ]),
  ) as AssistantTools;

  const instructions = buildAssistantInstructions(input.scope);
  const barcode = extractScannedBarcode([...input.history.map((message) => message.texto), phrase]);
  const instructionsWithBarcode = barcode
    ? `${instructions}\nCódigo de barras reciente en esta conversación: ${barcode}. Si el usuario registra un producto, pasalo en codigo_barra.`
    : instructions;
  const messages: ModelMessage[] = [...toModelMessages(input.history), { role: "user", content: phrase }];
  const budget = assistantRequestBudget(phrase);
  const turnDeadline = Date.now() + budget.totalTimeoutMs;
  let lastError: unknown;

  for (const resolved of models) {
    const remainingMs = turnDeadline - Date.now();
    if (remainingMs <= 0) {
      const timeoutError = new Error("Request timed out");
      timeoutError.name = "AbortError";
      lastError = timeoutError;
      break;
    }
    if (input.abortSignal?.aborted) {
      const cancelledError = new Error("Request cancelled");
      cancelledError.name = "AbortError";
      lastError = cancelledError;
      break;
    }
    const callBase = {
      resolved,
      instructions: instructionsWithBarcode,
      messages,
      tools,
      maxSteps: budget.maxSteps,
      onProgress: (progress: AssistantTurnProgress) => {
        latestText = progress.text;
        input.onProgress?.(progress);
      },
      onFailure: (error: unknown) => {
        lastError = error;
      },
    };
    const streamAttempt = startTimeout(Math.min(budget.timeoutMs, remainingMs), input.abortSignal);
    try {
      const streamed = await completeTurnWithStream({ ...callBase, abortSignal: streamAttempt.controller.signal });
      if (streamed) return streamed;
    } catch (streamError) {
      lastError = streamError;
    } finally {
      streamAttempt.cancel();
    }
    if (input.abortSignal?.aborted) break;
  }

  return {
    tipo: "aclaracion",
    mensaje: assistantUserFacingError(lastError),
    pasosPensamiento: ["No se pudo completar la consulta con los proveedores configurados"],
    retryable: true,
  };
}
