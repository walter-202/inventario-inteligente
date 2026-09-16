import { useCallback, useEffect, useState } from "react";
import type { PermissionResponse } from "expo-modules-core";
import {
  getSpeechRecognitionModule,
  isSpeechRecognitionAvailable,
  useSpeechRecognitionEventSafe,
} from "../../../shared/lib/speechRecognition";
import { interpretarVoz, type ResultadoInterpretacion, type VozContexto } from "../api/voiceCommandApi";

type SpeechPermission = PermissionResponse & { restricted?: boolean };

export const VOICE_COMMAND_UNAVAILABLE_MESSAGE =
  "El dictado por voz requiere un development build. Podés escribir el comando y usar Interpretar.";

export function useVoiceCommand() {
  const [isAvailable] = useState(isSpeechRecognitionAvailable);
  const [permission, setPermission] = useState<SpeechPermission | null>(null);
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const loadPermission = useCallback(async () => {
    const native = getSpeechRecognitionModule();
    if (!native) {
      setPermission(null);
      setPermissionError(null);
      setPermissionLoading(false);
      return;
    }
    setPermissionLoading(true);
    setPermissionError(null);
    try {
      setPermission((await native.getPermissionsAsync()) as SpeechPermission);
    } catch (permissionLoadError) {
      setPermission(null);
      setPermissionError(permissionLoadError instanceof Error ? permissionLoadError.message : "No se pudo consultar el permiso del micrófono.");
    } finally {
      setPermissionLoading(false);
    }
  }, []);
  useEffect(() => { void loadPermission(); }, [loadPermission]);
  useSpeechRecognitionEventSafe("result", (event) => { const value = event.results?.[0]?.transcript ?? ""; if (value) setTranscript(value); if (event.isFinal) setRecording(false); });
  useSpeechRecognitionEventSafe("error", (event) => { setRecording(false); if (event.error !== "aborted") setError(event.message || `Error de reconocimiento: ${event.error}`); });
  useSpeechRecognitionEventSafe("end", () => setRecording(false));
  const requestPermission = useCallback(async () => {
    const native = getSpeechRecognitionModule();
    if (!native) {
      setPermission(null);
      setPermissionLoading(false);
      setPermissionError(VOICE_COMMAND_UNAVAILABLE_MESSAGE);
      return;
    }
    setPermissionLoading(true);
    setPermissionError(null);
    try {
      setPermission((await native.requestPermissionsAsync()) as SpeechPermission);
    } catch (permissionRequestError) {
      setPermission(null);
      setPermissionError(permissionRequestError instanceof Error ? permissionRequestError.message : "No se pudo solicitar el permiso del micrófono.");
    } finally {
      setPermissionLoading(false);
    }
  }, []);
  const start = useCallback(() => {
    const native = getSpeechRecognitionModule();
    if (!native) {
      setError(VOICE_COMMAND_UNAVAILABLE_MESSAGE);
      return;
    }
    if (!permission?.granted) {
      setError("Necesitamos permiso del micrófono para iniciar el reconocimiento.");
      return;
    }
    setError(null);
    setTranscript("");
    setRecording(true);
    try {
      native.start({ lang: "es-BO", interimResults: true, maxAlternatives: 1 });
    } catch (startError) {
      setRecording(false);
      setError(startError instanceof Error ? startError.message : "No se pudo iniciar el reconocimiento.");
    }
  }, [permission]);
  const stop = useCallback(() => { if (recording) getSpeechRecognitionModule()?.stop(); }, [recording]);
  const interpret = useCallback(async (contexto?: VozContexto): Promise<ResultadoInterpretacion> => { setInterpreting(true); setError(null); try { return await interpretarVoz(transcript, contexto); } catch (interpretationError) { const message = interpretationError instanceof Error ? interpretationError.message : "No se pudo interpretar la operación."; setError(message); throw interpretationError; } finally { setInterpreting(false); } }, [transcript]);
  return { isAvailable, permission, permissionLoading, permissionError, transcript, setTranscript, recording, error, interpreting, requestPermission, start, stop, interpret };
}
