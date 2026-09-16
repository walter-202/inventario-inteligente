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
    description: "Inferencia ultra-rápida en hardware LPU especializado. Ideal para punto de venta en tiempo real.",
    freeTierInfo: "Gratis sin tarjeta de crédito: 30 RPM, 14.4K peticiones/día.",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    recommendedModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    type: "openai-compatible",
    keyPlaceholder: "gsk_...",
    consoleUrl: "https://console.groq.com/keys",
  },
  cerebras: {
    id: "cerebras",
    name: "Cerebras Cloud",
    badge: "1M Tokens/día Gratis",
    description: "Inferencia a miles de tokens/segundo sobre procesadores CS-3 a escala de oblea.",
    freeTierInfo: "1 millón de tokens por día completamente gratis.",
    baseUrl: "https://api.cerebras.ai/v1",
    defaultModel: "llama-3.3-70b",
    recommendedModels: ["llama-3.3-70b", "llama3.1-8b"],
    type: "openai-compatible",
    keyPlaceholder: "csk-...",
    consoleUrl: "https://cloud.cerebras.ai/",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    badge: "Router Inteligente",
    description: "Router multi-modelo con catálogo de modelos gratuitos (:free) y enrutamiento inteligente.",
    freeTierInfo: "Modelos con sufijo :free disponibles con cuenta gratuita.",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/free",
    recommendedModels: [
      "openrouter/free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "google/gemini-2.0-flash-exp:free",
    ],
    type: "openai-compatible",
    keyPlaceholder: "sk-or-v1-...",
    consoleUrl: "https://openrouter.ai/settings/keys",
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    badge: "Google AI Studio",
    description: "Modelos multimodales de Google con cuota gratuita en Google AI Studio.",
    freeTierInfo: "Free tier de Google AI Studio por proyecto.",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash",
    recommendedModels: ["gemini-2.5-flash", "gemini-1.5-flash"],
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
