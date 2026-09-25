import { useCallback, useEffect, useRef, useState } from "react";
import type { PermissionResponse } from "expo-modules-core";
import { APP_LOCALE } from "../../../shared/lib/constants";
import {
  getSpeechRecognitionModule,
  loadSpeechRecognitionAsync,
  useSpeechRecognitionEventSafe,
} from "../../../shared/lib/speechRecognition";
import {
  interpretarRegistroProducto,
  type RegistroProductoParsed,
} from "../../asistente-ia/api/voiceRegistrationService";

type SpeechPermission = PermissionResponse & { restricted?: boolean };

export type VoiceRegistrationState = "idle" | "listening" | "interpreting" | "done" | "error";

export const VOICE_UNAVAILABLE_MESSAGE =
  "No se pudo activar el dictado en este dispositivo (en Expo Go no hay micrófono nativo; en web o development build sí funciona). Podés usar los ejemplos de IA para autocompletar.";

/**
 * Hook for voice-assisted product registration.
 * No previene: intenta dictar y solo informa si el intento real falla;
 * `interpretPhrase` (texto → IA) siempre sigue funcionando.
 */
export function useVoiceRegistration() {
  const [blocked, setBlocked] = useState(false);
  const isAvailable = !blocked;
  const [permission, setPermission] = useState<SpeechPermission | null>(null);
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [state, setState] = useState<VoiceRegistrationState>("idle");
  const [result, setResult] = useState<RegistroProductoParsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef("");
  const interpretationInFlightRef = useRef(false);
  const listeningRef = useRef(false);

  const runInterpretation = useCallback(async (phrase: string) => {
    const trimmed = phrase.trim();
    if (!trimmed || interpretationInFlightRef.current) return null;

    interpretationInFlightRef.current = true;
    setError(null);
    setTranscript(trimmed);
    transcriptRef.current = trimmed;
    setState("interpreting");

    try {
      const parsed = await interpretarRegistroProducto(trimmed);
      setResult(parsed);
      setState("done");
      return parsed;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo interpretar el dictado. Intentá de nuevo.");
      setState("error");
      return null;
    } finally {
      interpretationInFlightRef.current = false;
    }
  }, []);

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
    const native = getSpeechRecognitionModule() ?? (await loadSpeechRecognitionAsync())?.ExpoSpeechRecognitionModule ?? null;
    if (!native) {
      setPermission(null);
      setPermissionLoading(false);
      setBlocked(true);
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
    if (value) {
      setTranscript(value);
      transcriptRef.current = value;
    }
    if (event.isFinal && value.trim()) {
      void runInterpretation(value);
    }
  });

  useSpeechRecognitionEventSafe("error", (event) => {
    if (event.error !== "aborted") {
      setError(event.message || `Recognition error: ${event.error}`);
      setState("error");
    }
  });

  useSpeechRecognitionEventSafe("end", () => {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    const pending = transcriptRef.current.trim();
    if (pending) {
      void runInterpretation(pending);
      return;
    }
    setState("idle");
  });

  const startListening = useCallback(async () => {
    setError(null);
    const native = getSpeechRecognitionModule() ?? (await loadSpeechRecognitionAsync())?.ExpoSpeechRecognitionModule ?? null;
    if (!native) {
      setBlocked(true);
      setError(VOICE_UNAVAILABLE_MESSAGE);
      setState("error");
      return;
    }
    let granted = permission?.granted === true;
    try {
      const current = (await native.getPermissionsAsync()) as SpeechPermission;
      setPermission(current);
      granted = current.granted === true;
    } catch {
      // Se conserva el último permiso conocido; si no hay, se informa abajo.
    }
    if (!granted) {
      setError("Necesitamos permiso del micrófono.");
      setState("error");
      return;
    }
    setTranscript("");
    transcriptRef.current = "";
    setResult(null);
    listeningRef.current = true;
    setState("listening");
    try {
      native.start({
        lang: APP_LOCALE,
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
    listeningRef.current = false;
    setState("idle");
    setTranscript("");
    transcriptRef.current = "";
    setResult(null);
    setError(null);
  }, []);

  const interpretPhrase = useCallback(async (phrase: string) => {
    return runInterpretation(phrase);
  }, [runInterpretation]);

  return {
    isAvailable,
    blocked,
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
