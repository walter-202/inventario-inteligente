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
    description: "Inferencia ultra-rápida en hardware LPU especializado. Soporta Llama 3.3 y DeepSeek R1.",
    freeTierInfo: "Gratis sin tarjeta: 30 RPM, 14.4K peticiones/día.",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    recommendedModels: [
      "llama-3.3-70b-versatile",
      "deepseek-r1-distill-llama-70b",
      "llama-3.1-8b-instant",
    ],
    type: "openai-compatible",
    keyPlaceholder: "gsk_...",
    consoleUrl: "https://console.groq.com/keys",
  },
  cerebras: {
    id: "cerebras",
    name: "Cerebras Cloud",
    badge: "1M Tokens/día Gratis",
    description: "Inferencia a miles de tokens/s en chips CS-3. Soporta Llama 3.3, DeepSeek R1 y Qwen.",
    freeTierInfo: "1 millón de tokens por día completamente gratis.",
    baseUrl: "https://api.cerebras.ai/v1",
    defaultModel: "llama-3.3-70b",
    recommendedModels: [
      "llama-3.3-70b",
      "deepseek-r1-distill-llama-70b",
      "qwen-3.8-27b",
    ],
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
    recommendedModels: [
      "gemini-3.8-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.6-flash",
    ],
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
