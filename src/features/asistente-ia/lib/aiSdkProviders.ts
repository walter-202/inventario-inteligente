import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output, type LanguageModel, type ModelMessage } from "ai";
import type { z } from "zod";
import {
  getApiKey,
  getCustomModel,
  getPreferredMode,
  getProviderOrder,
  type ProviderId,
} from "../../../shared/lib/secureKeyStore";
import { AI_PROVIDERS } from "./aiProviders";

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
  try {
    const mod = await import("expo/fetch");
    if (mod?.fetch) return mod.fetch as unknown as typeof globalThis.fetch;
  } catch {
    // Node tests and environments without expo/fetch use global fetch.
  }
  return globalThis.fetch;
}

function createProviderModel(
  providerId: ProviderId,
  apiKey: string,
  modelId: string,
  fetchImpl: typeof globalThis.fetch,
): LanguageModel {
  const provider = AI_PROVIDERS[providerId];
  if (provider.type === "gemini") {
    return createGoogleGenerativeAI({ apiKey, fetch: fetchImpl })(modelId);
  }
  return createOpenAICompatible({
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
    const modelId = customModel?.trim() || AI_PROVIDERS[providerId].defaultModel;
    models.push({
      providerId,
      modelId,
      model: createProviderModel(providerId, apiKey.trim(), modelId, fetchImpl),
    });
  }
  return models;
}

export type StructuredGenerationOptions<T> = {
  schema: z.ZodType<T>;
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
