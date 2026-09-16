import { useCallback, useEffect, useState } from "react";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { interpretarVoz, type ResultadoInterpretacion } from "../api/voiceCommandApi";

export function useVoiceCommand() {
  type SpeechPermission = Awaited<ReturnType<typeof ExpoSpeechRecognitionModule.getPermissionsAsync>>;
  const [permission, setPermission] = useState<SpeechPermission | null>(null);
  const [permissionLoading, setPermissionLoading] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const loadPermission = useCallback(async () => {
    setPermissionLoading(true);
    setPermissionError(null);
    try {
      setPermission(await ExpoSpeechRecognitionModule.getPermissionsAsync());
    } catch (permissionLoadError) {
      setPermission(null);
      setPermissionError(permissionLoadError instanceof Error ? permissionLoadError.message : "No se pudo consultar el permiso del micrófono.");
    } finally {
      setPermissionLoading(false);
    }
  }, []);
  useEffect(() => { void loadPermission(); }, [loadPermission]);
  useSpeechRecognitionEvent("result", (event) => { const value = event.results?.[0]?.transcript ?? ""; if (value) setTranscript(value); if (event.isFinal) setRecording(false); });
  useSpeechRecognitionEvent("error", (event) => { setRecording(false); if (event.error !== "aborted") setError(event.message || `Error de reconocimiento: ${event.error}`); });
  useSpeechRecognitionEvent("end", () => setRecording(false));
  const requestPermission = useCallback(async () => {
    setPermissionLoading(true);
    setPermissionError(null);
    try {
      setPermission(await ExpoSpeechRecognitionModule.requestPermissionsAsync());
    } catch (permissionRequestError) {
      setPermission(null);
      setPermissionError(permissionRequestError instanceof Error ? permissionRequestError.message : "No se pudo solicitar el permiso del micrófono.");
    } finally {
      setPermissionLoading(false);
    }
  }, []);
  const start = useCallback(() => {
    if (!permission?.granted) {
      setError("Necesitamos permiso del micrófono para iniciar el reconocimiento.");
      return;
    }
    setError(null);
    setTranscript("");
    setRecording(true);
    try {
      ExpoSpeechRecognitionModule.start({ lang: "es-BO", interimResults: true, maxAlternatives: 1 });
    } catch (startError) {
      setRecording(false);
      setError(startError instanceof Error ? startError.message : "No se pudo iniciar el reconocimiento.");
    }
  }, [permission]);
  const stop = useCallback(() => { if (recording) ExpoSpeechRecognitionModule.stop(); }, [recording]);
  const interpret = useCallback(async (): Promise<ResultadoInterpretacion> => { setInterpreting(true); setError(null); try { return await interpretarVoz(transcript); } catch (interpretationError) { const message = interpretationError instanceof Error ? interpretationError.message : "No se pudo interpretar la operación."; setError(message); throw interpretationError; } finally { setInterpreting(false); } }, [transcript]);
  return { permission, permissionLoading, permissionError, transcript, setTranscript, recording, error, interpreting, requestPermission, start, stop, interpret };
}
