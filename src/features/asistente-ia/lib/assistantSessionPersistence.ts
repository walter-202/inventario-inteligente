import { MAX_CHAT_MESSAGES, MAX_CHAT_SESSIONS, type ChatMessage, type ChatSession, type ChatState, type ChatTone, type EstadoSesion, type ObjetivoSesion } from "./chatSession";

export const MAX_STORED_SESSIONS = MAX_CHAT_SESSIONS;
export const MAX_STORED_MESSAGES = MAX_CHAT_MESSAGES;
const MAX_MESSAGE_TEXT_LENGTH = 1200;
const STORAGE_VERSION = 1;

export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isObjetivo(value: unknown): value is ObjetivoSesion {
  return value === "venta" || value === "consulta" || value === "registro" || value === "indefinido";
}

function isEstado(value: unknown): value is EstadoSesion {
  return value === "activa" || value === "completada" || value === "cancelada";
}

function isTone(value: unknown): value is ChatTone {
  return value === "info" || value === "success" || value === "warning" || value === "error";
}

function parseSession(value: unknown): ChatSession | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || !isObjetivo(value.objetivo) || !isEstado(value.estado)) return null;
  if (
    (typeof value.resumen !== "string" && value.resumen !== null)
    || typeof value.createdAt !== "number"
    || typeof value.updatedAt !== "number"
    || !Number.isFinite(value.createdAt)
    || !Number.isFinite(value.updatedAt)
  ) return null;
  return {
    id: value.id,
    objetivo: value.objetivo,
    estado: value.estado,
    resumen: value.resumen,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

/** Stored chat is intentionally reduced to display-safe content: never restore action cards. */
function parseDisplayMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id || (value.role !== "usuario" && value.role !== "asistente") || typeof value.texto !== "string") {
    return null;
  }
  const message: ChatMessage = {
    id: value.id,
    role: value.role,
    texto: value.texto.slice(0, MAX_MESSAGE_TEXT_LENGTH),
  };
  if (isTone(value.tone)) message.tone = value.tone;
  if (Array.isArray(value.thoughts)) message.thoughts = value.thoughts.filter((thought): thought is string => typeof thought === "string").slice(0, 8);
  if (typeof value.durationMs === "number" && Number.isFinite(value.durationMs) && value.durationMs >= 0) message.durationMs = value.durationMs;
  return message;
}

function persistableMessage(message: ChatMessage): Omit<ChatMessage, "attachment"> {
  const { attachment: _attachment, texto, thoughts, ...safe } = message;
  return {
    ...safe,
    texto: texto.slice(0, MAX_MESSAGE_TEXT_LENGTH),
    ...(thoughts ? { thoughts: thoughts.filter((thought) => typeof thought === "string").slice(0, 8) } : {}),
  };
}

export function assistantChatStorageKey(userId: string): string {
  return `lidemoda:assistant-chat:v${STORAGE_VERSION}:${encodeURIComponent(userId)}`;
}

export function emptyAssistantChat(): ChatState {
  return { sessions: [], activeSessionId: null, messages: {} };
}

/** Keeps storage finite and active-session selection coherent. */
export function compactAssistantChat(state: ChatState): ChatState {
  const sessions = [...state.sessions]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_STORED_SESSIONS);
  const allowedIds = new Set(sessions.map((session) => session.id));
  const messages: Record<string, ChatMessage[]> = {};
  for (const session of sessions) {
    messages[session.id] = (state.messages[session.id] ?? []).slice(-MAX_STORED_MESSAGES).map(persistableMessage);
  }
  const activeSessionId = state.activeSessionId && allowedIds.has(state.activeSessionId) && sessions.some((session) => session.id === state.activeSessionId && session.estado === "activa")
    ? state.activeSessionId
    : null;
  return { sessions, activeSessionId, messages };
}

export async function saveAssistantChat(storage: AsyncStorageLike, userId: string, state: ChatState): Promise<void> {
  if (!userId) return;
  const chat = compactAssistantChat(state);
  await storage.setItem(assistantChatStorageKey(userId), JSON.stringify({ version: STORAGE_VERSION, ...chat }));
}

export async function hydrateAssistantChat(storage: AsyncStorageLike, userId: string): Promise<ChatState> {
  if (!userId) return emptyAssistantChat();
  try {
    const raw = await storage.getItem(assistantChatStorageKey(userId));
    if (!raw) return emptyAssistantChat();
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.sessions) || !isRecord(parsed.messages)) return emptyAssistantChat();
    const sessions = parsed.sessions.map(parseSession).filter((session): session is ChatSession => session !== null);
    const messages: Record<string, ChatMessage[]> = {};
    for (const session of sessions) {
      const rawMessages = parsed.messages[session.id];
      messages[session.id] = Array.isArray(rawMessages)
        ? rawMessages.map(parseDisplayMessage).filter((message): message is ChatMessage => message !== null)
        : [];
    }
    const activeSessionId = typeof parsed.activeSessionId === "string" ? parsed.activeSessionId : null;
    return compactAssistantChat({ sessions, activeSessionId, messages });
  } catch {
    return emptyAssistantChat();
  }
}

export async function clearAssistantChat(storage: AsyncStorageLike, userId: string): Promise<void> {
  if (!userId) return;
  await storage.removeItem(assistantChatStorageKey(userId));
}
