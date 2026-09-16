import { useEffect, useRef } from "react";
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

export type { ExpoSpeechRecognitionErrorEvent, ExpoSpeechRecognitionResultEvent };

/**
 * Sustituto seguro de `useSpeechRecognitionEvent`. Si el módulo
 * nativo no existe (Expo Go) no suscribe nada en lugar de crashear.
 * Mantiene el orden de hooks estable: siempre llama a useEffect.
 */
export function useSpeechRecognitionEventSafe<E extends keyof ExpoSpeechRecognitionNativeEventMap>(
  eventName: E,
  listener: (event: ExpoSpeechRecognitionNativeEventMap[E]) => void,
): void {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  const speech = getSpeechRecognition();

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
