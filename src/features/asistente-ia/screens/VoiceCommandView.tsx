import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Button, IconButton, Snackbar, Text } from "react-native-paper";
import { Menu, Plus, Sparkles } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { BranchSelect } from "../../../shared/components/BranchSelect";
import { useConfirm } from "../../../shared/components/ConfirmDialog";
import { useAuth } from "../../auth/hooks/useAuth";
import { buildAssistantScopeContext, canExecuteAssistantWrite } from "../lib/assistantAuthorization";
import { emptyAssistantChat, hydrateAssistantChat, saveAssistantChat } from "../lib/assistantSessionPersistence";
import { getPreferredMode, setPreferredMode, type PreferredMode } from "../../../shared/lib/secureKeyStore";
import { colors, spacing } from "../../../shared/theme";
import { formatearPrecio } from "../../../shared/lib/utils";
import { formatSalesPeriodLabel } from "../../dashboard/api/dashboardApi";
import { useSucursales } from "../../../shared/hooks/useSucursales";
import { useActiveBranch } from "../../../shared/hooks/useActiveBranch";
import { useStockMultiSucursal } from "../../inventario/hooks/useStockMultiSucursal";
import { useProcesarVenta } from "../../ventas/hooks/useProcesarVenta";
import { useRegistrarProducto } from "../../productos/hooks/useRegistrarProducto";
import { useVoiceCommand } from "../hooks/useVoiceCommand";
import {
  buildRegistroProductoConfirmInput,
  esCancelacionRegistroProducto,
  esConfirmacionRegistroProducto,
  mergeRegistroProductoParsed,
} from "../lib/productRegistrationFlow";
import { aggregateVoiceLines, mergeConfirmationLines } from "../lib/voiceLines";
import {
  chatInicial,
  chatReducer,
  type ChatMessage,
  type ChatSession,
  type IntentoDesambiguacion,
  type ObjetivoSesion,
} from "../lib/chatSession";
import {
  consultarKardexDe,
  consultarStockDe,
  type LineaInterpretada,
  type ResultadoInterpretacion,
} from "../api/voiceCommandApi";
import { assistantUserFacingError, isRetryableAssistantResult, runAssistantTurn, scannedBarcodeMessage } from "../api/assistantAgent";
import {
  AssistantChatRequestLifecycle,
  isAssistantFailedDraftRetry,
  type AssistantFailedDraft,
} from "../lib/assistantChatRequestLifecycle";
import type { Producto } from "../../../shared/types/domain";
import type { RegistroProductoParsed } from "../api/voiceRegistrationService";
import { ChatMessageBubble } from "../components/ChatMessageBubble";
import { CandidatePicker } from "../components/CandidatePicker";
import { SaleConfirmationCard, type VentaConfirmationLine } from "../components/SaleConfirmationCard";
import { ProductRegistrationCard } from "../components/ProductRegistrationCard";
import { ThinkingTrace } from "../components/ThinkingTrace";
import { ChatComposer } from "../components/ChatComposer";
import { SessionBar } from "../components/SessionBar";
import { SessionDrawer } from "../components/SessionDrawer";
import { VoiceModeOverlay } from "../components/VoiceModeOverlay";
import { establecerRegistroPendiente } from "../../productos/lib/pendienteRegistro";
import { establecerLotePendiente } from "../../ventas/lib/pendienteVenta";

type LineaConStock = LineaInterpretada & { available: number };

/**
 * Asistente conversacional en vista propia (ya no modal): chat estilo
 * ChatGPT/Claude con sesiones de vida corta. Cada sesión persigue una
 * acción y muere al completarla; el historial queda visible arriba.
 */
export function VoiceCommandView() {
  const voice = useVoiceCommand();
  const requestLifecycleRef = useRef(new AssistantChatRequestLifecycle());
  const transcriptRef = useRef(voice.transcript);
  transcriptRef.current = voice.transcript;
  const [streamDraft, setStreamDraft] = useState<{ text: string; thoughts: string[] } | null>(null);
  const [failedDraft, setFailedDraft] = useState<AssistantFailedDraft | null>(null);
  const { profile } = useAuth();
  const branches = useSucursales();
  const stock = useStockMultiSucursal();
  const sale = useProcesarVenta();
  const productMutation = useRegistrarProducto();
  const { requestConfirm, dialog: confirmDialog } = useConfirm();
  const [mode, setMode] = useState<PreferredMode>("auto");
  const cargarModo = useCallback(() => {
    void getPreferredMode().then(setMode).catch(() => undefined);
  }, []);
  useEffect(() => {
    cargarModo();
  }, [cargarModo]);
  useFocusEffect(
    useCallback(() => {
      cargarModo();
      return () => {
        requestLifecycleRef.current.cancel();
        setStreamDraft(null);
      };
    }, [cargarModo]),
  );
  const cambiarModo = (next: PreferredMode) => {
    setMode(next);
    void setPreferredMode(next).catch(() => undefined);
  };
  const primerNombre = (profile?.nombre ?? profile?.email ?? "").split(" ")[0];
  const [chat, dispatch] = useReducer(chatReducer, chatInicial);
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const { activeBranchId, canChangeBranch, selectBranch } = useActiveBranch();
  const [branchId, setBranchId] = useState<number | null>(null);

  useEffect(() => {
    if (activeBranchId !== null) setBranchId(activeBranchId);
  }, [activeBranchId]);
  const [pendingConfirmation, setPendingConfirmation] = useState<VentaConfirmationLine[] | null>(null);
  const [pendingConfirmationMessageId, setPendingConfirmationMessageId] = useState<string | null>(null);
  const pendingConfirmationMessageIdRef = useRef<string | null>(null);
  const [pendingRegistration, setPendingRegistration] = useState<RegistroProductoParsed | null>(null);
  const [pendingRegistrationMessageId, setPendingRegistrationMessageId] = useState<string | null>(null);
  const pendingRegistrationMessageIdRef = useRef<string | null>(null);
  const pendingRegistrationRef = useRef<RegistroProductoParsed | null>(null);
  const [shortage, setShortage] = useState<{ messageId: string; lines: LineaConStock[] } | null>(null);
  const [papelera, setPapelera] = useState<{ session: ChatSession; messages: ChatMessage[] } | null>(null);
  const [lastLines, setLastLines] = useState<LineaInterpretada[]>([]);
  const idRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistedUserRef = useRef<string | null>(null);
  const hydratedUserRef = useRef<string | null>(null);
  const assistantScope = useMemo(
    () => buildAssistantScopeContext(profile, branches.data ?? [], branchId),
    [branchId, branches.data, profile],
  );
  const allowedBranches = useMemo(
    () => (branches.data ?? []).filter((branch) => assistantScope?.allowedBranchIds.includes(branch.id) ?? false),
    [assistantScope?.allowedBranchIds, branches.data],
  );
  const activeBranch = assistantScope?.activeBranchId ?? null;
  const branchName = assistantScope?.activeBranchName ?? "";
  const canWriteProducts = canExecuteAssistantWrite(profile, "products.write", activeBranch);
  const userId = profile?.id ?? null;

  const enqueuePersistence = useCallback((operation: () => Promise<void>) => {
    const queued = persistenceQueueRef.current.then(operation, operation);
    persistenceQueueRef.current = queued.catch(() => undefined);
    return queued;
  }, []);

  useEffect(() => {
    pendingRegistrationRef.current = pendingRegistration;
  }, [pendingRegistration]);

  useEffect(() => {
    let cancelled = false;
    persistedUserRef.current = userId;
    hydratedUserRef.current = null;
    dispatch({ type: "reemplazar-estado", state: emptyAssistantChat() });
    setInspectingId(null);
    setFailedDraft(null);
    transcriptRef.current = "";
    voice.setTranscript("");
    setStreamDraft(null);
    pendingConfirmationMessageIdRef.current = null;
    setPendingConfirmation(null);
    setPendingConfirmationMessageId(null);
    setPendingRegistration(null);
    setPendingRegistrationMessageId(null);
    pendingRegistrationMessageIdRef.current = null;
    pendingRegistrationRef.current = null;
    setShortage(null);
    setLastLines([]);
    if (!userId) {
      return () => {
        cancelled = true;
        requestLifecycleRef.current.cancel();
      };
    }

    void enqueuePersistence(async () => {
      const restored = await hydrateAssistantChat(AsyncStorage, userId);
      if (cancelled || persistedUserRef.current !== userId) return;
      hydratedUserRef.current = userId;
      dispatch({ type: "reemplazar-estado", state: restored });
    });
    return () => {
      cancelled = true;
      requestLifecycleRef.current.cancel();
    };
  }, [enqueuePersistence, userId]);

  useEffect(() => {
    if (!userId || hydratedUserRef.current !== userId) return;
    const snapshot = chat;
    void enqueuePersistence(async () => {
      if (persistedUserRef.current !== userId || hydratedUserRef.current !== userId) return;
      await saveAssistantChat(AsyncStorage, userId, snapshot);
    });
  }, [chat, enqueuePersistence, userId]);

  const nextId = (prefix: string) => {
    idRef.current += 1;
    return `${prefix}-${Date.now()}-${idRef.current}`;
  };
  const ahora = () => Date.now();

  const stockLocalPorProducto = useMemo(() => {
    const map: Record<number, number> = {};
    for (const item of stock.data ?? []) {
      if (item.sucursal_id === activeBranch) map[item.producto_id] = item.cantidad;
    }
    return map;
  }, [stock.data, activeBranch]);

  const contextualSuggestions = useMemo(() => {
    if (lastLines[0]?.producto) {
      const p = lastLines[0].producto;
      return [
        `Vender 1 ${p.nombre}`,
        `¿Cuánto stock hay de ${p.codigo}?`,
        `¿Cuánto queda en Central?`,
        `¿Cuánto se vendió hoy?`,
      ];
    }
    return undefined;
  }, [lastLines]);

  const scrollToEnd = () => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

  /** Sesión activa o una nueva (objetivo indefinido hasta interpretar). */
  const asegurarSesion = (): string => {
    const active = chat.sessions.find((s) => s.id === chat.activeSessionId);
    if (active && active.estado === "activa") return active.id;

    const session: ChatSession = {
      id: nextId("sesion"),
      objetivo: "indefinido",
      estado: "activa",
      resumen: null,
      createdAt: ahora(),
      updatedAt: ahora(),
    };
    dispatch({ type: "nueva-sesion", session });
    return session.id;
  };

  const agregar = (sessionId: string, message: Omit<ChatMessage, "id">) => {
    dispatch({ type: "agregar-mensaje", sessionId, message: { ...message, id: nextId("msg") }, updatedAt: ahora() });
    scrollToEnd();
  };

  const fijarObjetivo = (sessionId: string, objetivo: ObjetivoSesion) => {
    if (objetivo !== "indefinido") dispatch({ type: "fijar-objetivo", sessionId, objetivo, updatedAt: ahora() });
  };

  const limpiarPropuestaRegistro = () => {
    setPendingRegistration(null);
    setPendingRegistrationMessageId(null);
    pendingRegistrationMessageIdRef.current = null;
    pendingRegistrationRef.current = null;
  };

  const limpiarCarritoVenta = () => {
    setPendingConfirmation(null);
    setPendingConfirmationMessageId(null);
    pendingConfirmationMessageIdRef.current = null;
  };

  const publicarConfirmacionVenta = (
    sessionId: string,
    lines: VentaConfirmationLine[],
    options?: { thoughts?: string[]; durationMs?: number; fueCorreccion?: boolean },
  ) => {
    const productoCount = lines.length;
    const unidadCount = lines.reduce((sum, line) => sum + line.cantidad, 0);
    const detalle = lines.map((line) => `${line.cantidad} × ${line.nombre}`).join(", ");
    const texto =
      productoCount > 1
        ? `Carrito con ${productoCount} productos (${unidadCount} uds) en ${branchName}: ${detalle}. Confirmá, agregá otro o cargá al carrito:`
        : options?.fueCorreccion
          ? `Tomé tu corrección: ${detalle}. Podés confirmar, agregar otro producto o cargar al carrito.`
          : `Entendí esto para ${branchName}. Podés confirmar la venta, agregar otro producto o cargarla al carrito:`;
    const attachment = { kind: "confirmacion-venta" as const, lines };
    const activeMessageId = pendingConfirmationMessageIdRef.current;
    if (activeMessageId) {
      dispatch({
        type: "actualizar-mensaje",
        sessionId,
        messageId: activeMessageId,
        patch: { texto, attachment, tone: "info" },
        updatedAt: ahora(),
      });
    } else {
      const messageId = nextId("msg");
      pendingConfirmationMessageIdRef.current = messageId;
      setPendingConfirmationMessageId(messageId);
      dispatch({
        type: "agregar-mensaje",
        sessionId,
        message: {
          id: messageId,
          role: "asistente",
          tone: "info",
          texto,
          thoughts: options?.thoughts,
          durationMs: options?.durationMs,
          attachment,
        },
        updatedAt: ahora(),
      });
    }
    scrollToEnd();
  };

  const publicarPropuestaRegistro = (
    sessionId: string,
    datos: RegistroProductoParsed,
    options?: { mensaje: string; thoughts?: string[]; durationMs?: number },
  ) => {
    if (activeBranch === null) return;
    const merged = mergeRegistroProductoParsed(pendingRegistrationRef.current, datos);
    pendingRegistrationRef.current = merged;
    setPendingRegistration(merged);
    const attachment = {
      kind: "registro-producto" as const,
      datos: merged,
      branchId: activeBranch,
      branchName,
    };
    const activeMessageId = pendingRegistrationMessageIdRef.current;
    if (activeMessageId) {
      dispatch({
        type: "actualizar-mensaje",
        sessionId,
        messageId: activeMessageId,
        patch: {
          texto: options?.mensaje ?? "Revisá y confirmá el alta del producto en la tarjeta.",
          attachment,
          tone: "info",
          thoughts: options?.thoughts,
          durationMs: options?.durationMs,
        },
        updatedAt: ahora(),
      });
    } else {
      const messageId = nextId("msg");
      pendingRegistrationMessageIdRef.current = messageId;
      setPendingRegistrationMessageId(messageId);
      dispatch({
        type: "agregar-mensaje",
        sessionId,
        message: {
          id: messageId,
          role: "asistente",
          tone: "info",
          texto: options?.mensaje ?? "Revisá y confirmá el alta del producto en la tarjeta.",
          thoughts: options?.thoughts,
          durationMs: options?.durationMs,
          attachment,
        },
        updatedAt: ahora(),
      });
    }
    scrollToEnd();
  };

  const procesarLineasVenta = (
    sessionId: string,
    lineas: LineaInterpretada[],
    fueCorreccion = false,
    thoughts?: string[],
    durationMs?: number,
  ) => {
    if (activeBranch === null) {
      agregar(sessionId, { role: "asistente", tone: "error", texto: "No hay sucursal activa para registrar la venta." });
      return;
    }
    setLastLines(lineas);
    let agregadas: LineaInterpretada[];
    try {
      agregadas = aggregateVoiceLines(lineas);
    } catch (error) {
      agregar(sessionId, {
        role: "asistente",
        tone: "warning",
        texto: error instanceof Error ? error.message : "Líneas ambiguas.",
      });
      return;
    }
    const withStock: LineaConStock[] = agregadas.map((line) => ({
      ...line,
      available: stock.data?.find((item) => item.sucursal_id === activeBranch && item.producto_id === line.producto.id)?.cantidad ?? 0,
    }));
    const faltantes = withStock.filter((line) => line.available < line.cantidadSolicitada);
    if (faltantes.length > 0) {
      const detail = faltantes
        .map((line) => `• ${line.producto.nombre}: pediste ${line.cantidadSolicitada}, hay ${line.available}.`)
        .join("\n");
      const messageId = nextId("msg");
      dispatch({
        type: "agregar-mensaje",
        sessionId,
        message: {
          id: messageId,
          role: "asistente",
          tone: "warning",
          texto: `No alcanza el stock en ${branchName}:\n${detail}\n¿Ajustamos a lo disponible o corregís la cantidad?`,
          thoughts: [
            `Verificación de stock en ${branchName}`,
            `Insuficiente en ${faltantes.length} producto(s)`,
            "Bloqueo preventivo de sobreventa activado (RN-01)",
          ],
        },
        updatedAt: ahora(),
      });
      setShortage({ messageId, lines: withStock });
      scrollToEnd();
      return;
    }
    let confirmationLines: VentaConfirmationLine[];
    try {
      confirmationLines = mergeConfirmationLines(
        pendingConfirmation ?? [],
        withStock.map((line) => ({
          producto_id: line.producto.id,
          nombre: line.producto.nombre,
          cantidad: line.cantidadSolicitada,
          precio: line.producto.precio,
        })),
      );
    } catch (error) {
      agregar(sessionId, {
        role: "asistente",
        tone: "warning",
        texto: error instanceof Error ? error.message : "No pude combinar los productos del carrito.",
      });
      return;
    }
    setPendingConfirmation(confirmationLines);
    fijarObjetivo(sessionId, "venta");
    publicarConfirmacionVenta(sessionId, confirmationLines, { thoughts, durationMs, fueCorreccion });
  };

  const aplicarMaximoDisponible = (sessionId: string) => {
    if (!shortage) return;
    const capped = shortage.lines
      .map((line) => ({ ...line, cantidadSolicitada: Math.min(line.cantidadSolicitada, line.available) }))
      .filter((line) => line.cantidadSolicitada > 0);
    setShortage(null);
    if (capped.length === 0) {
      agregar(sessionId, { role: "asistente", tone: "info", texto: `Sin stock disponible en ${branchName}.` });
      return;
    }
    const confirmationLines = capped.map((line) => ({
      producto_id: line.producto.id,
      nombre: line.producto.nombre,
      cantidad: line.cantidadSolicitada,
      precio: line.producto.precio,
    }));
    setPendingConfirmation(confirmationLines);
    publicarConfirmacionVenta(sessionId, confirmationLines, { fueCorreccion: true });
  };

  const elegirCandidato = async (
    sessionId: string,
    producto: Producto,
    intento: IntentoDesambiguacion,
    sourceMessageId?: string,
  ) => {
    agregar(sessionId, { role: "usuario", texto: `Elegí ${producto.nombre} (${producto.codigo})` });
    if (sourceMessageId) {
      const source = chat.messages[sessionId]?.find((message) => message.id === sourceMessageId);
      if (source?.attachment?.kind === "candidatos") {
        dispatch({
          type: "actualizar-mensaje",
          sessionId,
          messageId: sourceMessageId,
          patch: { attachment: { ...source.attachment, resolved: true } },
          updatedAt: ahora(),
        });
      }
    }
    if (intento.accion === "venta") {
      procesarLineasVenta(
        sessionId,
        [{ producto, cantidadSolicitada: intento.cantidad }],
        false,
        [`Producto seleccionado: ${producto.nombre} (${producto.codigo})`],
        150,
      );
      return;
    }
    if (intento.accion === "consulta_kardex") {
      if (!assistantScope) return;
      try {
        const consulta = await consultarKardexDe(
          producto,
          { sucursal: intento.sucursal, tipo: intento.tipo },
          undefined,
          assistantScope,
        );
        agregar(sessionId, {
          role: "asistente",
          tone: consulta.resumen.total ? "success" : "info",
          texto: consulta.mensaje,
          thoughts: [`Desambiguado a: ${producto.nombre} (${producto.codigo})`, "Consultando kardex del producto"],
          durationMs: 200,
          attachment: {
            kind: "consulta-kardex",
            productoNombre: consulta.productoNombre,
            tipoMovimiento: consulta.tipoMovimiento,
            movimientos: consulta.movimientos,
            resumen: consulta.resumen,
          },
        });
        dispatch({
          type: "fijar-resumen",
          sessionId,
          resumen: `Kardex ${producto.nombre}: ${consulta.resumen.total} mov.`,
          updatedAt: ahora(),
        });
      } catch (error) {
        agregar(sessionId, {
          role: "asistente",
          tone: "error",
          texto: error instanceof Error ? error.message : "No se pudo consultar el kardex.",
        });
      }
      return;
    }
    try {
      const consulta = await consultarStockDe(producto, intento.sucursal, undefined, assistantScope?.allowedBranchIds);
      agregar(sessionId, {
        role: "asistente",
        tone: "success",
        texto: consulta.mensaje,
        thoughts: [
          `Desambiguado a: ${producto.nombre} (${producto.codigo})`,
          `Consultado stock en sucursales (${consulta.stockTotal} unidades)`,
        ],
        durationMs: 200,
        attachment: {
          kind: "consulta-stock",
          productoNombre: producto.nombre,
          filas: consulta.desglose.map((row) => ({ sucursal: row.sucursalNombre, cantidad: row.cantidad })),
          total: consulta.stockTotal,
        },
      });
      setLastLines([{ producto, cantidadSolicitada: 1 }]);
      dispatch({ type: "fijar-resumen", sessionId, resumen: `Stock ${producto.nombre} (${consulta.stockTotal})`, updatedAt: ahora() });
    } catch (error) {
      agregar(sessionId, {
        role: "asistente",
        tone: "error",
        texto: error instanceof Error ? error.message : "No se pudo consultar el stock.",
      });
    }
  };

  const enviar = async (textoForzado?: string) => {
    const texto = (textoForzado ?? voice.transcript).trim();
    if (!texto || voice.interpreting || sale.isPending) return;
    const request = requestLifecycleRef.current.begin(asegurarSesion);
    if (!request) return;
    const sessionId = request.sessionId;
    const retryDraft = isAssistantFailedDraftRetry(failedDraft, sessionId, texto) ? failedDraft : null;
    if (voice.recording) voice.stop();
    setInspectingId(null);
    if (!retryDraft) {
      setFailedDraft(null);
      agregar(sessionId, { role: "usuario", texto });
    }
    setShortage(null);
    if (pendingRegistrationRef.current && activeBranch !== null) {
      if (esCancelacionRegistroProducto(texto)) {
        limpiarPropuestaRegistro();
        agregar(sessionId, { role: "asistente", tone: "info", texto: "Alta de producto cancelada. Podés dictar otra operación." });
        requestLifecycleRef.current.finish(request);
        return;
      }
      if (esConfirmacionRegistroProducto(texto)) {
        const input = buildRegistroProductoConfirmInput(pendingRegistrationRef.current, activeBranch);
        if (!input) {
          agregar(sessionId, {
            role: "asistente",
            tone: "info",
            texto: "Completá precio y nombre en la tarjeta de alta y tocá «Dar de alta», o dictame los datos que faltan.",
          });
          requestLifecycleRef.current.finish(request);
          return;
        }
        if (!canExecuteAssistantWrite(profile, "products.write", input.sucursal_id)) {
          agregar(sessionId, { role: "asistente", tone: "error", texto: "Tu permiso o sucursal actual ya no permiten registrar este producto." });
          requestLifecycleRef.current.finish(request);
          return;
        }
        confirmarAltaProducto(input);
        requestLifecycleRef.current.finish(request);
        return;
      }
    }
    const startTime = Date.now();
    const activeMessages = chat.messages[sessionId] ?? [];
    const historial = retryDraft?.history ?? activeMessages.map((m) => ({
      role: m.role,
      texto: m.texto,
    }));
    if (!assistantScope) {
      agregar(sessionId, { role: "asistente", tone: "error", texto: "Sin sucursal habilitada para usar el asistente." });
      requestLifecycleRef.current.finish(request);
      return;
    }
    try {
      setStreamDraft({ text: "", thoughts: ["Consultando al proveedor…"] });
      const result: ResultadoInterpretacion = await voice.withInterpreting(() =>
        runAssistantTurn({
          text: texto,
          history: historial,
          scope: assistantScope,
          abortSignal: request.signal,
          onProgress: (progress) => {
            if (requestLifecycleRef.current.isCurrent(request)) setStreamDraft(progress);
          },
        }),
      );
      if (!requestLifecycleRef.current.isCurrent(request)) return;
      const durationMs = Date.now() - startTime;
      if (result.tipo === "aclaracion" && isRetryableAssistantResult(result)) {
        setFailedDraft({ sessionId, text: texto, history: historial });
        agregar(sessionId, {
          role: "asistente",
          tone: "error",
          texto: result.mensaje,
          thoughts: result.pasosPensamiento,
          durationMs,
        });
        return;
      }
      setFailedDraft(null);
      if (transcriptRef.current.trim() === texto) {
        transcriptRef.current = "";
        voice.setTranscript("");
      }
      if (result.tipo === "aclaracion") {
        if (!isRetryableAssistantResult(result)) limpiarCarritoVenta();
        agregar(sessionId, {
          role: "asistente",
          tone: "info",
          texto: result.mensaje,
          thoughts: result.pasosPensamiento,
          durationMs,
        });
        return;
      }
      if (result.tipo === "conversacion") {
        limpiarCarritoVenta();
        agregar(sessionId, {
          role: "asistente",
          tone: "info",
          texto: result.mensaje,
          thoughts: result.pasosPensamiento,
          durationMs,
        });
        return;
      }
      if (result.tipo === "registro_producto") {
        limpiarCarritoVenta();
        if (activeBranch === null) {
          agregar(sessionId, { role: "asistente", tone: "error", texto: "No tenés una sucursal habilitada para registrar productos." });
          return;
        }
        fijarObjetivo(sessionId, "registro");
        publicarPropuestaRegistro(sessionId, result.datos, {
          mensaje: result.mensaje,
          thoughts: result.pasosPensamiento,
          durationMs,
        });
        return;
      }
      if (result.tipo === "buscar_producto") {
        limpiarCarritoVenta();
        fijarObjetivo(sessionId, "consulta");
        agregar(sessionId, {
          role: "asistente",
          tone: "success",
          texto: result.mensaje,
          thoughts: result.pasosPensamiento,
          durationMs,
          attachment: { kind: "busqueda-productos", consulta: result.consulta, productos: result.productos },
        });
        dispatch({ type: "fijar-resumen", sessionId, resumen: `Búsqueda: ${result.consulta}`.slice(0, 80), updatedAt: ahora() });
        return;
      }
      if (result.tipo === "consulta_bajo_stock") {
        limpiarCarritoVenta();
        fijarObjetivo(sessionId, "consulta");
        agregar(sessionId, {
          role: "asistente",
          tone: result.productos.length > 0 ? "warning" : "success",
          texto: result.mensaje,
          thoughts: result.pasosPensamiento,
          durationMs,
          attachment: { kind: "stock-bajo", productos: result.productos },
        });
        dispatch({ type: "fijar-resumen", sessionId, resumen: `Stock bajo: ${result.productos.length} producto(s)`, updatedAt: ahora() });
        return;
      }
      if (result.tipo === "listar_inventario") {
        limpiarCarritoVenta();
        fijarObjetivo(sessionId, "consulta");
        agregar(sessionId, {
          role: "asistente",
          tone: result.productos.length > 0 ? "success" : "info",
          texto: result.mensaje,
          thoughts: result.pasosPensamiento,
          durationMs,
          attachment: {
            kind: "lista-inventario",
            minStock: result.minStock,
            filas: result.productos.map((item) => ({
              nombre: item.nombre,
              codigo: item.codigo,
              cantidad: item.cantidad,
            })),
          },
        });
        dispatch({
          type: "fijar-resumen",
          sessionId,
          resumen: `Inventario: ${result.productos.length} producto(s)`,
          updatedAt: ahora(),
        });
        return;
      }
      if (result.tipo === "consulta_rotacion") {
        limpiarCarritoVenta();
        fijarObjetivo(sessionId, "consulta");
        agregar(sessionId, {
          role: "asistente",
          tone: "success",
          texto: result.mensaje,
          thoughts: result.pasosPensamiento,
          durationMs,
          attachment: {
            kind: "consulta-rotacion",
            dias: result.diasAnalizados,
            totalUnidades: result.totalUnidadesVendidas,
            totalIngresos: result.totalIngresos,
            capitalInmovilizado: result.capitalInmovilizado,
            items: result.items,
            insights: result.insights.map((insight) => ({ titulo: insight.titulo, descripcion: insight.descripcion })),
          },
        });
        dispatch({
          type: "fijar-resumen",
          sessionId,
          resumen: `Rotación ${result.diasAnalizados}d: ${result.totalUnidadesVendidas} u.`,
          updatedAt: ahora(),
        });
        return;
      }
      if (result.tipo === "consulta_kardex") {
        limpiarCarritoVenta();
        fijarObjetivo(sessionId, "consulta");
        agregar(sessionId, {
          role: "asistente",
          tone: result.resumen.total ? "success" : "info",
          texto: result.mensaje,
          thoughts: result.pasosPensamiento,
          durationMs,
          attachment: {
            kind: "consulta-kardex",
            productoNombre: result.productoNombre,
            tipoMovimiento: result.tipoMovimiento,
            movimientos: result.movimientos,
            resumen: result.resumen,
          },
        });
        dispatch({
          type: "fijar-resumen",
          sessionId,
          resumen: result.productoNombre
            ? `Kardex ${result.productoNombre}: ${result.resumen.total} mov.`
            : `Kardex: ${result.resumen.total} mov.`,
          updatedAt: ahora(),
        });
        return;
      }
      if (result.tipo === "consulta_stock" || result.tipo === "consulta_ventas") {
        limpiarCarritoVenta();
        fijarObjetivo(sessionId, "consulta");
        if (result.tipo === "consulta_stock") {
          agregar(sessionId, {
            role: "asistente",
            tone: "success",
            texto: result.mensaje,
            thoughts: result.pasosPensamiento,
            durationMs,
            attachment: {
              kind: "consulta-stock",
              productoNombre: result.producto.nombre,
              filas: result.desglose.map((row) => ({ sucursal: row.sucursalNombre, cantidad: row.cantidad })),
              total: result.stockTotal,
            },
          });
          setLastLines([{ producto: result.producto, cantidadSolicitada: 1 }]);
          dispatch({ type: "fijar-resumen", sessionId, resumen: `Stock ${result.producto.nombre} (${result.stockTotal})`, updatedAt: ahora() });
        } else {
          agregar(sessionId, {
            role: "asistente",
            tone: "success",
            texto: result.mensaje,
            thoughts: result.pasosPensamiento,
            durationMs,
            attachment: {
              kind: "consulta-ventas",
              totalVentas: result.totalVentas,
              cantidadVentas: result.cantidadVentas,
              periodo: result.periodo,
              diasAtras: result.diasAtras,
            },
          });
          dispatch({
            type: "fijar-resumen",
            sessionId,
            resumen: `Ventas ${formatSalesPeriodLabel(result.periodo, result.diasAtras)} ${formatearPrecio(result.totalVentas)}`,
            updatedAt: ahora(),
          });
        }
        return;
      }
      if (result.tipo === "desambiguacion") {
        fijarObjetivo(sessionId, result.intento.accion === "venta" ? "venta" : "consulta");
        agregar(sessionId, {
          role: "asistente",
          tone: "info",
          texto: `Encontré ${result.candidatos.length} opciones para "${result.texto}". Elegí la correcta para seguir:`,
          thoughts: result.pasosPensamiento,
          durationMs,
          attachment: { kind: "candidatos", texto: result.texto, intento: result.intento, candidatos: result.candidatos },
        });
        return;
      }
      fijarObjetivo(sessionId, "venta");
      procesarLineasVenta(sessionId, result.lineas, result.fueCorreccion, result.pasosPensamiento, durationMs);
    } catch (error) {
      if (!requestLifecycleRef.current.isCurrent(request)) return;
      const message = assistantUserFacingError(error);
      setFailedDraft({ sessionId, text: texto, history: historial });
      agregar(sessionId, {
        role: "asistente",
        tone: "error",
        texto: message,
        durationMs: Date.now() - startTime,
      });
    } finally {
      if (requestLifecycleRef.current.finish(request)) setStreamDraft(null);
    }
  };

  const confirmarVenta = () => {
    const sessionId = chat.activeSessionId;
    if (!pendingConfirmation || !sessionId || activeBranch === null || sale.isPending) return;
    if (!canExecuteAssistantWrite(profile, "sales.write", activeBranch)) {
      agregar(sessionId, { role: "asistente", tone: "error", texto: "Tu permiso o sucursal actual ya no permiten registrar esta venta." });
      return;
    }
    sale.mutate(
      {
        sucursal_id: activeBranch,
        metodo_pago: "efectivo",
        productos: pendingConfirmation.map((line) => ({ producto_id: line.producto_id, cantidad: line.cantidad })),
      },
      {
        onSuccess: () => {
          const resumen = `Venta ${pendingConfirmation.map((line) => `${line.cantidad}× ${line.nombre}`).join(", ")} · ${branchName}`;
          setPendingConfirmation(null);
          pendingConfirmationMessageIdRef.current = null;
          setPendingConfirmationMessageId(null);
          setLastLines([]);
          agregar(sessionId, {
            role: "asistente",
            tone: "success",
            texto: `Venta registrada en ${branchName}. ¿Registramos otra? Escribí o dictá la siguiente.`,
            thoughts: [
              `Venta transaccional asentada en sucursal ${branchName}`,
              "Descuento atómico de stock ejecutado (cero sobreventa)",
            ],
          });
          dispatch({ type: "completar-sesion", sessionId, resumen: resumen.slice(0, 80), updatedAt: ahora() });
          voice.setTranscript("");
        },
        onError: (error) => {
          agregar(sessionId, {
            role: "asistente",
            tone: "error",
            texto: `${error instanceof Error ? error.message : "No se pudo registrar la venta."} Revisá el stock e intentá de nuevo.`,
          });
        },
      },
    );
  };

  const cargarAlCarrito = () => {
    const sessionId = chat.activeSessionId;
    if (!pendingConfirmation || !sessionId) return;
    if (!canExecuteAssistantWrite(profile, "sales.write", activeBranch)) {
      agregar(sessionId, { role: "asistente", tone: "error", texto: "Tu permiso o sucursal actual ya no permiten preparar esta venta." });
      return;
    }
    establecerLotePendiente(
      pendingConfirmation.map((line) => ({
        producto: {
          id: line.producto_id,
          nombre: line.nombre,
          codigo: "",
          categoria: "",
          precio: line.precio,
          cantidad: line.cantidad,
        },
        cantidad: line.cantidad,
      })),
    );
    const count = pendingConfirmation.reduce((sum, item) => sum + item.cantidad, 0);
    agregar(sessionId, {
      role: "asistente",
      tone: "success",
      texto: `Cargué ${count} prenda${count === 1 ? "" : "s"} al carrito de ventas en ${branchName}. Redirigiendo a pantalla de cobro...`,
      thoughts: [
        `Lote de ${pendingConfirmation.length} líneas enviado al carrito de ventas`,
        `Sucursal destino: ${branchName}`,
        "Redirigiendo a Punto de Venta...",
      ],
    });
    dispatch({
      type: "completar-sesion",
      sessionId,
      resumen: `Carrito ${count} prendas · ${branchName}`,
      updatedAt: ahora(),
    });
    setPendingConfirmation(null);
    pendingConfirmationMessageIdRef.current = null;
    setPendingConfirmationMessageId(null);
    voice.setTranscript("");
    router.push("/nueva-venta");
  };

  const confirmarAltaProducto = (input: {
    nombre: string;
    codigo: string;
    codigo_barra?: string | null;
    categoria: string;
    precio: number;
    cantidad: number;
    sucursal_id: number;
  }) => {
    const sessionId = chat.activeSessionId;
    if (!sessionId || productMutation.isPending) return;
    if (!canExecuteAssistantWrite(profile, "products.write", input.sucursal_id)) {
      agregar(sessionId, { role: "asistente", tone: "error", texto: "Tu permiso o sucursal actual ya no permiten registrar este producto." });
      return;
    }
    productMutation.mutate(
      {
        nombre: input.nombre,
        codigo: input.codigo,
        codigo_barra: input.codigo_barra ?? null,
        categoria: input.categoria,
        precio: input.precio,
        cantidad: input.cantidad,
        sucursal_id: input.sucursal_id,
      },
      {
        onSuccess: (creado) => {
          limpiarPropuestaRegistro();
          agregar(sessionId, {
            role: "asistente",
            tone: "success",
            texto: `✅ Prenda "${creado.producto.nombre}" (${creado.producto.codigo}) registrada en catálogo con ${creado.cantidad_inicial} unidades iniciales en ${branchName}.`,
            thoughts: [
              "Inserción en base de datos central Supabase exitosa",
              `Asignado stock inicial a sucursal ${branchName}`,
              "Caché de catálogo e inventario invalidada",
            ],
          });
          dispatch({
            type: "completar-sesion",
            sessionId,
            resumen: `Alta ${creado.producto.nombre} · ${creado.producto.codigo}`,
            updatedAt: ahora(),
          });
        },
        onError: (err) => {
          agregar(sessionId, {
            role: "asistente",
            tone: "error",
            texto: `${err instanceof Error ? err.message : "No se pudo registrar el producto."} Corregí los datos e intentá nuevamente.`,
          });
        },
      },
    );
  };

  const abrirFormularioAlta = (input: RegistroProductoParsed) => {
    limpiarPropuestaRegistro();
    establecerRegistroPendiente({
      nombre: input.nombre,
      codigo: input.codigo,
      codigo_barra: input.codigo_barra,
      categoria: input.categoria,
      precio: input.precio,
      cantidad: input.cantidad,
    });
    router.push({
      pathname: "/registrar-producto",
      params: {
        ...(input.nombre ? { nombre: input.nombre } : {}),
        ...(input.codigo ? { codigo: input.codigo } : {}),
        ...(input.codigo_barra ? { codigo_barra: input.codigo_barra } : {}),
        ...(input.categoria ? { categoria: input.categoria } : {}),
        ...(input.precio != null ? { precio: String(input.precio) } : {}),
        ...(input.cantidad != null ? { cantidad: String(input.cantidad) } : {}),
      },
    });
  };

  const cancelarConfirmacion = () => {
    const sessionId = chat.activeSessionId;
    limpiarCarritoVenta();
    if (sessionId) agregar(sessionId, { role: "asistente", tone: "info", texto: "Carrito vacío. Podés dictar otra operación o empezar una venta nueva." });
  };

  const nuevaSesion = () => {
    requestLifecycleRef.current.cancel();
    setStreamDraft(null);
    setFailedDraft(null);
    transcriptRef.current = "";
    voice.setTranscript("");
    setInspectingId(null);
    limpiarCarritoVenta();
    limpiarPropuestaRegistro();
    setShortage(null);
    setDrawerOpen(false);
    const session: ChatSession = {
      id: nextId("sesion"),
      objetivo: "indefinido",
      estado: "activa",
      resumen: null,
      createdAt: ahora(),
      updatedAt: ahora(),
    };
    dispatch({ type: "nueva-sesion", session });
  };

  const seleccionarSesion = (sessionId: string) => {
    const session = chat.sessions.find((item) => item.id === sessionId);
    setDrawerOpen(false);
    if (!session) return;
    if (sessionId !== chat.activeSessionId || session.estado === "completada") {
      requestLifecycleRef.current.cancel();
      setStreamDraft(null);
      setFailedDraft(null);
      transcriptRef.current = "";
      voice.setTranscript("");
    }
    if (session.estado === "completada") {
      setInspectingId(sessionId);
      return;
    }
    setInspectingId(null);
    dispatch({ type: "reanudar-sesion", sessionId, updatedAt: ahora() });
  };

  const eliminarSesion = async (sessionId: string) => {
    const session = chat.sessions.find((item) => item.id === sessionId);
    if (!session) return;
    const ok = await requestConfirm({
      title: "Borrar chat",
      message: `Se borra "${session?.resumen ?? "este chat"}" con todo su historial. Esta acción no se puede deshacer.`,
      confirmLabel: "Borrar",
    });
    if (!ok) return;
    setPapelera({ session, messages: chat.messages[sessionId] ?? [] });
    if (chat.activeSessionId === sessionId) {
      requestLifecycleRef.current.cancel(sessionId);
      setStreamDraft(null);
      setFailedDraft(null);
      transcriptRef.current = "";
      voice.setTranscript("");
    }
    if (inspectingId === sessionId) setInspectingId(null);
    if (pendingConfirmation && chat.activeSessionId === sessionId) limpiarCarritoVenta();
    dispatch({ type: "eliminar-sesion", sessionId });
  };

  const deshacerBorrado = () => {
    if (!papelera) return;
    dispatch({ type: "restaurar-sesion", session: papelera.session, messages: papelera.messages });
    setPapelera(null);
  };

  const abrirModoVoz = () => {
    setVoiceMode(true);
    if (!voice.transcript.trim() && voice.isAvailable && voice.permission?.granted && !voice.recording) {
      voice.start();
    }
  };

  const enviarDesdeVoz = () => {
    setVoiceMode(false);
    void enviar();
  };

  if (voice.permissionLoading || branches.isLoading || stock.isLoading || (userId !== null && hydratedUserRef.current !== userId)) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (!assistantScope || activeBranch === null) {
    return (
      <ScreenContainer>
        <View style={styles.noScope}>
          <Text variant="titleMedium" style={styles.noScopeTitle}>Sin sucursal habilitada</Text>
          <Text variant="bodyMedium" style={styles.noScopeText}>
            Tu perfil actual no tiene una sucursal autorizada para usar el asistente. Volvé a iniciar sesión o contactá a administración.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  const visibleSessionId = inspectingId ?? chat.activeSessionId;
  const visibleMessages = visibleSessionId ? (chat.messages[visibleSessionId] ?? []) : [];
  const visibleSession = chat.sessions.find((session) => session.id === visibleSessionId) ?? null;
  const activeSession = chat.sessions.find((session) => session.id === chat.activeSessionId) ?? null;

  return (
    <ScreenContainer>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <IconButton icon={() => <Menu size={22} />} onPress={() => setDrawerOpen(true)} accessibilityLabel="Abrir historial de chats" />
            <Text variant="titleLarge" style={styles.greeting}>
              Hola{primerNombre ? `, ${primerNombre}` : ""}!
            </Text>
          </View>
          <View style={styles.headerRight}>
            <IconButton icon={() => <Plus size={22} />} onPress={nuevaSesion} accessibilityLabel="Nuevo chat" />
            <Button compact mode="text" onPress={() => router.back()}>
              Volver
            </Button>
          </View>
        </View>
        <Text variant="bodySmall" style={styles.branch}>
          Sucursal activa: {branchName || "Sin sucursal"}
        </Text>
        <BranchSelect
          label="Sucursal"
          branches={allowedBranches}
          value={activeBranch}
          onChange={(id) => {
            if (id !== undefined && assistantScope.allowedBranchIds.includes(id)) {
              setBranchId(id);
              if (canChangeBranch) selectBranch(id);
            }
          }}
        />
        <SessionBar active={activeSession} />
        {inspectingId && visibleSession ? (
          <View style={styles.inspectBar}>
            <Text variant="bodySmall" style={styles.inspectText}>
              Viendo historial: {visibleSession.resumen ?? visibleSession.objetivo} ({visibleSession.estado})
            </Text>
            <Button compact mode="text" onPress={() => setInspectingId(null)}>
              Volver al chat
            </Button>
          </View>
        ) : null}
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {visibleMessages.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyHero}>
                <View style={styles.emptyIconCircle}>
                  <Sparkles size={26} color={colors.primary} />
                </View>
                <Text variant="titleMedium" style={styles.emptyTitle}>
                  ¡Hola{primerNombre ? `, ${primerNombre}` : ""}!
                </Text>
                <Text variant="bodySmall" style={styles.emptySubtitle}>
                  Soy el asistente inteligente de Lidemoda. Dictá o escribí lo que necesitás hacer:
                </Text>
              </View>
              <View style={styles.emptyCardsGrid}>
                <TouchableOpacity
                  style={styles.featureCard}
                  activeOpacity={0.7}
                  onPress={() => voice.setTranscript("Vender 2 <producto>")}
                >
                  <Text style={styles.featureCardEmoji}>🛍️</Text>
                  <Text variant="labelMedium" style={styles.featureCardTitle}>Vender prendas</Text>
                  <Text variant="bodySmall" style={styles.featureCardDesc}>{"\"Vender 2 <producto>\""}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.featureCard}
                  activeOpacity={0.7}
                  onPress={() => voice.setTranscript("¿Cuánto stock queda de <producto>?")}
                >
                  <Text style={styles.featureCardEmoji}>📦</Text>
                  <Text variant="labelMedium" style={styles.featureCardTitle}>Consultar stock</Text>
                  <Text variant="bodySmall" style={styles.featureCardDesc}>{"\"Stock de <producto>\""}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.featureCard}
                  activeOpacity={0.7}
                  onPress={() => voice.setTranscript("Registrar un producto nuevo")}
                >
                  <Text style={styles.featureCardEmoji}>👗</Text>
                  <Text variant="labelMedium" style={styles.featureCardTitle}>Alta de prenda</Text>
                  <Text variant="bodySmall" style={styles.featureCardDesc}>"Registrar un producto nuevo"</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.featureCard}
                  activeOpacity={0.7}
                  onPress={() => voice.setTranscript("¿Cuánto se vendió hoy?")}
                >
                  <Text style={styles.featureCardEmoji}>📊</Text>
                  <Text variant="labelMedium" style={styles.featureCardTitle}>Ventas del día</Text>
                  <Text variant="bodySmall" style={styles.featureCardDesc}>"¿Cuánto se vendió hoy?"</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            visibleMessages.map((message) => {
              const candidatos = message.attachment?.kind === "candidatos" ? message.attachment : null;
              const listaInventario = message.attachment?.kind === "lista-inventario" ? message.attachment : null;
              const consultaRotacion = message.attachment?.kind === "consulta-rotacion" ? message.attachment : null;
              const consultaKardex = message.attachment?.kind === "consulta-kardex" ? message.attachment : null;
              return (
              <ChatMessageBubble
                key={message.id}
                message={message}
                actions={
                  shortage && shortage.messageId === message.id && visibleSessionId && !inspectingId
                    ? [{ label: "Vender máximo disponible", onPress: () => aplicarMaximoDisponible(visibleSessionId) }]
                    : undefined
                }
              >
                {candidatos && visibleSessionId && !inspectingId && !candidatos.resolved ? (
                  <CandidatePicker
                    candidatos={candidatos.candidatos}
                    stockLocal={stockLocalPorProducto}
                    branchName={branchName}
                    disabled={voice.interpreting || sale.isPending}
                    onSelect={(producto) => void elegirCandidato(visibleSessionId, producto, candidatos.intento, message.id)}
                  />
                ) : null}
                {message.attachment?.kind === "confirmacion-venta"
                  && message.attachment.lines.length > 0
                  && message.id === pendingConfirmationMessageId
                  && visibleSessionId
                  && !inspectingId ? (
                  <SaleConfirmationCard
                    branchName={branchName}
                    lines={message.attachment.lines}
                    loading={sale.isPending}
                    onConfirm={confirmarVenta}
                    onCancel={cancelarConfirmacion}
                    onAddMore={() => voice.setTranscript("Agregar ")}
                    onSendToCart={cargarAlCarrito}
                  />
                ) : null}
                {message.attachment?.kind === "registro-producto"
                  && pendingRegistration
                  && message.id === pendingRegistrationMessageId
                  && visibleSessionId
                  && !inspectingId ? (
                  <ProductRegistrationCard
                    initialData={pendingRegistration}
                    branchName={message.attachment.branchName}
                    branchId={message.attachment.branchId}
                    loading={productMutation.isPending}
                    canWrite={canWriteProducts}
                    onConfirm={confirmarAltaProducto}
                    onOpenForm={abrirFormularioAlta}
                    onCancel={limpiarPropuestaRegistro}
                  />
                ) : null}
                {message.attachment?.kind === "consulta-stock" ? (
                  <View style={styles.queryCard}>
                    {message.attachment.filas.slice(0, 6).map((row) => (
                      <View key={row.sucursal} style={styles.queryRow}>
                        <Text variant="bodySmall" style={styles.queryBranch}>
                          {row.sucursal}
                        </Text>
                        <Text variant="labelMedium" style={styles.queryQty}>
                          {row.cantidad} uds
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {message.attachment?.kind === "consulta-ventas" ? (
                  <Text variant="headlineSmall" style={styles.queryTotal}>
                    {formatearPrecio(message.attachment.totalVentas)}
                    <Text variant="bodySmall" style={styles.queryBranch}>
                      {"  "}· {message.attachment.cantidadVentas} venta(s){" "}
                      {formatSalesPeriodLabel(message.attachment.periodo ?? "hoy", message.attachment.diasAtras)}
                    </Text>
                  </Text>
                ) : null}
                {message.attachment?.kind === "busqueda-productos" ? (
                  <View style={styles.queryCard}>
                    {message.attachment.productos.slice(0, 6).map((producto) => (
                      <View key={producto.id} style={styles.queryRow}>
                        <View style={styles.queryCopy}>
                          <Text variant="bodySmall" style={styles.queryBranch}>{producto.nombre}</Text>
                          <Text variant="labelSmall" style={styles.queryMeta}>{producto.codigo} · {producto.categoria}</Text>
                        </View>
                        <Text variant="labelMedium" style={styles.queryQty}>{formatearPrecio(producto.precio)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {message.attachment?.kind === "stock-bajo" ? (
                  <View style={styles.queryCard}>
                    {message.attachment.productos.slice(0, 6).map((item) => (
                      <View key={item.id} style={styles.queryRow}>
                        <View style={styles.queryCopy}>
                          <Text variant="bodySmall" style={styles.queryBranch}>{item.producto.nombre}</Text>
                          <Text variant="labelSmall" style={styles.queryMeta}>{item.sucursal.nombre} · mínimo {item.threshold}</Text>
                        </View>
                        <Text variant="labelMedium" style={styles.lowStockQty}>{item.cantidad} uds</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {listaInventario ? (
                  <View style={styles.queryCard}>
                    {listaInventario.filas.slice(0, 8).map((fila) => (
                      <View key={`${fila.codigo}-${fila.nombre}`} style={styles.queryRow}>
                        <View style={styles.queryCopy}>
                          <Text variant="bodySmall" style={styles.queryBranch}>{fila.nombre}</Text>
                          <Text variant="labelSmall" style={styles.queryMeta}>
                            {fila.codigo}{listaInventario.minStock > 0 ? ` · desde ${listaInventario.minStock} uds` : ""}
                          </Text>
                        </View>
                        <Text variant="labelMedium" style={styles.queryQty}>{fila.cantidad} uds</Text>
                      </View>
                    ))}
                    {listaInventario.filas.length > 8 ? (
                      <Text variant="labelSmall" style={styles.queryMeta}>
                        +{listaInventario.filas.length - 8} producto(s) más
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {consultaRotacion ? (
                  <View style={styles.queryCard}>
                    <Text variant="labelSmall" style={styles.queryMeta}>
                      {consultaRotacion.dias} días · {consultaRotacion.totalUnidades} u. vendidas · Bs. {consultaRotacion.totalIngresos.toFixed(2)} · inmovilizado Bs. {consultaRotacion.capitalInmovilizado.toFixed(2)}
                    </Text>
                    {consultaRotacion.items.slice(0, 5).map((item) => (
                      <View key={`${item.codigo}-${item.nombre}`} style={styles.queryRow}>
                        <View style={styles.queryCopy}>
                          <Text variant="bodySmall" style={styles.queryBranch}>{item.nombre}</Text>
                          <Text variant="labelSmall" style={styles.queryMeta}>{item.codigo} · {item.clasificacion} rotación</Text>
                        </View>
                        <Text variant="labelMedium" style={styles.queryQty}>{item.unidadesVendidas} v / {item.stockActual} stk</Text>
                      </View>
                    ))}
                    {consultaRotacion.insights.slice(0, 2).map((insight) => (
                      <Text key={insight.titulo} variant="labelSmall" style={styles.queryMeta}>
                        {insight.titulo}: {insight.descripcion}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {consultaKardex ? (
                  <View style={styles.queryCard}>
                    <Text variant="labelSmall" style={styles.queryMeta}>
                      {consultaKardex.productoNombre ? `${consultaKardex.productoNombre} · ` : ""}
                      {consultaKardex.resumen.total} mov. · +{consultaKardex.resumen.entradas} / -{consultaKardex.resumen.salidas}
                    </Text>
                    {consultaKardex.movimientos.slice(0, 6).map((mov) => (
                      <View key={`${mov.fecha}-${mov.productoCodigo}-${mov.cantidad}`} style={styles.queryRow}>
                        <View style={styles.queryCopy}>
                          <Text variant="bodySmall" style={styles.queryBranch}>{mov.productoNombre}</Text>
                          <Text variant="labelSmall" style={styles.queryMeta}>
                            {mov.tipo}{mov.subtipo ? ` · ${mov.subtipo}` : ""}{mov.saldoResultante !== undefined ? ` · saldo ${mov.saldoResultante}` : ""}
                          </Text>
                        </View>
                        <Text variant="labelMedium" style={styles.queryQty}>{mov.cantidad} uds</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </ChatMessageBubble>
              );
            })
          )}
          {streamDraft ? (
            <ChatMessageBubble
              streaming
              message={{
                id: "stream-draft",
                role: "asistente",
                texto: streamDraft.text,
                thoughts: streamDraft.thoughts,
              }}
            />
          ) : voice.interpreting ? (
            <View style={styles.thinkingActiveBox}>
              <ThinkingTrace isActive activeStatusText="Sigue trabajando… consultando al proveedor." />
            </View>
          ) : null}
        </ScrollView>
        {inspectingId ? null : (
          <ChatComposer
            transcript={voice.transcript}
            recording={voice.recording}
            interpreting={voice.interpreting}
            permissionDenied={voice.isAvailable && voice.permission?.granted !== true}
            permissionError={voice.permissionError}
            error={failedDraft?.sessionId === chat.activeSessionId ? undefined : voice.error}
            onTranscriptChange={(value) => {
              transcriptRef.current = value;
              voice.setTranscript(value);
            }}
            onStart={voice.start}
            onStop={voice.stop}
            onSend={() => void enviar()}
            onRetry={() => {
              if (failedDraft?.sessionId === chat.activeSessionId) void enviar(failedDraft.text);
            }}
            retryAvailable={failedDraft?.sessionId === chat.activeSessionId}
            onScanCode={(code) => void enviar(scannedBarcodeMessage(code))}
            onVoiceMode={abrirModoVoz}
            onRequestPermission={voice.requestPermission}
            showSuggestions={visibleMessages.length === 0 || Boolean(contextualSuggestions)}
            suggestions={contextualSuggestions}
          />
        )}
        <SessionDrawer
          open={drawerOpen}
          sessions={chat.sessions}
          activeSessionId={chat.activeSessionId}
          mode={mode}
          onClose={() => setDrawerOpen(false)}
          onNew={nuevaSesion}
          onSelect={seleccionarSesion}
          onDelete={eliminarSesion}
          onModeChange={cambiarModo}
        />
        <VoiceModeOverlay
          visible={voiceMode}
          transcript={voice.transcript}
          recording={voice.recording}
          interpreting={voice.interpreting}
          isAvailable={voice.isAvailable}
          permissionGranted={voice.permission?.granted === true}
          onStart={voice.start}
          onStop={voice.stop}
          onSend={enviarDesdeVoz}
          onClose={() => {
            if (voice.recording) voice.stop();
            setVoiceMode(false);
          }}
          onRequestPermission={voice.requestPermission}
        />
        {confirmDialog}
        <Snackbar visible={papelera !== null} onDismiss={() => setPapelera(null)} action={{ label: "Deshacer", onPress: deshacerBorrado }}>
          Chat borrado.
        </Snackbar>
      </View>
    </ScreenContainer>
  );
}

export default VoiceCommandView;

const styles = StyleSheet.create({
  screen: { flex: 1, gap: spacing.xs },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flex: 1 },
  headerRight: { flexDirection: "row", alignItems: "center" },
  greeting: { fontWeight: "800", color: colors.textPrimary },
  branch: { color: colors.textSecondary },
  inspectBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  inspectText: { flex: 1, color: colors.primary },
  messages: { flex: 1 },
  messagesContent: { gap: spacing.sm, paddingVertical: spacing.xs },
  emptyContainer: {
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  emptyHero: {
    alignItems: "center",
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(224, 76, 56, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontWeight: "800",
    color: colors.textPrimary,
    textAlign: "center",
  },
  emptySubtitle: {
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 18,
  },
  emptyCardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs + 2,
    justifyContent: "space-between",
  },
  featureCard: {
    width: "48%",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: spacing.sm,
    gap: 2,
  },
  featureCardEmoji: {
    fontSize: 20,
    marginBottom: 2,
  },
  featureCardTitle: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  featureCardDesc: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  thinkingActiveBox: {
    paddingVertical: spacing.xs,
  },
  empty: { color: colors.textSecondary, lineHeight: 22 },
  queryCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.sm,
    gap: 2,
  },
  queryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  queryCopy: { flex: 1, gap: 1, paddingRight: spacing.xs },
  queryBranch: { color: colors.textSecondary },
  queryMeta: { color: colors.textMuted },
  queryQty: { color: colors.textPrimary, fontWeight: "700" },
  lowStockQty: { color: colors.warning, fontWeight: "700" },
  queryTotal: { color: colors.successDark, fontWeight: "800" },
  noScope: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.lg },
  noScopeTitle: { color: colors.textPrimary, fontWeight: "800", textAlign: "center" },
  noScopeText: { color: colors.textSecondary, textAlign: "center", lineHeight: 21 },
});
