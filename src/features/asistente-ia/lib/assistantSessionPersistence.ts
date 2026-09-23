import {
  MAX_CHAT_MESSAGES,
  MAX_CHAT_SESSIONS,
  type ChatAttachment,
  type ChatMessage,
  type ChatSession,
  type ChatState,
  type ChatTone,
  type EstadoSesion,
  type ObjetivoSesion,
} from "./chatSession";

export const MAX_STORED_SESSIONS = MAX_CHAT_SESSIONS;
export const MAX_STORED_MESSAGES = MAX_CHAT_MESSAGES;
const MAX_MESSAGE_TEXT_LENGTH = 1200;
const MAX_STORED_ATTACHMENT_ROWS = 24;
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

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
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

function parseStockRow(value: unknown): { sucursal: string; cantidad: number } | null {
  if (!isRecord(value)) return null;
  const sucursal = asNonEmptyString(value.sucursal);
  const cantidad = asFiniteNumber(value.cantidad);
  if (!sucursal || cantidad === null) return null;
  return { sucursal, cantidad };
}

function parseInventoryRow(value: unknown): { nombre: string; codigo: string; cantidad: number } | null {
  if (!isRecord(value)) return null;
  const nombre = asNonEmptyString(value.nombre);
  const codigo = asNonEmptyString(value.codigo);
  const cantidad = asFiniteNumber(value.cantidad);
  if (!nombre || !codigo || cantidad === null) return null;
  return { nombre, codigo, cantidad };
}

function parseProductoPreview(value: unknown) {
  if (!isRecord(value)) return null;
  const id = asFiniteNumber(value.id);
  const nombre = asNonEmptyString(value.nombre);
  const codigo = asNonEmptyString(value.codigo);
  const categoria = asNonEmptyString(value.categoria) ?? "";
  const precio = asFiniteNumber(value.precio);
  const cantidad = asFiniteNumber(value.cantidad) ?? 0;
  if (id === null || !nombre || !codigo || precio === null) return null;
  return { id, nombre, codigo, categoria, precio, cantidad };
}

function parseLowStockItem(value: unknown) {
  if (!isRecord(value) || !isRecord(value.producto) || !isRecord(value.sucursal)) return null;
  const id = asFiniteNumber(value.id);
  const productoId = asFiniteNumber(value.producto_id);
  const sucursalId = asFiniteNumber(value.sucursal_id);
  const cantidad = asFiniteNumber(value.cantidad);
  const threshold = asFiniteNumber(value.threshold) ?? 0;
  const productoNombre = asNonEmptyString(value.producto.nombre);
  const productoCodigo = asNonEmptyString(value.producto.codigo);
  const sucursalNombre = asNonEmptyString(value.sucursal.nombre);
  const productoInnerId = asFiniteNumber(value.producto.id);
  const sucursalInnerId = asFiniteNumber(value.sucursal.id);
  if (
    id === null
    || productoId === null
    || sucursalId === null
    || cantidad === null
    || !productoNombre
    || !productoCodigo
    || !sucursalNombre
    || productoInnerId === null
    || sucursalInnerId === null
  ) {
    return null;
  }
  return {
    id,
    producto_id: productoId,
    sucursal_id: sucursalId,
    cantidad,
    threshold,
    producto: { id: productoInnerId, nombre: productoNombre, codigo: productoCodigo },
    sucursal: { id: sucursalInnerId, nombre: sucursalNombre },
  };
}

/** Read-only query cards stay in history. Action cards (confirm sale / register / pick) do not. */
function persistableAttachment(attachment: ChatAttachment | undefined): ChatAttachment | undefined {
  if (!attachment) return undefined;
  if (attachment.kind === "consulta-stock") {
    return { ...attachment, filas: attachment.filas.slice(0, MAX_STORED_ATTACHMENT_ROWS) };
  }
  if (attachment.kind === "consulta-ventas") return attachment;
  if (attachment.kind === "busqueda-productos") {
    return { ...attachment, productos: attachment.productos.slice(0, MAX_STORED_ATTACHMENT_ROWS) };
  }
  if (attachment.kind === "stock-bajo") {
    return { ...attachment, productos: attachment.productos.slice(0, MAX_STORED_ATTACHMENT_ROWS) };
  }
  if (attachment.kind === "lista-inventario") {
    return { ...attachment, filas: attachment.filas.slice(0, MAX_STORED_ATTACHMENT_ROWS) };
  }
  return undefined;
}

function parseDisplayAttachment(value: unknown): ChatAttachment | undefined {
  if (!isRecord(value) || typeof value.kind !== "string") return undefined;
  if (value.kind === "consulta-stock") {
    const productoNombre = asNonEmptyString(value.productoNombre);
    const total = asFiniteNumber(value.total);
    if (!productoNombre || total === null || !Array.isArray(value.filas)) return undefined;
    const filas = value.filas.map(parseStockRow).filter((row): row is NonNullable<typeof row> => row !== null);
    return { kind: "consulta-stock", productoNombre, filas: filas.slice(0, MAX_STORED_ATTACHMENT_ROWS), total };
  }
  if (value.kind === "consulta-ventas") {
    const totalVentas = asFiniteNumber(value.totalVentas);
    const cantidadVentas = asFiniteNumber(value.cantidadVentas);
    if (totalVentas === null || cantidadVentas === null) return undefined;
    return { kind: "consulta-ventas", totalVentas, cantidadVentas };
  }
  if (value.kind === "busqueda-productos") {
    const consulta = asNonEmptyString(value.consulta);
    if (!consulta || !Array.isArray(value.productos)) return undefined;
    const productos = value.productos
      .map(parseProductoPreview)
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .slice(0, MAX_STORED_ATTACHMENT_ROWS);
    return { kind: "busqueda-productos", consulta, productos };
  }
  if (value.kind === "stock-bajo") {
    if (!Array.isArray(value.productos)) return undefined;
    const productos = value.productos
      .map(parseLowStockItem)
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .slice(0, MAX_STORED_ATTACHMENT_ROWS);
    return { kind: "stock-bajo", productos };
  }
  if (value.kind === "lista-inventario") {
    const minStock = asFiniteNumber(value.minStock) ?? 0;
    if (!Array.isArray(value.filas)) return undefined;
    const filas = value.filas
      .map(parseInventoryRow)
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .slice(0, MAX_STORED_ATTACHMENT_ROWS);
    return { kind: "lista-inventario", minStock, filas };
  }
  return undefined;
}

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
  const attachment = parseDisplayAttachment(value.attachment);
  if (attachment) message.attachment = attachment;
  return message;
}

function persistableMessage(message: ChatMessage): ChatMessage {
  const attachment = persistableAttachment(message.attachment);
  const next: ChatMessage = {
    ...message,
    texto: message.texto.slice(0, MAX_MESSAGE_TEXT_LENGTH),
  };
  if (message.thoughts) {
    next.thoughts = message.thoughts.filter((thought) => typeof thought === "string").slice(0, 8);
  }
  if (attachment) next.attachment = attachment;
  else delete next.attachment;
  return next;
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
