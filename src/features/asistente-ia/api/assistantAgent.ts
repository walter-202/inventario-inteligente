import { generateText, isStepCount, streamText, tool, type ModelMessage } from "ai";
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

export function buildAssistantInstructions(scope: AssistantScopeContext): string {
  const sucursales = scope.allowedBranchNames.length
    ? scope.allowedBranchNames.join(", ")
    : "ninguna";
  return [
    "Sos el asistente de Lidemoda, un punto de venta de moda.",
    "Respondé en español rioplatense, breve y natural.",
    "Usá las tools para consultar datos reales. No inventes productos, precios, stock ni sucursales.",
    "Para vender, llamá propose_sale con un query corto (nombre o SKU) y la cantidad. Nunca uses la frase completa del usuario como nombre de producto.",
    "propose_sale y propose_product_registration NO registran nada: solo arman una propuesta para confirmación en pantalla.",
    'Las ventas consultables son solo del día de hoy. El periodo es "hoy"; no hay semana ni mes.',
    `Sucursal activa: ${scope.activeBranchName ?? "ninguna"}.`,
    `Sucursales habilitadas: ${sucursales}.`,
    "Si falta un dato, preguntá. Si hay varias coincidencias, pedí SKU.",
    "Si el usuario corrige una cantidad (por ejemplo \"sino 5\"), usá el producto del historial.",
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

async function awaitMaybe<T>(value: PromiseLike<T> | T | undefined, fallback: T): Promise<T> {
  if (value == null) return fallback;
  return await value;
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
};

type AssistantTools = NonNullable<Parameters<typeof streamText>[0]["tools"]>;

type TurnCallInput = {
  resolved: ResolvedAssistantModel;
  instructions: string;
  messages: ModelMessage[];
  tools: AssistantTools;
  abortSignal: AbortSignal;
  onProgress?: (progress: AssistantTurnProgress) => void;
};

function hasUsableTurn(text: string, outputs: Array<{ toolName: string }>): boolean {
  return text.trim().length > 0 || outputs.length > 0;
}

async function completeTurnWithStream(input: TurnCallInput): Promise<ResultadoInterpretacion | null> {
  const label = `${input.resolved.providerId} · ${input.resolved.modelId}`;
  input.onProgress?.({ text: "", thoughts: [`Proveedor: ${label}`, "Streaming…"] });

  const result = streamText({
    model: input.resolved.model,
    instructions: input.instructions,
    messages: input.messages,
    tools: input.tools,
    stopWhen: isStepCount(5),
    abortSignal: input.abortSignal,
  });

  let streamed = "";
  for await (const chunk of result.textStream) {
    streamed += chunk;
    input.onProgress?.({
      text: streamed,
      thoughts: [`Proveedor: ${label}`, "Streaming respuesta"],
    });
  }

  const text = (await awaitMaybe(result.text, streamed)) || streamed;
  const toolResults = await awaitMaybe(result.toolResults, []);
  const steps = await awaitMaybe(result.steps, []);
  const outputs = toolOutputsFromResult({ toolResults, steps });
  if (!hasUsableTurn(text, outputs)) return null;

  const thoughts = thoughtsFromResult(`${label} · stream`, outputs);
  input.onProgress?.({ text, thoughts });
  return mapToolOutputsToResult(outputs, text, thoughts);
}

async function completeTurnWithGenerate(input: TurnCallInput): Promise<ResultadoInterpretacion> {
  const label = `${input.resolved.providerId} · ${input.resolved.modelId}`;
  input.onProgress?.({ text: "", thoughts: [`Proveedor: ${label}`, "Generando respuesta"] });
  const result = await generateText({
    model: input.resolved.model,
    instructions: input.instructions,
    messages: input.messages,
    tools: input.tools,
    stopWhen: isStepCount(5),
    abortSignal: input.abortSignal,
  });
  const outputs = toolOutputsFromResult(result);
  const thoughts = thoughtsFromResult(`${label} · generateText`, outputs);
  return mapToolOutputsToResult(outputs, result.text, thoughts);
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
    };
  }

  const executors = createAssistantToolExecutors({
    scope: input.scope,
    readApi: input.readApi,
  } satisfies AssistantToolContext);
  const tools = Object.fromEntries(
    Object.entries(executors).map(([name, definition]) => [
      name,
      tool({
        description: definition.description,
        inputSchema: definition.inputSchema,
        execute: definition.execute,
      }),
    ]),
  ) as AssistantTools;

  const instructions = buildAssistantInstructions(input.scope);
  const messages: ModelMessage[] = [...toModelMessages(input.history), { role: "user", content: phrase }];
  let lastError: unknown;

  for (const resolved of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    const call = {
      resolved,
      instructions,
      messages,
      tools,
      abortSignal: controller.signal,
      onProgress: input.onProgress,
    };
    try {
      try {
        const streamed = await completeTurnWithStream(call);
        if (streamed) return streamed;
      } catch (streamError) {
        lastError = streamError;
        if (controller.signal.aborted) continue;
      }
      return await completeTurnWithGenerate(call);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : "";
  return {
    tipo: "aclaracion",
    mensaje: detail.includes("abort") ? ASSISTANT_TIMEOUT_MESSAGE : ASSISTANT_PROVIDER_ERROR_MESSAGE,
    pasosPensamiento: ["Todos los proveedores configurados fallaron"],
  };
}
