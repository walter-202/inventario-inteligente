import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ActivityIndicator, Chip, Text } from "react-native-paper";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { colors, spacing } from "../../../shared/theme";
import { useSucursales } from "../../../shared/hooks/useSucursales";
import { useStockMultiSucursal } from "../../inventario/hooks/useStockMultiSucursal";
import { useProcesarVenta } from "../../ventas/hooks/useProcesarVenta";
import { RegistroVozDrawer, type VentaConfirmation } from "../components/RegistroVozDrawer";
import type { AssistantMessage } from "../components/AssistantReply";
import { useVoiceCommand } from "../hooks/useVoiceCommand";
import { aggregateVoiceLines } from "../lib/voiceLines";
import type { LineaInterpretada, ResultadoInterpretacion } from "../api/voiceCommandApi";

type QueryState = Extract<ResultadoInterpretacion, { tipo: "consulta_stock" | "consulta_ventas" }>;

const RETRY_HINT = "Corregí el texto arriba y tocá Interpretar de nuevo.";

export function VoiceCommandView() {
  const voice = useVoiceCommand();
  const branches = useSucursales();
  const stock = useStockMultiSucursal();
  const sale = useProcesarVenta();
  const [branchId, setBranchId] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<VentaConfirmation | null>(null);
  const [queryResult, setQueryResult] = useState<QueryState | null>(null);
  const [assistant, setAssistant] = useState<AssistantMessage | null>(null);
  // Memoria conversacional: último producto mencionado, para resolver correcciones ("sino 5").
  const [lastLines, setLastLines] = useState<LineaInterpretada[]>([]);
  const activeBranch = branchId ?? branches.data?.[0]?.id ?? null;
  const branchName = branches.data?.find((branch) => branch.id === activeBranch)?.nombre ?? "";
  const description = useMemo(
    () => confirmation?.lines.map((line) => `${line.cantidad} × ${line.nombre}`).join("\n") ?? "",
    [confirmation],
  );

  const buildConfirmation = (lines: LineaInterpretada[]): VentaConfirmation => ({
    branchName,
    lines: lines.map((line) => ({
      producto_id: line.producto.id,
      nombre: line.producto.nombre,
      cantidad: line.cantidadSolicitada,
      precio: line.producto.precio,
    })),
    loading: false,
    onConfirm: confirm,
    onCancel: () => {
      setConfirmation(null);
      setAssistant({ tone: "info", text: `Venta en pausa. ${RETRY_HINT}` });
    },
  });

  const interpret = async () => {
    setConfirmation(null);
    setQueryResult(null);
    try {
      const contexto = lastLines[0] ? { ultimoProductoNombre: lastLines[0].producto.nombre } : undefined;
      const result = await voice.interpret(contexto);
      if (result.tipo === "aclaracion") {
        setAssistant({ tone: "info", text: `${result.mensaje} ${RETRY_HINT}` });
        return;
      }
      if (result.tipo === "registro_producto") {
        setAssistant({
          tone: "info",
          text: result.mensaje,
          actions: [{ label: "Ir a registrar prenda", onPress: () => router.replace("/registrar-producto") }],
        });
        return;
      }
      if (result.tipo === "consulta_stock" || result.tipo === "consulta_ventas") {
        setQueryResult(result);
        setAssistant({ tone: "success", text: "Esto encontré. Si querés afinar, agregá la sucursal o el código SKU." });
        return;
      }
      if (result.tipo === "venta") {
        if (activeBranch === null) {
          setAssistant({ tone: "error", text: `No hay sucursal activa para registrar la venta. ${RETRY_HINT}` });
          return;
        }
        setLastLines(result.lineas);
        const lines = aggregateVoiceLines(result.lineas).map((line) => {
          const available = stock.data?.find((item) => item.sucursal_id === activeBranch && item.producto_id === line.producto.id)?.cantidad ?? 0;
          return { ...line, available };
        });
        const shortages = lines.filter((line) => line.available < line.cantidadSolicitada);
        if (shortages.length > 0) {
          const detail = shortages
            .map((line) => `• ${line.producto.nombre}: pediste ${line.cantidadSolicitada}, hay ${line.available}.`)
            .join("\n");
          const maxLine = shortages[0];
          setAssistant({
            tone: "warning",
            text: `No alcanza el stock en ${branchName}:\n${detail}\n¿Ajustamos a lo disponible o corregís la cantidad?`,
            actions: maxLine.available > 0
              ? [{
                label: `Vender ${maxLine.available} (máximo)`,
                onPress: () => {
                  const capped = lines.map((line) => ({
                    ...line,
                    cantidadSolicitada: Math.min(line.cantidadSolicitada, line.available),
                  })).filter((line) => line.cantidadSolicitada > 0);
                  setConfirmation(buildConfirmation(capped));
                  setAssistant({ tone: "info", text: "Ajusté a lo disponible. Revisá y confirmá." });
                },
              }]
              : undefined,
          });
          return;
        }
        setConfirmation(buildConfirmation(lines));
        setAssistant({
          tone: "info",
          text: result.fueCorreccion
            ? `Tomé tu corrección: ${lines.map((line) => `${line.cantidadSolicitada} × ${line.producto.nombre}`).join(", ")}. Revisá y confirmá.`
            : `Entendí esto para ${branchName}. Revisá y confirmá, o tocá Corregir.`,
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AmbiguousVoiceLineError") {
        setAssistant({ tone: "warning", text: `${error.message} Indicá el código SKU o el nombre completo. ${RETRY_HINT}` });
        return;
      }
      const message = error instanceof Error ? error.message : "No se pudo interpretar la operación.";
      setAssistant({ tone: "error", text: `${message} Probá con el código SKU (ej: JEAN-001) o una frase como "Vender 2 Jean Mom Fit".` });
    }
  };

  const confirm = () => {
    if (!confirmation || activeBranch === null) return;
    setConfirmation({ ...confirmation, loading: true });
    sale.mutate(
      {
        sucursal_id: activeBranch,
        metodo_pago: "efectivo",
        productos: confirmation.lines.map((line) => ({ producto_id: line.producto_id, cantidad: line.cantidad })),
      },
      {
        onSuccess: () => {
          setConfirmation(null);
          setAssistant({ tone: "success", text: `Venta registrada en ${branchName}:\n${description}\n¿Registramos otra? Escribí o dictá la siguiente.` });
          voice.setTranscript("");
        },
        onError: (error) => {
          setConfirmation((current) => (current ? { ...current, loading: false } : current));
          setAssistant({ tone: "error", text: `${error instanceof Error ? error.message : "No se pudo registrar la venta."} Revisá el stock e intentá de nuevo.` });
        },
      },
    );
  };

  if (voice.permissionLoading || branches.isLoading || stock.isLoading) return <ScreenContainer><ActivityIndicator color={colors.primary} /></ScreenContainer>;
  return (
    <ScreenContainer scroll>
      <Text variant="titleLarge">Asistente por voz</Text>
      <Text>Sucursal activa: {branchName || "Sin sucursal"}</Text>
      <View style={styles.chips}>
        {(branches.data ?? []).map((branch) => (
          <Chip key={branch.id} selected={branch.id === activeBranch} showSelectedCheck={false} onPress={() => setBranchId(branch.id)}>
            {branch.nombre}
          </Chip>
        ))}
      </View>
      <RegistroVozDrawer
        visible
        transcript={voice.transcript}
        recording={voice.recording}
        interpreting={voice.interpreting}
        error={voice.error}
        permissionError={voice.permissionError}
        assistant={assistant}
        confirmation={confirmation ? { ...confirmation, loading: sale.isPending } : null}
        query={queryResult}
        onTranscriptChange={(value) => { voice.setTranscript(value); setQueryResult(null); }}
        onStart={voice.start}
        onStop={voice.stop}
        onInterpret={interpret}
        onDismiss={() => router.back()}
        onDismissQuery={() => setQueryResult(null)}
        onRequestPermission={voice.requestPermission}
        permissionDenied={voice.isAvailable && voice.permission?.granted !== true}
      />
    </ScreenContainer>
  );
}

export default VoiceCommandView;
const styles = StyleSheet.create({ chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginVertical: spacing.md } });
