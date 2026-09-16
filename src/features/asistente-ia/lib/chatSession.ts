import type { Producto } from "../../../shared/types/domain";

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
  | { accion: "consulta_stock"; sucursal?: string };

export interface StockRow {
  sucursal: string;
  cantidad: number;
}

export type ChatAttachment =
  | { kind: "candidatos"; texto: string; intento: IntentoDesambiguacion; candidatos: Producto[] }
  | { kind: "confirmacion-venta" }
  | { kind: "consulta-stock"; productoNombre: string; filas: StockRow[]; total: number }
  | { kind: "consulta-ventas"; totalVentas: number; cantidadVentas: number };

export interface ChatMessage {
  id: string;
  role: "usuario" | "asistente";
  texto: string;
  tone?: ChatTone;
  attachment?: ChatAttachment;
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

export type ChatAction =
  | { type: "nueva-sesion"; session: ChatSession }
  | { type: "fijar-objetivo"; sessionId: string; objetivo: ObjetivoSesion; updatedAt: number }
  | { type: "agregar-mensaje"; sessionId: string; message: ChatMessage; updatedAt: number }
  | { type: "completar-sesion"; sessionId: string; resumen: string; updatedAt: number }
  | { type: "cancelar-sesion"; sessionId: string; updatedAt: number }
  | { type: "reanudar-sesion"; sessionId: string; updatedAt: number }
  | { type: "eliminar-sesion"; sessionId: string }
  | { type: "restaurar-sesion"; session: ChatSession; messages: ChatMessage[] };

export const chatInicial: ChatState = { sessions: [], activeSessionId: null, messages: {} };

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
      return {
        sessions: [...cerrarActiva(state, action.session.createdAt), { ...action.session, estado: "activa" as EstadoSesion }],
        activeSessionId: action.session.id,
        messages: { ...state.messages, [action.session.id]: [] },
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
          [action.sessionId]: [...(state.messages[action.sessionId] ?? []), action.message],
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
      const eraActiva = action.session.estado === "activa";
      return {
        sessions: [...state.sessions, action.session],
        activeSessionId: eraActiva && state.activeSessionId === null ? action.session.id : state.activeSessionId,
        messages: { ...state.messages, [action.session.id]: action.messages },
      };
    }
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
