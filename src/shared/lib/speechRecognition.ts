import { useEffect, useRef, useState } from "react";
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionNativeEventMap,
  ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";

/**
 * Expo Go no incluye el módulo nativo `ExpoSpeechRecognition`
 * (`requireNativeModule("ExpoSpeechRecognition")` lanza
 * "Cannot find native module"). Un `import` estático en un hook
 * revienta la evaluación del bundle y expo-router reporta la ruta
 * como "missing the required default export".
 *
 * Este helper carga el módulo con `require` dentro de try/catch,
 * así las rutas que usan voz siguen funcionando en Expo Go en
 * modo degradado (dictado desactivado, interpretación por texto activa).
 *
 * Política de error: no se previene, se intenta. La ausencia solo se
 * informa cuando un intento real de dictar falla (en web el micrófono
 * sí funciona vía Web Speech y el `require` síncrono no lo ve).
 */

type SpeechModule = typeof import("expo-speech-recognition");
type NativeModule = SpeechModule["ExpoSpeechRecognitionModule"];

let cached: SpeechModule | null | undefined;

export function getSpeechRecognition(): SpeechModule | null {
  if (cached !== undefined) return cached;
  try {
    const runtimeRequire = (globalThis as { require?: (id: string) => unknown }).require;
    if (typeof runtimeRequire !== "function") {
      cached = null;
      return cached;
    }
    cached = runtimeRequire("expo-speech-recognition") as SpeechModule;
  } catch {
    cached = null;
  }
  return cached;
}

export function getSpeechRecognitionModule(): NativeModule | null {
  return getSpeechRecognition()?.ExpoSpeechRecognitionModule ?? null;
}

export function isSpeechRecognitionAvailable(): boolean {
  return getSpeechRecognitionModule() !== null;
}

let asyncCache: Promise<SpeechModule | null> | undefined;

/**
 * Intento real de carga: primero la vía síncrona (dev builds) y si no hay
 * nada, un `import` dinámico (en web el bundler resuelve la implementación
 * Web Speech). Solo devuelve null cuando AMBOS fallan, es decir, cuando ya
 * se puede informar con certeza que no hay dictado.
 */
export function loadSpeechRecognitionAsync(): Promise<SpeechModule | null> {
  const sync = getSpeechRecognition();
  if (sync) return Promise.resolve(sync);
  if (!asyncCache) {
    asyncCache = (async () => {
      try {
        const mod = (await import("expo-speech-recognition")) as SpeechModule | undefined;
        if (!mod?.ExpoSpeechRecognitionModule) return null;
        cached = mod;
        return mod;
      } catch {
        return null;
      }
    })();
  }
  return asyncCache;
}

export type { ExpoSpeechRecognitionErrorEvent, ExpoSpeechRecognitionResultEvent };

/**
 * Sustituto seguro de `useSpeechRecognitionEvent`. Si el módulo
 * nativo no existe (Expo Go) no suscribe nada en lugar de crashear.
 * Si el módulo aparece tarde (import dinámico en web), se suscribe
 * cuando llega. Mantiene el orden de hooks estable.
 */
export function useSpeechRecognitionEventSafe<E extends keyof ExpoSpeechRecognitionNativeEventMap>(
  eventName: E,
  listener: (event: ExpoSpeechRecognitionNativeEventMap[E]) => void,
): void {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  const [speech, setSpeech] = useState<SpeechModule | null>(() => getSpeechRecognition());

  useEffect(() => {
    if (speech) return;
    let alive = true;
    void loadSpeechRecognitionAsync().then((loaded) => {
      if (alive && loaded) setSpeech(loaded);
    });
    return () => {
      alive = false;
    };
  }, [speech]);

  useEffect(() => {
    const native = speech?.ExpoSpeechRecognitionModule as
      | { addListener?: (name: string, cb: (event: never) => void) => { remove?: () => void } | undefined }
      | undefined;
    if (!native?.addListener) return;
    const subscription = native.addListener(eventName, ((event: never) =>
      listenerRef.current(event as never)) as (event: never) => void);
    return () => {
      subscription?.remove?.();
    };
  }, [speech, eventName]);
}
