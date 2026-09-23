import { supabase } from "../../../shared/lib/supabase";
import {
  setApiKey,
  setCustomModel,
  setPreferredMode,
  type ProviderId,
  type PreferredMode,
} from "../../../shared/lib/secureKeyStore";
import { PROVIDER_LIST } from "./aiProviders";

export interface UserCloudAISecrets {
  keys: Record<string, string>;
  preferred_mode: PreferredMode;
  custom_models: Record<string, string>;
}

/**
 * Downloads and synchronizes user-scoped AI keys from Supabase Vault into local secure storage.
 * Fails gracefully if offline or table/RPC is unreachable.
 */
export async function syncAIKeysFromCloud(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("get_user_ai_secrets");
    if (error || !data) return false;

    const payload = data as UserCloudAISecrets;

    // Synchronize keys
    if (payload.keys && typeof payload.keys === "object") {
      for (const provider of PROVIDER_LIST) {
        const key = payload.keys[provider.id];
        if (key && typeof key === "string" && key.trim().length > 0) {
          await setApiKey(provider.id, key.trim());
        }
      }
    }

    // Synchronize custom models
    if (payload.custom_models && typeof payload.custom_models === "object") {
      for (const provider of PROVIDER_LIST) {
        const model = payload.custom_models[provider.id];
        if (model && typeof model === "string" && model.trim().length > 0) {
          await setCustomModel(provider.id, model.trim());
        }
      }
    }

    // Synchronize preferred mode
    if (payload.preferred_mode) {
      await setPreferredMode(payload.preferred_mode);
    }

    return true;
  } catch {
    // Network or RPC failure: gracefully keep existing local keys
    return false;
  }
}

/**
 * Persists an AI key and custom model to Supabase Vault for cross-device sync.
 */
export async function syncAIKeyToCloud(
  provider: ProviderId,
  apiKey: string,
  customModel?: string | null,
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("save_user_ai_secret", {
      p_provider: provider,
      p_api_key: apiKey.trim(),
      p_custom_model: customModel?.trim() || null,
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Deletes an AI key from Supabase Vault.
 */
export async function deleteAIKeyFromCloud(provider: ProviderId): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("delete_user_ai_secret", {
      p_provider: provider,
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Persists the preferred routing mode to Supabase.
 */
export async function syncAIPreferencesToCloud(preferredMode: PreferredMode): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("save_user_ai_preferences", {
      p_preferred_mode: preferredMode,
    });
    return !error;
  } catch {
    return false;
  }
}
