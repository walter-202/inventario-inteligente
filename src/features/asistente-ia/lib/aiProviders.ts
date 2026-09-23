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
    description: "Inferencia ultra-rápida en hardware LPU. GPT-OSS y Qwen con tool calling.",
    freeTierInfo: "Gratis sin tarjeta: 30 RPM, 14.4K peticiones/día.",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-120b",
    recommendedModels: ["openai/gpt-oss-120b", "qwen/qwen3.6-27b", "openai/gpt-oss-20b"],
    type: "openai-compatible",
    keyPlaceholder: "gsk_...",
    consoleUrl: "https://console.groq.com/keys",
  },
  cerebras: {
    id: "cerebras",
    name: "Cerebras Cloud",
    badge: "1M Tokens/día Gratis",
    description: "Inferencia a miles de tokens/s en chips CS-3. GPT-OSS y Qwen 3.8.",
    freeTierInfo: "1 millón de tokens por día completamente gratis.",
    baseUrl: "https://api.cerebras.ai/v1",
    defaultModel: "gpt-oss-120b",
    recommendedModels: ["gpt-oss-120b", "qwen-3.8-27b"],
    type: "openai-compatible",
    keyPlaceholder: "csk-...",
    consoleUrl: "https://cloud.cerebras.ai/",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    badge: "Router Inteligente",
    description: "Acceso multi-modelo con catálogo gratuito (:free), DeepSeek R1, Nemotron y auto-enrutador.",
    freeTierInfo: "Modelos con sufijo :free disponibles con cuenta gratuita (20 RPM).",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/free",
    recommendedModels: [
      "openrouter/free",
      "deepseek/deepseek-r1:free",
      "nvidia/nemotron-3.5-lightning:free",
      "meta-llama/llama-3.3-70b-instruct:free",
    ],
    type: "openai-compatible",
    keyPlaceholder: "sk-or-v1-...",
    consoleUrl: "https://openrouter.ai/settings/keys",
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    badge: "Google AI Studio",
    description: "Modelos de frontera de Google (Gemini 3.8 Flash y 3.5 Flash-Lite) con cuota gratuita.",
    freeTierInfo: "Free tier de Google AI Studio: 15 RPM sin costo.",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-3.8-flash",
    recommendedModels: ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash"],
    type: "gemini",
    keyPlaceholder: "AIzaSy...",
    consoleUrl: "https://aistudio.google.com/app/apikey",
  },
};

export const PROVIDER_LIST: AIProviderDefinition[] = [
  AI_PROVIDERS.groq,
  AI_PROVIDERS.cerebras,
  AI_PROVIDERS.openrouter,
  AI_PROVIDERS.gemini,
];

/** Groq shut down Llama 3.3/3.1 on 2026-08-16. Cerebras retired llama-3.3-70b in favor of GPT-OSS. */
const MODEL_ALIASES: Record<ProviderId, Record<string, string>> = {
  groq: {
    "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
    "llama-3.1-8b-instant": "openai/gpt-oss-20b",
    "deepseek-r1-distill-llama-70b": "openai/gpt-oss-120b",
  },
  cerebras: {
    "llama-3.3-70b": "gpt-oss-120b",
    "deepseek-r1-distill-llama-70b": "gpt-oss-120b",
  },
  openrouter: {},
  gemini: {},
};

const KEY_PREFIX_BY_PROVIDER: Record<ProviderId, string> = {
  groq: "gsk_",
  cerebras: "csk-",
  openrouter: "sk-or-",
  gemini: "AIza",
};

export function resolveProviderModel(providerId: ProviderId, requested?: string | null): string {
  const provider = AI_PROVIDERS[providerId];
  const requestedId = requested?.trim() || provider.defaultModel;
  return MODEL_ALIASES[providerId][requestedId] ?? requestedId;
}

export function describeKeyProviderMismatch(providerId: ProviderId, apiKey: string): string | null {
  const trimmed = apiKey.trim();
  if (!trimmed) return null;
  const expected = KEY_PREFIX_BY_PROVIDER[providerId];
  if (trimmed.startsWith(expected)) return null;
  for (const id of Object.keys(KEY_PREFIX_BY_PROVIDER) as ProviderId[]) {
    if (id === providerId) continue;
    const prefix = KEY_PREFIX_BY_PROVIDER[id];
    if (trimmed.startsWith(prefix)) {
      return `Esta clave parece de ${AI_PROVIDERS[id].name} (${prefix}). ${AI_PROVIDERS[providerId].name} usa claves ${expected}…`;
    }
  }
  return null;
}
