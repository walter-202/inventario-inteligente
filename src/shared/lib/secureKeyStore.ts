export type ProviderId = "openrouter" | "groq" | "cerebras" | "gemini" | "mistral" | "ollama" | "sambanova";
export type PreferredMode = ProviderId | "auto" | "heuristic";

const ALL_PROVIDER_IDS: ProviderId[] = ["groq", "cerebras", "sambanova", "mistral", "ollama", "openrouter", "gemini"];

const KEY_PREFIX = "lidemoda_ai_key_";
const MODEL_PREFIX = "lidemoda_ai_model_";
const PREF_PROVIDER_KEY = "lidemoda_ai_pref_provider";
const PROVIDER_ORDER_KEY = "lidemoda_ai_provider_order";

// In-memory fallback for environments without SecureStore (e.g. Node tests, SSR)
const memoryStore = new Map<string, string>();

let secureStoreModule: typeof import("expo-secure-store") | null | undefined = undefined;

async function getSecureStore() {
  if (secureStoreModule !== undefined) {
    return secureStoreModule;
  }
  try {
    const mod = await import("expo-secure-store");
    if (mod && typeof mod.getItemAsync === "function") {
      secureStoreModule = mod;
      return secureStoreModule;
    }
  } catch {
    // Native module not available (e.g. Node test runner)
  }
  secureStoreModule = null;
  return null;
}

function getWebStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Storage access denied or unavailable in current environment
  }
  return null;
}

async function safeGetItem(key: string): Promise<string | null> {
  const store = await getSecureStore();
  if (store) {
    try {
      const val = await store.getItemAsync(key);
      if (val !== null && val !== undefined) return val;
    } catch {
      // Fallback to web storage or memory
    }
  }
  const web = getWebStorage();
  if (web) {
    try {
      const val = web.getItem(key);
      if (val !== null && val !== undefined) return val;
    } catch {
      // Fallback to memory
    }
  }
  return memoryStore.get(key) ?? null;
}

async function safeSetItem(key: string, value: string): Promise<void> {
  const store = await getSecureStore();
  if (store) {
    try {
      await store.setItemAsync(key, value);
      return;
    } catch {
      // Fallback to web storage or memory
    }
  }
  const web = getWebStorage();
  if (web) {
    try {
      web.setItem(key, value);
      return;
    } catch {
      // Fallback to memory
    }
  }
  memoryStore.set(key, value);
}

async function safeDeleteItem(key: string): Promise<void> {
  const store = await getSecureStore();
  if (store) {
    try {
      await store.deleteItemAsync(key);
      return;
    } catch {
      // Fallback to web storage or memory
    }
  }
  const web = getWebStorage();
  if (web) {
    try {
      web.removeItem(key);
      return;
    } catch {
      // Fallback to memory
    }
  }
  memoryStore.delete(key);
}

export async function getApiKey(provider: ProviderId): Promise<string | null> {
  return safeGetItem(`${KEY_PREFIX}${provider}`);
}

export async function setApiKey(provider: ProviderId, key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await deleteApiKey(provider);
    return;
  }
  await safeSetItem(`${KEY_PREFIX}${provider}`, trimmed);
}

export async function deleteApiKey(provider: ProviderId): Promise<void> {
  await safeDeleteItem(`${KEY_PREFIX}${provider}`);
}

export async function getCustomModel(provider: ProviderId): Promise<string | null> {
  return safeGetItem(`${MODEL_PREFIX}${provider}`);
}

export async function setCustomModel(provider: ProviderId, model: string | null): Promise<void> {
  if (!model || !model.trim()) {
    await safeDeleteItem(`${MODEL_PREFIX}${provider}`);
    return;
  }
  await safeSetItem(`${MODEL_PREFIX}${provider}`, model.trim());
}

export async function getPreferredMode(): Promise<PreferredMode> {
  const val = await safeGetItem(PREF_PROVIDER_KEY);
  if (val === "auto" || val === "heuristic" || (val && ALL_PROVIDER_IDS.includes(val as ProviderId))) {
    return val as PreferredMode;
  }
  return "auto";
}

export async function setPreferredMode(mode: PreferredMode): Promise<void> {
  await safeSetItem(PREF_PROVIDER_KEY, mode);
}

export async function getProviderOrder(): Promise<ProviderId[]> {
  const raw = await safeGetItem(PROVIDER_ORDER_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as ProviderId[];
      }
    } catch {
      // ignore
    }
  }
  // Default priority: Groq -> Cerebras -> Mistral -> Ollama -> OpenRouter -> Gemini
  return [...ALL_PROVIDER_IDS];
}

export async function setProviderOrder(order: ProviderId[]): Promise<void> {
  await safeSetItem(PROVIDER_ORDER_KEY, JSON.stringify(order));
}

export async function getConfiguredProviders(): Promise<ProviderId[]> {
  const configured: ProviderId[] = [];
  for (const p of ALL_PROVIDER_IDS) {
    const key = await getApiKey(p);
    if (key && key.trim().length > 0) {
      configured.push(p);
    }
  }
  return configured;
}

export async function clearAllLocalAIKeys(): Promise<void> {
  for (const p of ALL_PROVIDER_IDS) {
    await deleteApiKey(p);
    await setCustomModel(p, null);
  }
  await setPreferredMode("auto");
}
