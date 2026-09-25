import type { DashboardLowStockItem, Producto } from "../../../shared/types/domain";
import type { RegistroProductoParsed } from "../api/voiceRegistrationService";

/**
 * Chat conversacional del asistente con sesiones de vida corta.
 *
 * Cada mensaje del usuario abre (o reutiliza) una sesión activa con un
 * objetivo: vender, consultar o dar de alta. La sesión muere pronto:
 * - venta → `completada` al registrarse, `cancelada` al corregir/cancelar.
 * - consulta/registro → `completada` al responder (no hay nada que confirmar).
 * - aclaración → sigue `activa` hasta que el usuario corrija o cancele.
 *
 * Las sesiones completadas/canceladas son de solo lectura (historial).
 * Todo es puro y testeable: los ids y timestamps los provee quien despacha.
 */

export type ChatTone = "info" | "success" | "warning" | "error";

/** De dónde viene una desambiguación: qué hacer con el producto elegido. */
export type IntentoDesambiguacion =
  | { accion: "venta"; cantidad: number }
  | { accion: "consulta_stock"; sucursal?: string }
  | { accion: "consulta_kardex"; sucursal?: string; tipo?: "entrada" | "salida" | "todas" };

export interface StockRow {
  sucursal: string;
  cantidad: number;
}

export type ChatAttachment =
  | { kind: "candidatos"; texto: string; intento: IntentoDesambiguacion; candidatos: Producto[]; resolved?: boolean }
  | {
      kind: "confirmacion-venta";
      lines: Array<{ producto_id: number; nombre: string; cantidad: number; precio: number }>;
    }
  | { kind: "registro-producto"; datos: RegistroProductoParsed; branchId: number; branchName: string }
  | { kind: "consulta-stock"; productoNombre: string; filas: StockRow[]; total: number }
  | { kind: "consulta-ventas"; totalVentas: number; cantidadVentas: number; periodo?: "hoy" | "semana" | "mes" | "dia"; diasAtras?: number }
  | {
      kind: "consulta-rotacion";
      dias: number;
      totalUnidades: number;
      totalIngresos: number;
      capitalInmovilizado: number;
      items: Array<{ nombre: string; codigo: string; unidadesVendidas: number; stockActual: number; clasificacion: string }>;
      insights: Array<{ titulo: string; descripcion: string }>;
    }
  | {
      kind: "consulta-kardex";
      productoNombre?: string;
      tipoMovimiento: "entrada" | "salida" | "todas";
      movimientos: Array<{ fecha: string; productoNombre: string; productoCodigo: string; tipo: string; cantidad: number; saldoResultante?: number }>;
      resumen: { entradas: number; salidas: number; transferencias: number; total: number };
    }
  | { kind: "busqueda-productos"; consulta: string; productos: Producto[] }
  | { kind: "stock-bajo"; productos: DashboardLowStockItem[] }
  | { kind: "lista-inventario"; minStock: number; filas: Array<{ nombre: string; codigo: string; cantidad: number }> };

export interface ChatMessage {
  id: string;
  role: "usuario" | "asistente";
  texto: string;
  tone?: ChatTone;
  attachment?: ChatAttachment;
  thoughts?: string[];
  durationMs?: number;
}

export type ObjetivoSesion = "venta" | "consulta" | "registro" | "indefinido";
export type EstadoSesion = "activa" | "completada" | "cancelada";

export interface ChatSession {
  id: string;
  objetivo: ObjetivoSesion;
  estado: EstadoSesion;
  /** Resumen de una línea para el historial ("Venta 2× Jean Mom Fit · Comercio"). */
  resumen: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChatState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  messages: Record<string, ChatMessage[]>;
}

/** In-memory limits mirror persisted history limits to keep a long-lived chat finite. */
export const MAX_CHAT_SESSIONS = 20;
export const MAX_CHAT_MESSAGES = 30;

export type ChatAction =
  | { type: "nueva-sesion"; session: ChatSession }
  | { type: "fijar-objetivo"; sessionId: string; objetivo: ObjetivoSesion; updatedAt: number }
  | { type: "fijar-resumen"; sessionId: string; resumen: string; updatedAt: number }
  | { type: "agregar-mensaje"; sessionId: string; message: ChatMessage; updatedAt: number }
  | {
      type: "actualizar-mensaje";
      sessionId: string;
      messageId: string;
      patch: Partial<Pick<ChatMessage, "texto" | "attachment" | "tone">>;
      updatedAt: number;
    }
  | { type: "completar-sesion"; sessionId: string; resumen: string; updatedAt: number }
  | { type: "cancelar-sesion"; sessionId: string; updatedAt: number }
  | { type: "reanudar-sesion"; sessionId: string; updatedAt: number }
  | { type: "eliminar-sesion"; sessionId: string }
  | { type: "restaurar-sesion"; session: ChatSession; messages: ChatMessage[] }
  | { type: "reemplazar-estado"; state: ChatState };

export const chatInicial: ChatState = { sessions: [], activeSessionId: null, messages: {} };

function limitarSesiones(sessions: ChatSession[], messages: Record<string, ChatMessage[]>): Pick<ChatState, "sessions" | "messages"> {
  if (sessions.length <= MAX_CHAT_SESSIONS) return { sessions, messages };
  const idsConservados = new Set(
    [...sessions]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_CHAT_SESSIONS)
      .map((session) => session.id),
  );
  const mensajesConservados = Object.fromEntries(Object.entries(messages).filter(([sessionId]) => idsConservados.has(sessionId)));
  return { sessions: sessions.filter((session) => idsConservados.has(session.id)), messages: mensajesConservados };
}

function cerrarActiva(state: ChatState, updatedAt: number): ChatSession[] {
  return state.sessions.map((session) =>
    session.id === state.activeSessionId && session.estado === "activa"
      ? { ...session, estado: "cancelada" as EstadoSesion, updatedAt }
      : session,
  );
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "nueva-sesion": {
      if (state.sessions.some((session) => session.id === action.session.id)) return state;
      const bounded = limitarSesiones(
        [...cerrarActiva(state, action.session.createdAt), { ...action.session, estado: "activa" as EstadoSesion }],
        { ...state.messages, [action.session.id]: [] },
      );
      return {
        sessions: bounded.sessions,
        activeSessionId: action.session.id,
        messages: bounded.messages,
      };
    }
    case "fijar-objetivo": {
      const session = state.sessions.find((item) => item.id === action.sessionId);
      if (!session || session.estado !== "activa" || session.objetivo !== "indefinido") return state;
      return {
        ...state,
        sessions: state.sessions.map((item) =>
          item.id === action.sessionId ? { ...item, objetivo: action.objetivo, updatedAt: action.updatedAt } : item,
        ),
      };
    }
    case "fijar-resumen": {
      const session = state.sessions.find((item) => item.id === action.sessionId);
      if (!session) return state;
      return {
        ...state,
        sessions: state.sessions.map((item) =>
          item.id === action.sessionId ? { ...item, resumen: action.resumen, updatedAt: action.updatedAt } : item,
        ),
      };
    }
    case "agregar-mensaje": {
      const session = state.sessions.find((item) => item.id === action.sessionId);
      if (!session || session.estado !== "activa") return state;
      return {
        ...state,
        sessions: state.sessions.map((item) =>
          item.id === action.sessionId ? { ...item, updatedAt: action.updatedAt } : item,
        ),
        messages: {
          ...state.messages,
          [action.sessionId]: [...(state.messages[action.sessionId] ?? []), action.message].slice(-MAX_CHAT_MESSAGES),
        },
      };
    }
    case "actualizar-mensaje": {
      const session = state.sessions.find((item) => item.id === action.sessionId);
      if (!session || session.estado !== "activa") return state;
      const messages = state.messages[action.sessionId];
      if (!messages?.some((message) => message.id === action.messageId)) return state;
      return {
        ...state,
        sessions: state.sessions.map((item) =>
          item.id === action.sessionId ? { ...item, updatedAt: action.updatedAt } : item,
        ),
        messages: {
          ...state.messages,
          [action.sessionId]: messages.map((message) =>
            message.id === action.messageId ? { ...message, ...action.patch } : message,
          ),
        },
      };
    }
    case "completar-sesion": {
      const session = state.sessions.find((item) => item.id === action.sessionId);
      if (!session || session.estado !== "activa") return state;
      return {
        ...state,
        sessions: state.sessions.map((item) =>
          item.id === action.sessionId
            ? { ...item, estado: "completada" as EstadoSesion, resumen: action.resumen, updatedAt: action.updatedAt }
            : item,
        ),
        activeSessionId: state.activeSessionId === action.sessionId ? null : state.activeSessionId,
      };
    }
    case "cancelar-sesion": {
      const session = state.sessions.find((item) => item.id === action.sessionId);
      if (!session || session.estado !== "activa") return state;
      return {
        ...state,
        sessions: state.sessions.map((item) =>
          item.id === action.sessionId
            ? { ...item, estado: "cancelada" as EstadoSesion, updatedAt: action.updatedAt }
            : item,
        ),
        activeSessionId: state.activeSessionId === action.sessionId ? null : state.activeSessionId,
      };
    }
    case "reanudar-sesion": {
      const session = state.sessions.find((item) => item.id === action.sessionId);
      // Solo se reanuda lo no terminado: una completada es historial cerrado.
      if (!session || session.estado === "completada") return state;
      return {
        ...state,
        sessions: cerrarActiva(state, action.updatedAt).map((item) =>
          item.id === action.sessionId
            ? { ...item, estado: "activa" as EstadoSesion, updatedAt: action.updatedAt }
            : item,
        ),
        activeSessionId: action.sessionId,
      };
    }
    case "eliminar-sesion": {
      if (!state.sessions.some((item) => item.id === action.sessionId)) return state;
      const { [action.sessionId]: _borrados, ...restMessages } = state.messages;
      return {
        sessions: state.sessions.filter((item) => item.id !== action.sessionId),
        activeSessionId: state.activeSessionId === action.sessionId ? null : state.activeSessionId,
        messages: restMessages,
      };
    }
    case "restaurar-sesion": {
      if (state.sessions.some((item) => item.id === action.session.id)) return state;
      const bounded = limitarSesiones(
        [...state.sessions, action.session],
        { ...state.messages, [action.session.id]: action.messages.slice(-MAX_CHAT_MESSAGES) },
      );
      const eraActiva = action.session.estado === "activa";
      return {
        sessions: bounded.sessions,
        activeSessionId: eraActiva && state.activeSessionId === null && bounded.sessions.some((session) => session.id === action.session.id) ? action.session.id : state.activeSessionId,
        messages: bounded.messages,
      };
    }
    case "reemplazar-estado":
      return action.state;
  }
}

/** Objetivo inicial según lo que entendió la IA del primer mensaje. */
export function objetivoDeResultado(
  tipo: "venta" | "consulta_stock" | "consulta_ventas" | "registro_producto" | "aclaracion" | "desambiguacion",
): ObjetivoSesion {
  if (tipo === "venta") return "venta";
  if (tipo === "consulta_stock" || tipo === "consulta_ventas") return "consulta";
  if (tipo === "registro_producto") return "registro";
  return "indefinido";
}
