import { isStepCount, streamText, tool, type ModelMessage } from "ai";
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
  return [
    "Sos el asistente de Lidemoda, un punto de venta de moda.",
    "Respondé en español rioplatense, breve y natural.",
    "Usá las tools para consultar datos reales. No inventes productos, precios, stock ni sucursales.",
    "La moneda es boliviano (Bs.). Al mencionar precios escribí siempre Bs. (ej. Bs. 35,00). Nunca uses $, USD ni dólares.",
    "Para vender, llamá propose_sale con cada producto que dijo el usuario (el nombre aproximado vale: 'sombra para cejas delicadas', 'adhesivo de pestañas') y la cantidad. No pidas SKU ni el nombre exacto antes de buscar.",
    "propose_sale y propose_product_registration NO registran nada: solo arman una propuesta para confirmación en pantalla.",
    'Las ventas consultables son solo del día de hoy. El periodo es "hoy"; no hay semana ni mes.',
    `Sucursal activa: ${scope.activeBranchName ?? "ninguna"}.`,
    `Sucursales habilitadas: ${sucursales}.`,
    "Si propose_sale o search_products devuelven candidatos, no preguntes el SKU: la app muestra el selector. Solo pedí un nombre más claro si la tool no encontró nada.",
    "Si el usuario corrige una cantidad (por ejemplo \"sino 5\"), usá el producto del historial.",
    "Si el historial trae \"Código de barras escaneado: <ean>\", ese EAN es codigo_barra. Usalo al registrar o al buscar; no lo pidas de nuevo si el usuario dice que ya te lo pasó.",
    "Si el usuario pide listar, dictar u ordenar productos ('díctame de menor a mayor', 'de menor a mayor', 'de mayor a menor', 'qué productos hay'), llamá SIEMPRE list_inventory con orden='asc' (menor a mayor stock) o orden='desc' (mayor a menor stock). NUNCA llames list_low_stock para ordenar de menor a mayor.",
    "Si el usuario pide que le dictes o menciones los productos (ej. 'díctame de menor a mayor'): enumerá en tu texto los primeros 3 a 5 productos con su stock ordenado (ej. '1) Nombre: X u., 2) Nombre: Y u...') y aclará que la lista completa está abajo en pantalla.",
    "Si no pidieron dictar, no enumeres todos los ítems: la app los muestra en una tarjeta. Respondé en 1 o 2 frases: cuántos hay, sucursal y el criterio de orden.",
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
  return fromSteps;
}

function thoughtsFromResult(
  providerLabel: string,
  outputs: Array<{ toolName: string }>,
): string[] {
  const thoughts = [`Proveedor: ${providerLabel}`];
  for (const output of outputs) thoughts.push(`Tool: ${output.toolName}`);
  return thoughts;
}

const TOOL_PROGRESS_LABEL: Record<string, string> = {
  search_products: "Buscando productos en el catálogo",
  get_stock: "Consultando stock del producto",
  list_low_stock: "Buscando productos con stock bajo",
  list_inventory: "Consultando el inventario de la sucursal",
  get_sales_today: "Consultando las ventas de hoy",
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

type AssistantTools = NonNullable<Parameters<typeof streamText>[0]["tools"]>;

type TurnCallInput = {
  resolved: ResolvedAssistantModel;
  instructions: string;
  messages: ModelMessage[];
  tools: AssistantTools;
  abortSignal: AbortSignal;
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

const STREAM_TIMEOUT_MS = 20_000;
const TURN_STEP_LIMIT = 4;

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

    const result = streamText({
      model: input.resolved.model,
      instructions: input.instructions,
      messages: input.messages,
      tools: input.tools,
      stopWhen: isStepCount(TURN_STEP_LIMIT),
      abortSignal: input.abortSignal,
      maxRetries: 0,
      onError: () => undefined,
    });

    let streamed = "";
    let streamFailed = false;
    let streamError: unknown;
    try {
      for await (const chunk of result.textStream) {
        streamed += chunk;
        input.onProgress?.({
          text: normalizarMonedaAsistente(streamed),
          thoughts: [`Proveedor: ${label}`, streamed.trim() ? "Sigue escribiendo la respuesta…" : "Sigue trabajando…"],
        });
      }
    } catch (error) {
      streamFailed = true;
      streamError = error;
    }

    const text = normalizarMonedaAsistente((await awaitMaybe(result.text, streamed)) || streamed);
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

    const thoughts = thoughtsFromResult(`${label} · stream`, outputs);
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
  let lastError: unknown;

  for (const resolved of models) {
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
      onProgress: (progress: AssistantTurnProgress) => {
        latestText = progress.text;
        input.onProgress?.(progress);
      },
      onFailure: (error: unknown) => {
        lastError = error;
      },
    };
    const streamAttempt = startTimeout(STREAM_TIMEOUT_MS, input.abortSignal);
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
