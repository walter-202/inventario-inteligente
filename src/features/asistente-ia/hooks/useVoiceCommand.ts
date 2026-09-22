import { useCallback, useEffect, useState } from "react";
import type { PermissionResponse } from "expo-modules-core";
import { APP_LOCALE } from "../../../shared/lib/constants";
import {
  getSpeechRecognitionModule,
  loadSpeechRecognitionAsync,
  useSpeechRecognitionEventSafe,
} from "../../../shared/lib/speechRecognition";
import { interpretarVoz, type ResultadoInterpretacion, type VozContexto } from "../api/voiceCommandApi";

type SpeechPermission = PermissionResponse & { restricted?: boolean };

/** Solo se muestra cuando un intento real de dictar falló: informa, no previene. */
export const VOICE_COMMAND_UNAVAILABLE_MESSAGE =
  "No se pudo activar el dictado en este dispositivo (en Expo Go no hay micrófono nativo; en web o development build sí funciona). Podés escribir el comando y enviarlo.";

/** Une espacios y repara SKUs dictados ("jea 001" → "jea-001"). */
export function estabilizarTranscripcion(valor: string): string {
  const collapsed = valor.trim().replace(/\s+/g, " ");
  return collapsed.replace(/\b([a-záéíóúñ]{2,5})\s+(\d{2,5})\b/gi, "$1-$2").trim();
}

function elegirMejorTranscripcion(results?: Array<{ transcript?: string }>): string {
  const candidates = (results ?? []).map((r) => (r?.transcript ?? "").trim()).filter(Boolean);
  if (candidates.length === 0) return "";
  const withSku = candidates.find((t) => /\b[a-záéíóúñ]{2,5}[-\s]\d{2,5}\b/i.test(t));
  return withSku ?? candidates[0] ?? "";
}

function mapearErrorVoz(error?: string, message?: string | null): string {
  const code = (error ?? "").toLowerCase();
  if (code.includes("no-speech") || code.includes("no_match") || code.includes("nomatch")) {
    return "No se detectó voz. Acercate al micrófono y probá de nuevo, o escribí el comando.";
  }
  if (code.includes("network")) {
    return "Sin conexión para el reconocimiento. Podés escribir el comando y usar Interpretar.";
  }
  if (code.includes("not-allowed") || code.includes("not_allowed") || code.includes("permission")) {
    return "Necesitamos permiso del micrófono para iniciar el reconocimiento.";
  }
  return message || `Error de reconocimiento: ${error ?? "desconocido"}`;
}

export function useVoiceCommand() {
  // Se asume capaz hasta que un intento real falle: en web el micrófono
  // funciona aunque el `require` síncrono no vea el módulo.
  const [blocked, setBlocked] = useState(false);
  const isAvailable = !blocked;
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
  useSpeechRecognitionEventSafe("result", (event) => {
    const value = estabilizarTranscripcion(elegirMejorTranscripcion(event.results));
    if (value) setTranscript((prev) => (prev === value ? prev : value));
    if (event.isFinal) setRecording(false);
  });
  useSpeechRecognitionEventSafe("error", (event) => { setRecording(false); if (event.error !== "aborted") setError(mapearErrorVoz(event.error, event.message)); });
  useSpeechRecognitionEventSafe("end", () => setRecording(false));
  const requestPermission = useCallback(async () => {
    const native = getSpeechRecognitionModule() ?? (await loadSpeechRecognitionAsync())?.ExpoSpeechRecognitionModule ?? null;
    if (!native) {
      setPermission(null);
      setPermissionLoading(false);
      setBlocked(true);
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
  const ensureNative = useCallback(async () => {
    const sync = getSpeechRecognitionModule();
    if (sync) return sync;
    return (await loadSpeechRecognitionAsync())?.ExpoSpeechRecognitionModule ?? null;
  }, []);
  const start = useCallback(async () => {
    if (recording) return;
    setError(null);
    const native = await ensureNative();
    if (!native) {
      setBlocked(true);
      setError(VOICE_COMMAND_UNAVAILABLE_MESSAGE);
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
      setError("Necesitamos permiso del micrófono para iniciar el reconocimiento.");
      return;
    }
    setTranscript("");
    setRecording(true);
    try {
      // requiresOnDeviceRecognition se deja en false a propósito: en la mayoría
      // de los dispositivos los modelos on-device no están descargados y forzarlos
      // rompe el dictado. maxAlternatives 3 mejora la captura de SKUs.
      native.start({ lang: APP_LOCALE, interimResults: true, maxAlternatives: 3 });
    } catch (startError) {
      setRecording(false);
      setError(startError instanceof Error ? startError.message : "No se pudo iniciar el reconocimiento.");
    }
  }, [permission, recording, ensureNative]);

  const stop = useCallback(() => {
    try {
      getSpeechRecognitionModule()?.stop();
    } catch {
      /* noop */
    }
  }, []);

  const interpret = useCallback(
    async (contexto?: VozContexto): Promise<ResultadoInterpretacion> => {
      setInterpreting(true);
      setError(null);
      try {
        return await interpretarVoz(transcript, contexto);
      } catch (interpretationError) {
        const message =
          interpretationError instanceof Error
            ? interpretationError.message
            : "No se pudo interpretar la operación.";
        setError(message);
        throw interpretationError;
      } finally {
        setInterpreting(false);
      }
    },
    [transcript],
  );

  return {
    isAvailable,
    blocked,
    permission,
    permissionLoading,
    permissionError,
    transcript,
    setTranscript,
    recording,
    error,
    interpreting,
    requestPermission,
    start,
    stop,
    interpret,
  };
}
