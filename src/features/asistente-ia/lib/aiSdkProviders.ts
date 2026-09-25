import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output, wrapLanguageModel, type LanguageModel, type ModelMessage } from "ai";
import { z, type ZodType } from "zod";
import {
  getApiKey,
  getCustomModel,
  getPreferredMode,
  getProviderOrder,
  type ProviderId,
} from "../../../shared/lib/secureKeyStore";
import {
  AI_PROVIDERS,
  describeKeyProviderMismatch,
  resolveProviderModel,
  type AIProviderDefinition,
} from "./aiProviders";
import {
  coerceGenerateToolCallInputs,
  polyfillAbortSignalThrowIfAborted,
  wrapFetchForToolCalls,
} from "./providerFetch";

export const ASSISTANT_CONFIG_MESSAGE =
  "Configurá tu IA en Ajustes. Sin una clave el asistente no interpreta comandos.";

export const ASSISTANT_PROVIDER_ERROR_MESSAGE =
  "No pude contactar a tu proveedor de IA. Revisá la clave, el modelo o el servicio e intentá de nuevo.";

export const ASSISTANT_TIMEOUT_MESSAGE = "La IA tardó demasiado. Intentá de nuevo.";

export type ResolvedAssistantModel = {
  providerId: ProviderId;
  modelId: string;
  model: LanguageModel;
};

async function resolveFetch(): Promise<typeof globalThis.fetch> {
  polyfillAbortSignalThrowIfAborted();
  try {
    const mod = await import("expo/fetch");
    if (mod?.fetch) return wrapFetchForToolCalls(mod.fetch as unknown as typeof globalThis.fetch);
  } catch {
    // Node tests and environments without expo/fetch use global fetch.
  }
  return wrapFetchForToolCalls(globalThis.fetch);
}

function withStringToolInputs(model: LanguageModel): LanguageModel {
  return wrapLanguageModel({
    model,
    middleware: {
      wrapGenerate: async ({ doGenerate }) => coerceGenerateToolCallInputs(await doGenerate()),
    },
  });
}

function createProviderModel(
  providerId: ProviderId,
  apiKey: string,
  modelId: string,
  fetchImpl: typeof globalThis.fetch,
): LanguageModel {
  const provider = AI_PROVIDERS[providerId];
  const model =
    provider.type === "gemini"
      ? createGoogleGenerativeAI({ apiKey, fetch: fetchImpl })(modelId)
      : createOpenAICompatible({
          name: providerId,
          baseURL: provider.baseUrl,
          apiKey,
          fetch: fetchImpl,
          headers:
            providerId === "openrouter"
              ? {
                  "HTTP-Referer": "https://lidemoda.app",
                  "X-Title": "Lidemoda Mobile POS",
                }
              : undefined,
        })(modelId);
  return withStringToolInputs(model);
}

/**
 * Resolves BYOK language models in the same fallback order as SecureStore.
 * Heuristic / offline mode is not a model: callers must show a config message.
 */
export async function listAssistantModels(): Promise<ResolvedAssistantModel[]> {
  const mode = await getPreferredMode();
  if (mode === "heuristic") return [];

  const order = await getProviderOrder();
  const candidateIds: ProviderId[] = mode === "auto" ? order : [mode];
  const fetchImpl = await resolveFetch();
  const models: ResolvedAssistantModel[] = [];

  for (const providerId of candidateIds) {
    const apiKey = await getApiKey(providerId);
    if (!apiKey?.trim()) continue;
    const customModel = await getCustomModel(providerId);
    const modelId = resolveProviderModel(providerId, customModel);
    models.push({
      providerId,
      modelId,
      model: createProviderModel(providerId, apiKey.trim(), modelId, fetchImpl),
    });
  }
  return models;
}

/**
 * Parses provider JSON defensively. Invalid or non-object payloads are rejected so
 * callers can fall back without treating model text as a command.
 */
export function parseAIJSON(rawText: string): unknown | null {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```json") || cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  try {
    const parsed: unknown = JSON.parse(cleaned);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function formatConnectionError(
  provider: AIProviderDefinition,
  model: string,
  error: unknown,
): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/failed to fetch|network request failed/i.test(message)) {
    return `No se pudo contactar a ${provider.name}. Revisá la red o que la clave sea ${provider.keyPlaceholder}.`;
  }
  if (/abort/i.test(message)) {
    return `Timeout al contactar a ${provider.name}.`;
  }
  if (/401|403|unauthorized|invalid.*api.*key/i.test(message)) {
    return `Clave rechazada por ${provider.name}. Revisá que sea una clave ${provider.keyPlaceholder}.`;
  }
  if (/404|not found|decommissioned|does not exist/i.test(message)) {
    const fallback = provider.defaultModel === model
      ? (provider.recommendedModels.find((candidate) => candidate !== model) || "un modelo activo")
      : provider.defaultModel;
    return `El modelo ${model} ya no está disponible en ${provider.name}. Usá ${fallback} en Ajustes.`;
  }
  return message;
}

const CONNECTION_TEST_SCHEMA = z.object({
  status: z.string(),
  echo: z.string().optional(),
});

export async function testProviderConnection(
  providerId: ProviderId,
  apiKey: string,
  customModel?: string | null,
): Promise<{ ok: boolean; error?: string; modelUsed?: string }> {
  const provider = AI_PROVIDERS[providerId];
  if (!provider) {
    return { ok: false, error: `Proveedor desconocido: ${providerId}` };
  }

  const keyMismatch = describeKeyProviderMismatch(providerId, apiKey);
  if (keyMismatch) {
    return { ok: false, error: keyMismatch };
  }

  const modelToUse = resolveProviderModel(providerId, customModel);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    const fetchImpl = await resolveFetch();
    const model = createProviderModel(providerId, apiKey.trim(), modelToUse, fetchImpl);
    const result = await generateText({
      model,
      instructions: "Eres un evaluador de conectividad. Responde en formato JSON.",
      messages: [{ role: "user", content: 'Devuelve exactamente: {"status":"ok","echo":"test"}' }],
      output: Output.object({ schema: CONNECTION_TEST_SCHEMA }),
      abortSignal: controller.signal,
      maxRetries: 0,
    });
    const parsed = CONNECTION_TEST_SCHEMA.safeParse(result.output);
    if (!parsed.success) {
      return {
        ok: false,
        error: "La respuesta del modelo no siguió el formato esperado.",
        modelUsed: modelToUse,
      };
    }
    return { ok: true, modelUsed: modelToUse };
  } catch (error) {
    return {
      ok: false,
      error: formatConnectionError(provider, modelToUse, error),
      modelUsed: modelToUse,
    };
  } finally {
    clearTimeout(timer);
  }
}

export type StructuredGenerationOptions<T> = {
  schema: ZodType<T>;
  instructions: string;
  messages: ModelMessage[];
  timeoutMs?: number;
};

/**
 * Runs Output.object across BYOK models in fallback order. Does not interpret locally.
 */
export async function generateStructuredOutput<T>(options: StructuredGenerationOptions<T>): Promise<T> {
  const models = await listAssistantModels();
  if (models.length === 0) {
    throw new Error(ASSISTANT_CONFIG_MESSAGE);
  }

  let lastError: unknown;
  for (const resolved of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
    try {
      const result = await generateText({
        model: resolved.model,
        instructions: options.instructions,
        messages: options.messages,
        output: Output.object({ schema: options.schema }),
        abortSignal: controller.signal,
      });
      const parsed = options.schema.safeParse(result.output);
      if (parsed.success) return parsed.data;
      lastError = new Error("structured_output_invalid");
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : "";
  throw new Error(detail.includes("abort") ? ASSISTANT_TIMEOUT_MESSAGE : ASSISTANT_PROVIDER_ERROR_MESSAGE);
}
