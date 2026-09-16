import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Button, IconButton, Snackbar, Text } from "react-native-paper";
import { Menu, Plus } from "lucide-react-native";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { BranchSelect } from "../../../shared/components/BranchSelect";
import { useConfirm } from "../../../shared/components/ConfirmDialog";
import { useAuth } from "../../auth/hooks/useAuth";
import { getPreferredMode, setPreferredMode, type PreferredMode } from "../../../shared/lib/secureKeyStore";
import { colors, spacing } from "../../../shared/theme";
import { useSucursales } from "../../../shared/hooks/useSucursales";
import { useStockMultiSucursal } from "../../inventario/hooks/useStockMultiSucursal";
import { useProcesarVenta } from "../../ventas/hooks/useProcesarVenta";
import { useVoiceCommand } from "../hooks/useVoiceCommand";
import { aggregateVoiceLines } from "../lib/voiceLines";
import {
  chatInicial,
  chatReducer,
  type ChatMessage,
  type ChatSession,
  type IntentoDesambiguacion,
  type ObjetivoSesion,
} from "../lib/chatSession";
import {
  consultarStockDe,
  type LineaInterpretada,
  type ResultadoInterpretacion,
} from "../api/voiceCommandApi";
import type { Producto } from "../../../shared/types/domain";
import { ChatMessageBubble } from "../components/ChatMessageBubble";
import { CandidatePicker } from "../components/CandidatePicker";
import { SaleConfirmationCard, type VentaConfirmationLine } from "../components/SaleConfirmationCard";
import { ChatComposer } from "../components/ChatComposer";
import { SessionBar } from "../components/SessionBar";
import { SessionDrawer } from "../components/SessionDrawer";
import { VoiceModeOverlay } from "../components/VoiceModeOverlay";

const RETRY_HINT = "Corregí el texto abajo y enviá de nuevo.";
const SUGERENCIA_SKU = 'Probá con el código SKU (ej: JEAN-001) o "Vender 2 Jean Mom Fit".';

type LineaConStock = LineaInterpretada & { available: number };

/**
 * Asistente conversacional en vista propia (ya no modal): chat estilo
 * ChatGPT/Claude con sesiones de vida corta. Cada sesión persigue una
 * acción y muere al completarla; el historial queda visible arriba.
 */
export function VoiceCommandView() {
  const voice = useVoiceCommand();
  const { profile } = useAuth();
  const branches = useSucursales();
  const stock = useStockMultiSucursal();
  const sale = useProcesarVenta();
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
  const [branchId, setBranchId] = useState<number | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<VentaConfirmationLine[] | null>(null);
  const [shortage, setShortage] = useState<{ messageId: string; lines: LineaConStock[] } | null>(null);
  const [papelera, setPapelera] = useState<{ session: ChatSession; messages: ChatMessage[] } | null>(null);
  const [lastLines, setLastLines] = useState<LineaInterpretada[]>([]);
  const idRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const activeBranch = branchId ?? branches.data?.[0]?.id ?? null;
  const branchName = branches.data?.find((branch) => branch.id === activeBranch)?.nombre ?? "";

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

  const scrollToEnd = () => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

  /** Sesión activa o una nueva (objetivo indefinido hasta interpretar). */
  const asegurarSesion = (): string => {
    if (chat.activeSessionId) return chat.activeSessionId;
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

  const procesarLineasVenta = (sessionId: string, lineas: LineaInterpretada[], fueCorreccion = false) => {
    if (activeBranch === null) {
      agregar(sessionId, { role: "asistente", tone: "error", texto: `No hay sucursal activa para registrar la venta. ${RETRY_HINT}` });
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
        texto: `${error instanceof Error ? error.message : "Líneas ambiguas."} ${RETRY_HINT}`,
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
        },
        updatedAt: ahora(),
      });
      setShortage({ messageId, lines: withStock });
      scrollToEnd();
      return;
    }
    setPendingConfirmation(
      withStock.map((line) => ({
        producto_id: line.producto.id,
        nombre: line.producto.nombre,
        cantidad: line.cantidadSolicitada,
        precio: line.producto.precio,
      })),
    );
    agregar(sessionId, {
      role: "asistente",
      tone: "info",
      texto: fueCorreccion
        ? `Tomé tu corrección: ${withStock.map((line) => `${line.cantidadSolicitada} × ${line.producto.nombre}`).join(", ")}. Revisá y confirmá.`
        : `Entendí esto para ${branchName}. Revisá y confirmá, o tocá Corregir.`,
      attachment: { kind: "confirmacion-venta" },
    });
  };

  const aplicarMaximoDisponible = (sessionId: string) => {
    if (!shortage) return;
    const capped = shortage.lines
      .map((line) => ({ ...line, cantidadSolicitada: Math.min(line.cantidadSolicitada, line.available) }))
      .filter((line) => line.cantidadSolicitada > 0);
    setShortage(null);
    if (capped.length === 0) {
      agregar(sessionId, { role: "asistente", tone: "info", texto: `Sin stock disponible en ${branchName}. ${RETRY_HINT}` });
      return;
    }
    setPendingConfirmation(
      capped.map((line) => ({
        producto_id: line.producto.id,
        nombre: line.producto.nombre,
        cantidad: line.cantidadSolicitada,
        precio: line.producto.precio,
      })),
    );
    agregar(sessionId, {
      role: "asistente",
      tone: "info",
      texto: "Ajusté a lo disponible. Revisá y confirmá.",
      attachment: { kind: "confirmacion-venta" },
    });
  };

  const elegirCandidato = async (sessionId: string, producto: Producto, intento: IntentoDesambiguacion) => {
    agregar(sessionId, { role: "usuario", texto: `Elegí ${producto.nombre} (${producto.codigo})` });
    if (intento.accion === "venta") {
      procesarLineasVenta(sessionId, [{ producto, cantidadSolicitada: intento.cantidad }]);
      return;
    }
    try {
      const consulta = await consultarStockDe(producto, intento.sucursal);
      agregar(sessionId, {
        role: "asistente",
        tone: "success",
        texto: consulta.mensaje,
        attachment: {
          kind: "consulta-stock",
          productoNombre: producto.nombre,
          filas: consulta.desglose.map((row) => ({ sucursal: row.sucursalNombre, cantidad: row.cantidad })),
          total: consulta.stockTotal,
        },
      });
      dispatch({ type: "completar-sesion", sessionId, resumen: `Stock ${producto.nombre} (${consulta.stockTotal})`, updatedAt: ahora() });
    } catch (error) {
      agregar(sessionId, {
        role: "asistente",
        tone: "error",
        texto: `${error instanceof Error ? error.message : "No se pudo consultar el stock."} ${RETRY_HINT}`,
      });
    }
  };

  const enviar = async () => {
    const texto = voice.transcript.trim();
    if (!texto || voice.interpreting || sale.isPending) return;
    if (voice.recording) voice.stop();
    setInspectingId(null);
    const sessionId = asegurarSesion();
    agregar(sessionId, { role: "usuario", texto });
    setPendingConfirmation(null);
    setShortage(null);
    try {
      const contexto = lastLines[0] ? { ultimoProductoNombre: lastLines[0].producto.nombre } : undefined;
      const result: ResultadoInterpretacion = await voice.interpret(contexto);
      if (result.tipo === "aclaracion") {
        agregar(sessionId, { role: "asistente", tone: "info", texto: `${result.mensaje} ${RETRY_HINT}` });
        return;
      }
      if (result.tipo === "registro_producto") {
        fijarObjetivo(sessionId, "registro");
        agregar(sessionId, { role: "asistente", tone: "info", texto: result.mensaje });
        dispatch({ type: "completar-sesion", sessionId, resumen: "Alta catálogo", updatedAt: ahora() });
        router.replace("/registrar-producto");
        return;
      }
      if (result.tipo === "consulta_stock" || result.tipo === "consulta_ventas") {
        fijarObjetivo(sessionId, "consulta");
        if (result.tipo === "consulta_stock") {
          agregar(sessionId, {
            role: "asistente",
            tone: "success",
            texto: result.mensaje,
            attachment: {
              kind: "consulta-stock",
              productoNombre: result.producto.nombre,
              filas: result.desglose.map((row) => ({ sucursal: row.sucursalNombre, cantidad: row.cantidad })),
              total: result.stockTotal,
            },
          });
          dispatch({ type: "completar-sesion", sessionId, resumen: `Stock ${result.producto.nombre} (${result.stockTotal})`, updatedAt: ahora() });
        } else {
          agregar(sessionId, {
            role: "asistente",
            tone: "success",
            texto: result.mensaje,
            attachment: { kind: "consulta-ventas", totalVentas: result.totalVentas, cantidadVentas: result.cantidadVentas },
          });
          dispatch({
            type: "completar-sesion",
            sessionId,
            resumen: `Ventas hoy Bs ${result.totalVentas.toFixed(2)}`,
            updatedAt: ahora(),
          });
        }
        voice.setTranscript("");
        return;
      }
      if (result.tipo === "desambiguacion") {
        fijarObjetivo(sessionId, result.intento.accion === "venta" ? "venta" : "consulta");
        agregar(sessionId, {
          role: "asistente",
          tone: "info",
          texto: `Encontré ${result.candidatos.length} opciones para "${result.texto}". Elegí la correcta para seguir:`,
          attachment: { kind: "candidatos", texto: result.texto, intento: result.intento, candidatos: result.candidatos },
        });
        return;
      }
      fijarObjetivo(sessionId, "venta");
      procesarLineasVenta(sessionId, result.lineas, result.fueCorreccion);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo interpretar la operación.";
      agregar(sessionId, { role: "asistente", tone: "error", texto: `${message} ${SUGERENCIA_SKU}` });
    }
  };

  const confirmarVenta = () => {
    const sessionId = chat.activeSessionId;
    if (!pendingConfirmation || !sessionId || activeBranch === null || sale.isPending) return;
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
          setLastLines([]);
          agregar(sessionId, {
            role: "asistente",
            tone: "success",
            texto: `Venta registrada en ${branchName}. ¿Registramos otra? Escribí o dictá la siguiente.`,
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

  const cancelarConfirmacion = () => {
    const sessionId = chat.activeSessionId;
    setPendingConfirmation(null);
    if (sessionId) agregar(sessionId, { role: "asistente", tone: "info", texto: `Venta en pausa. ${RETRY_HINT}` });
  };

  const nuevaSesion = () => {
    setInspectingId(null);
    setPendingConfirmation(null);
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
    if (inspectingId === sessionId) setInspectingId(null);
    if (pendingConfirmation && chat.activeSessionId === sessionId) setPendingConfirmation(null);
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

  if (voice.permissionLoading || branches.isLoading || stock.isLoading) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.primary} />
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
          branches={branches.data ?? []}
          value={activeBranch}
          onChange={(id) => { if (id !== undefined) setBranchId(id); }}
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
            <Text variant="bodyMedium" style={styles.empty}>
              Preguntá por stock, dictá una venta o consultá las ventas de hoy. Si digo “chompas” y hay varias, te muestro los SKUs para que elijas.
            </Text>
          ) : (
            visibleMessages.map((message) => {
              const candidatos = message.attachment?.kind === "candidatos" ? message.attachment : null;
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
                {candidatos && visibleSessionId && !inspectingId ? (
                  <CandidatePicker
                    candidatos={candidatos.candidatos}
                    stockLocal={stockLocalPorProducto}
                    branchName={branchName}
                    disabled={voice.interpreting || sale.isPending}
                    onSelect={(producto) => void elegirCandidato(visibleSessionId, producto, candidatos.intento)}
                  />
                ) : null}
                {message.attachment?.kind === "confirmacion-venta" && pendingConfirmation && visibleSessionId && !inspectingId ? (
                  <SaleConfirmationCard
                    branchName={branchName}
                    lines={pendingConfirmation}
                    loading={sale.isPending}
                    onConfirm={confirmarVenta}
                    onCancel={cancelarConfirmacion}
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
                    Bs {message.attachment.totalVentas.toFixed(2)}
                    <Text variant="bodySmall" style={styles.queryBranch}>
                      {"  "}· {message.attachment.cantidadVentas} venta(s) hoy
                    </Text>
                  </Text>
                ) : null}
              </ChatMessageBubble>
              );
            })
          )}
        </ScrollView>
        {inspectingId ? null : (
          <ChatComposer
            transcript={voice.transcript}
            recording={voice.recording}
            interpreting={voice.interpreting}
            permissionDenied={voice.isAvailable && voice.permission?.granted !== true}
            permissionError={voice.permissionError}
            error={voice.error}
            onTranscriptChange={voice.setTranscript}
            onStart={voice.start}
            onStop={voice.stop}
            onSend={() => void enviar()}
            onVoiceMode={abrirModoVoz}
            onRequestPermission={voice.requestPermission}
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
          onToggle={voice.recording ? voice.stop : voice.start}
          onSend={enviarDesdeVoz}
          onClose={() => setVoiceMode(false)}
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
  queryBranch: { color: colors.textSecondary },
  queryQty: { color: colors.textPrimary, fontWeight: "700" },
  queryTotal: { color: colors.successDark, fontWeight: "800" },
});
