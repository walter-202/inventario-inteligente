export type ProviderId = "openrouter" | "groq" | "cerebras" | "gemini";
export type PreferredMode = ProviderId | "auto" | "heuristic";

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

async function safeGetItem(key: string): Promise<string | null> {
  const store = await getSecureStore();
  if (store) {
    try {
      return await store.getItemAsync(key);
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
  if (val === "auto" || val === "heuristic" || val === "openrouter" || val === "groq" || val === "cerebras" || val === "gemini") {
    return val;
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
  // Default priority: Groq (ultra fast free tier) -> Cerebras (high rate free tier) -> OpenRouter -> Gemini
  return ["groq", "cerebras", "openrouter", "gemini"];
}

export async function setProviderOrder(order: ProviderId[]): Promise<void> {
  await safeSetItem(PROVIDER_ORDER_KEY, JSON.stringify(order));
}

export async function getConfiguredProviders(): Promise<ProviderId[]> {
  const providers: ProviderId[] = ["groq", "cerebras", "openrouter", "gemini"];
  const configured: ProviderId[] = [];
  for (const p of providers) {
    const key = await getApiKey(p);
    if (key && key.trim().length > 0) {
      configured.push(p);
    }
  }
  return configured;
}
