import { useCallback, useEffect, useState } from "react";
import type { PermissionResponse } from "expo-modules-core";
import {
  getSpeechRecognitionModule,
  isSpeechRecognitionAvailable,
  useSpeechRecognitionEventSafe,
} from "../../../shared/lib/speechRecognition";
import {
  interpretarRegistroProducto,
  type RegistroProductoParsed,
} from "../../asistente-ia/api/voiceRegistrationService";

type SpeechPermission = PermissionResponse & { restricted?: boolean };

export type VoiceRegistrationState = "idle" | "listening" | "interpreting" | "done" | "error";

export const VOICE_UNAVAILABLE_MESSAGE =
  "El dictado por voz requiere un development build. Podés usar los ejemplos de IA para autocompletar.";

/**
 * Hook for voice-assisted product registration.
 * Expo Go-safe: si el módulo nativo no existe, el dictado se
 * desactiva pero `interpretPhrase` (texto → IA) sigue funcionando.
 */
export function useVoiceRegistration() {
  const [isAvailable] = useState(isSpeechRecognitionAvailable);
  const [permission, setPermission] = useState<SpeechPermission | null>(null);
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [state, setState] = useState<VoiceRegistrationState>("idle");
  const [result, setResult] = useState<RegistroProductoParsed | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load permission on mount
  const loadPermission = useCallback(async () => {
    const native = getSpeechRecognitionModule();
    if (!native) {
      setPermission(null);
      setPermissionLoading(false);
      return;
    }
    setPermissionLoading(true);
    try {
      setPermission((await native.getPermissionsAsync()) as SpeechPermission);
    } catch {
      setPermission(null);
    } finally {
      setPermissionLoading(false);
    }
  }, []);
  useEffect(() => { void loadPermission(); }, [loadPermission]);

  const requestPermission = useCallback(async () => {
    const native = getSpeechRecognitionModule();
    if (!native) {
      setPermission(null);
      setPermissionLoading(false);
      setError(VOICE_UNAVAILABLE_MESSAGE);
      return;
    }
    setPermissionLoading(true);
    try {
      setPermission((await native.requestPermissionsAsync()) as SpeechPermission);
    } catch {
      setPermission(null);
    } finally {
      setPermissionLoading(false);
    }
  }, []);

  // Speech recognition events (no-op en Expo Go)
  useSpeechRecognitionEventSafe("result", (event) => {
    const value = event.results?.[0]?.transcript ?? "";
    if (value) setTranscript(value);
    if (event.isFinal) {
      setState("interpreting");
    }
  });

  useSpeechRecognitionEventSafe("error", (event) => {
    if (event.error !== "aborted") {
      setError(event.message || `Recognition error: ${event.error}`);
      setState("error");
    }
  });

  useSpeechRecognitionEventSafe("end", () => {
    setState((prev) => (prev === "listening" ? "interpreting" : prev));
  });

  // Auto-interpret when transcript changes and state becomes "interpreting"
  useEffect(() => {
    if (state !== "interpreting" || !transcript.trim()) return;
    let cancelled = false;
    void (async () => {
      try {
        const parsed = await interpretarRegistroProducto(transcript);
        if (!cancelled) {
          setResult(parsed);
          setState("done");
        }
      } catch {
        if (!cancelled) {
          setError("No se pudo interpretar el dictado. Intenta de nuevo.");
          setState("error");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [state, transcript]);

  const startListening = useCallback(() => {
    const native = getSpeechRecognitionModule();
    if (!native) {
      setError(VOICE_UNAVAILABLE_MESSAGE);
      setState("error");
      return;
    }
    if (!permission?.granted) {
      setError("Necesitamos permiso del micrófono.");
      setState("error");
      return;
    }
    setError(null);
    setTranscript("");
    setResult(null);
    setState("listening");
    try {
      native.start({
        lang: "es-BO",
        interimResults: true,
        maxAlternatives: 1,
      });
    } catch {
      setState("error");
      setError("No se pudo iniciar el reconocimiento de voz.");
    }
  }, [permission]);

  const stopListening = useCallback(() => {
    if (state === "listening") getSpeechRecognitionModule()?.stop();
  }, [state]);

  const reset = useCallback(() => {
    setState("idle");
    setTranscript("");
    setResult(null);
    setError(null);
  }, []);

  const interpretPhrase = useCallback(async (phrase: string) => {
    const trimmed = phrase.trim();
    if (!trimmed) return null;
    setError(null);
    setTranscript(trimmed);
    setState("interpreting");
    try {
      const parsed = await interpretarRegistroProducto(trimmed);
      setResult(parsed);
      setState("done");
      return parsed;
    } catch {
      setError("No se pudo interpretar el dictado.");
      setState("error");
      return null;
    }
  }, []);

  return {
    isAvailable,
    permission,
    permissionLoading,
    requestPermission,
    state,
    transcript,
    result,
    error,
    startListening,
    stopListening,
    interpretPhrase,
    reset,
  };
}
