import { useCallback, useEffect, useState } from "react";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import {
  interpretarRegistroProducto,
  type RegistroProductoParsed,
} from "../../asistente-ia/api/voiceRegistrationService";

type SpeechPermission = Awaited<ReturnType<typeof ExpoSpeechRecognitionModule.getPermissionsAsync>>;

export type VoiceRegistrationState = "idle" | "listening" | "interpreting" | "done" | "error";

/**
 * Hook for voice-assisted product registration.
 * Returns speech recognition state, partial transcript, and parsed product fields.
 */
export function useVoiceRegistration() {
  const [permission, setPermission] = useState<SpeechPermission | null>(null);
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [state, setState] = useState<VoiceRegistrationState>("idle");
  const [result, setResult] = useState<RegistroProductoParsed | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load permission on mount
  const loadPermission = useCallback(async () => {
    setPermissionLoading(true);
    try {
      setPermission(await ExpoSpeechRecognitionModule.getPermissionsAsync());
    } catch {
      setPermission(null);
    } finally {
      setPermissionLoading(false);
    }
  }, []);
  useEffect(() => { void loadPermission(); }, [loadPermission]);

  const requestPermission = useCallback(async () => {
    setPermissionLoading(true);
    try {
      setPermission(await ExpoSpeechRecognitionModule.requestPermissionsAsync());
    } catch {
      setPermission(null);
    } finally {
      setPermissionLoading(false);
    }
  }, []);

  // Speech recognition events
  useSpeechRecognitionEvent("result", (event) => {
    const value = event.results?.[0]?.transcript ?? "";
    if (value) setTranscript(value);
    if (event.isFinal) {
      setState("interpreting");
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (event.error !== "aborted") {
      setError(event.message || `Recognition error: ${event.error}`);
      setState("error");
    }
  });

  useSpeechRecognitionEvent("end", () => {
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
      ExpoSpeechRecognitionModule.start({
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
    if (state === "listening") ExpoSpeechRecognitionModule.stop();
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
