import type { ProviderId } from "../../../shared/lib/secureKeyStore";

export interface AIProviderDefinition {
  id: ProviderId;
  name: string;
  badge: string;
  description: string;
  freeTierInfo: string;
  baseUrl: string;
  defaultModel: string;
  recommendedModels: string[];
  type: "openai-compatible" | "gemini";
  keyPlaceholder: string;
  consoleUrl: string;
}

export const AI_PROVIDERS: Record<ProviderId, AIProviderDefinition> = {
  groq: {
    id: "groq",
    name: "Groq Cloud",
    badge: "Recomendado Free Tier",
    description: "Inferencia ultra-rápida LPU. GPT-OSS 120B/20B, Llama 4 Scout y Qwen 3.",
    freeTierInfo: "Gratis sin tarjeta: 30 RPM, 14.4K peticiones/día.",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-120b",
    recommendedModels: [
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "meta-llama/llama-4-scout-17b-16e-instruct",
      "qwen/qwen3-32b",
      "moonshotai/kimi-k2-instruct-0905",
    ],
    type: "openai-compatible",
    keyPlaceholder: "gsk_...",
    consoleUrl: "https://console.groq.com/keys",
  },
  cerebras: {
    id: "cerebras",
    name: "Cerebras Cloud",
    badge: "1M Tokens/día Gratis",
    description: "Inferencia a miles de tokens/s en chips CS-3 con GPT-OSS y Qwen.",
    freeTierInfo: "1 millón de tokens por día completamente gratis.",
    baseUrl: "https://api.cerebras.ai/v1",
    defaultModel: "gpt-oss-120b",
    recommendedModels: ["gpt-oss-120b", "qwen-3.8-27b"],
    type: "openai-compatible",
    keyPlaceholder: "csk-...",
    consoleUrl: "https://cloud.cerebras.ai/",
  },
  sambanova: {
    id: "sambanova",
    name: "SambaNova Cloud",
    badge: "60 RPM Free Tier",
    description: "Inferencia acelerada en chips SN40L. Llama 3.3 70B y Llama 3.2 Vision con cuota holgada.",
    freeTierInfo: "40-60 RPM gratis sin tarjeta con soporte de visión.",
    baseUrl: "https://api.sambanova.ai/v1",
    defaultModel: "Meta-Llama-3.3-70B-Instruct",
    recommendedModels: [
      "Meta-Llama-3.3-70B-Instruct",
      "Llama-3.2-11B-Vision-Instruct",
      "Qwen2.5-72B-Instruct",
    ],
    type: "openai-compatible",
    keyPlaceholder: "API key de SambaNova...",
    consoleUrl: "https://cloud.sambanova.ai/apis",
  },
  mistral: {
    id: "mistral",
    name: "Mistral AI",
    badge: "La Plateforme Free",
    description: "Modelos europeos de frontera: Mistral Small, Pixtral (Visión multimodal) y Codestral.",
    freeTierInfo: "Plan experimental gratuito para prototipos en La Plateforme.",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    recommendedModels: [
      "mistral-small-latest",
      "pixtral-12b-2409",
      "mistral-large-latest",
      "codestral-latest",
      "open-mistral-nemo",
    ],
    type: "openai-compatible",
    keyPlaceholder: "Clave API de Mistral...",
    consoleUrl: "https://console.mistral.ai/api-keys/",
  },
  ollama: {
    id: "ollama",
    name: "Ollama Cloud",
    badge: "Free Cloud Credits",
    description: "API Cloud oficial (ollama.com) con créditos gratuitos para gpt-oss, gemma4 y nemotron-3.",
    freeTierInfo: "Créditos starter para gpt-oss (120b/20b), gemma4:31b y nemotron-3.",
    baseUrl: "https://ollama.com/v1",
    defaultModel: "gpt-oss:120b",
    recommendedModels: [
      "gpt-oss:120b",
      "gpt-oss:20b",
      "gemma4:31b",
      "nemotron-3-nano:30b",
      "nemotron-3-super",
      "nemotron-3-ultra",
    ],
    type: "openai-compatible",
    keyPlaceholder: "Clave de ollama.com/settings/keys",
    consoleUrl: "https://ollama.com/settings/keys",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    badge: "Router Inteligente",
    description: "Acceso multi-modelo con catálogo gratuito (:free), DeepSeek R1, Llama 3.3 y Qwen 2.5.",
    freeTierInfo: "Modelos con sufijo :free disponibles con cuenta gratuita (20 RPM).",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/free",
    recommendedModels: [
      "openrouter/free",
      "deepseek/deepseek-r1:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "qwen/qwen-2.5-72b-instruct:free",
      "mistralai/mistral-small-24b-instruct-2501:free",
    ],
    type: "openai-compatible",
    keyPlaceholder: "sk-or-v1-...",
    consoleUrl: "https://openrouter.ai/settings/keys",
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    badge: "Google AI Studio",
    description: "Modelos oficiales de Google: Gemini 2.5 Flash, 2.5 Flash-Lite, 3 Flash y 2.5 Pro.",
    freeTierInfo: "Free tier de Google AI Studio: 10-15 RPM y 1.500 RPD.",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash",
    recommendedModels: [
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-3-flash",
      "gemini-3.1-flash-lite",
    ],
    type: "gemini",
    keyPlaceholder: "AIzaSy...",
    consoleUrl: "https://aistudio.google.com/app/apikey",
  },
};

export const PROVIDER_LIST: AIProviderDefinition[] = [
  AI_PROVIDERS.groq,
  AI_PROVIDERS.cerebras,
  AI_PROVIDERS.sambanova,
  AI_PROVIDERS.mistral,
  AI_PROVIDERS.ollama,
  AI_PROVIDERS.openrouter,
  AI_PROVIDERS.gemini,
];

/** Aliases for backward compatibility and graceful migration of retired or test model names. */
const MODEL_ALIASES: Record<ProviderId, Record<string, string>> = {
  groq: {
    "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
    "llama-3.1-8b-instant": "openai/gpt-oss-20b",
    "llama-3.2-11b-vision-preview": "openai/gpt-oss-120b",
    "llama-3.2-3b-preview": "openai/gpt-oss-20b",
    "llama-3.2-1b-preview": "openai/gpt-oss-20b",
    "deepseek-r1-distill-llama-70b": "openai/gpt-oss-120b",
    "meta-llama/llama-4-maverick-17b-128e-instruct": "openai/gpt-oss-120b",
  },
  cerebras: {
    "llama-3.3-70b": "gpt-oss-120b",
    "llama3.1-8b": "gpt-oss-120b",
    "deepseek-r1-distill-llama-70b": "gpt-oss-120b",
  },
  sambanova: {},
  mistral: {},
  ollama: {
    "llama3.3": "gpt-oss:120b",
  },
  openrouter: {},
  gemini: {
    "gemini-3.8-flash": "gemini-2.5-flash",
    "gemini-3.5-flash-lite": "gemini-2.5-flash-lite",
  },
};

const KEY_PREFIX_BY_PROVIDER: Record<ProviderId, string | null> = {
  groq: "gsk_",
  cerebras: "csk-",
  openrouter: "sk-or-",
  gemini: "AIza",
  sambanova: null,
  mistral: null,
  ollama: null,
};

export function resolveProviderModel(providerId: ProviderId, requested?: string | null): string {
  const provider = AI_PROVIDERS[providerId];
  const requestedId = requested?.trim() || provider.defaultModel;
  return MODEL_ALIASES[providerId]?.[requestedId] ?? requestedId;
}

export function describeKeyProviderMismatch(providerId: ProviderId, apiKey: string): string | null {
  const trimmed = apiKey.trim();
  if (!trimmed) return null;
  const expected = KEY_PREFIX_BY_PROVIDER[providerId];
  if (!expected) return null;
  if (trimmed.startsWith(expected)) return null;
  for (const id of Object.keys(KEY_PREFIX_BY_PROVIDER) as ProviderId[]) {
    if (id === providerId) continue;
    const prefix = KEY_PREFIX_BY_PROVIDER[id];
    if (prefix && trimmed.startsWith(prefix)) {
      return `Esta clave parece de ${AI_PROVIDERS[id].name} (${prefix}). ${AI_PROVIDERS[providerId].name} usa claves ${expected}…`;
    }
  }
  return null;
}
