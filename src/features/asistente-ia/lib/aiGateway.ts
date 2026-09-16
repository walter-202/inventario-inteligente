import { z } from "zod";
import {
  getApiKey,
  getCustomModel,
  getPreferredMode,
  getProviderOrder,
  type ProviderId,
  type PreferredMode,
} from "../../../shared/lib/secureKeyStore";
import { AI_PROVIDERS, type AIProviderDefinition } from "./aiProviders";

export interface AICompletionOptions<T> {
  systemPrompt: string;
  userMessage: string;
  schema: z.ZodType<T>;
  preferredMode?: PreferredMode;
  timeoutMs?: number;
}

export interface AICompletionResult<T> {
  data: T | null;
  provider: ProviderId | "heuristic";
  modelUsed?: string;
  error?: string;
}

function cleanAndParseJSON(rawText: string): unknown {
  let cleaned = rawText.trim();
  // Strip markdown code fences if model enclosed JSON in them
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  return JSON.parse(cleaned);
}

async function callOpenAICompatible(
  provider: AIProviderDefinition,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    if (provider.id === "openrouter") {
      headers["HTTP-Referer"] = "https://lidemoda.app";
      headers["X-Title"] = "Lidemoda Mobile POS";
    }

    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    };

    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} from ${provider.name}: ${errorBody.slice(0, 150)}`);
    }

    const json: unknown = await response.json();
    const content = (
      json as { choices?: Array<{ message?: { content?: string } }> }
    ).choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(`Empty content returned by ${provider.name}`);
    }

    return content;
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(
  provider: AIProviderDefinition,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${provider.baseUrl}/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: `${systemPrompt}\n\n${userMessage}` }],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} from Gemini: ${errorBody.slice(0, 150)}`);
    }

    const json: unknown = await response.json();
    const content = (
      json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    ).candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error("Empty candidate content from Gemini");
    }

    return content;
  } finally {
    clearTimeout(timer);
  }
}

export async function testProviderConnection(
  providerId: ProviderId,
  apiKey: string,
  customModel?: string | null,
): Promise<{ ok: boolean; error?: string; modelUsed?: string }> {
  const provider = AI_PROVIDERS[providerId];
  if (!provider) {
    return { ok: false, error: `Proveedor desconocido: ${providerId}` };
  }

  const modelToUse = customModel?.trim() || provider.defaultModel;
  const systemPrompt = "Eres un evaluador de conectividad. Responde en formato JSON.";
  const userMessage = 'Devuelve exactamente: {"status":"ok","echo":"test"}';
  const testSchema = z.object({ status: z.string() });

  try {
    let rawContent = "";
    if (provider.type === "openai-compatible") {
      rawContent = await callOpenAICompatible(provider, apiKey, modelToUse, systemPrompt, userMessage, 8000);
    } else {
      rawContent = await callGemini(provider, apiKey, modelToUse, systemPrompt, userMessage, 8000);
    }

    const parsedJson = cleanAndParseJSON(rawContent);
    const validated = testSchema.safeParse(parsedJson);
    if (!validated.success) {
      return { ok: false, error: "La respuesta del modelo no siguió el formato esperado.", modelUsed: modelToUse };
    }
    return { ok: true, modelUsed: modelToUse };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, modelUsed: modelToUse };
  }
}

/**
 * Executes a structured JSON prompt across configured AI providers with automatic fallback.
 * If all configured providers fail or no keys are configured, returns provider: "heuristic".
 */
export async function completeChatJSON<T>(
  options: AICompletionOptions<T>,
): Promise<AICompletionResult<T>> {
  const { systemPrompt, userMessage, schema, timeoutMs = 8000 } = options;

  const mode = options.preferredMode ?? (await getPreferredMode());
  if (mode === "heuristic") {
    return { data: null, provider: "heuristic" };
  }

  // Determine candidate providers to try
  const configuredOrder = await getProviderOrder();
  let candidateProviders: ProviderId[] = [];

  if (mode !== "auto") {
    // Specific provider forced
    candidateProviders = [mode];
  } else {
    candidateProviders = [...configuredOrder];
  }

  for (const providerId of candidateProviders) {
    const provider = AI_PROVIDERS[providerId];
    if (!provider) continue;

    const apiKey = await getApiKey(providerId);
    if (!apiKey || apiKey.trim().length === 0) {
      // Skip providers without configured keys
      continue;
    }

    const customModel = await getCustomModel(providerId);
    const modelToUse = customModel?.trim() || provider.defaultModel;

    try {
      let rawContent = "";
      if (provider.type === "openai-compatible") {
        rawContent = await callOpenAICompatible(
          provider,
          apiKey.trim(),
          modelToUse,
          systemPrompt,
          userMessage,
          timeoutMs,
        );
      } else {
        rawContent = await callGemini(
          provider,
          apiKey.trim(),
          modelToUse,
          systemPrompt,
          userMessage,
          timeoutMs,
        );
      }

      const parsedJson = cleanAndParseJSON(rawContent);
      const validated = schema.safeParse(parsedJson);

      if (validated.success) {
        return {
          data: validated.data,
          provider: providerId,
          modelUsed: modelToUse,
        };
      }
      console.warn(`[AIGateway] Schema validation failed for ${provider.name} with model ${modelToUse}`);
    } catch (err) {
      console.warn(`[AIGateway] Provider ${provider.name} failed, attempting next fallback:`, err);
    }
  }

  // Fallback to heuristic
  return { data: null, provider: "heuristic" };
}
