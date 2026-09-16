import { useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ActivityIndicator, Chip, Text } from "react-native-paper";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { colors, spacing } from "../../../shared/theme";
import { useSucursales } from "../../../shared/hooks/useSucursales";
import { useStockMultiSucursal } from "../../inventario/hooks/useStockMultiSucursal";
import { useProcesarVenta } from "../../ventas/hooks/useProcesarVenta";
import { RegistroVozDrawer } from "../components/RegistroVozDrawer";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { useVoiceCommand } from "../hooks/useVoiceCommand";
import { aggregateVoiceLines } from "../lib/voiceLines";

export function VoiceCommandView() {
  const voice = useVoiceCommand();
  const branches = useSucursales();
  const stock = useStockMultiSucursal();
  const sale = useProcesarVenta();
  const [branchId, setBranchId] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<{ description: string; products: Array<{ producto_id: number; cantidad: number }> } | null>(null);
  const activeBranch = branchId ?? branches.data?.[0]?.id ?? null;
  const branchName = branches.data?.find((branch) => branch.id === activeBranch)?.nombre ?? "";
  const description = useMemo(() => confirmation?.description ?? "", [confirmation]);

  const interpret = async () => {
    try {
      const result = await voice.interpret();
      if (result.tipo !== "venta") { Alert.alert("Necesitamos más información", result.mensaje); return; }
      if (activeBranch === null) { Alert.alert("Venta no disponible", "No hay sucursales disponibles."); return; }
      const lines = aggregateVoiceLines(result.lineas).map((line) => {
        const available = stock.data?.find((item) => item.sucursal_id === activeBranch && item.producto_id === line.producto.id)?.cantidad ?? 0;
        return { ...line, available };
      });
      const unavailable = lines.find((line) => line.available < line.cantidadSolicitada);
      if (unavailable) { Alert.alert("Stock insuficiente", `${unavailable.producto.nombre}: disponible ${unavailable.available}.`); return; }
      setConfirmation({ description: lines.map((line) => `${line.cantidadSolicitada} × ${line.producto.nombre}`).join("\n"), products: lines.map((line) => ({ producto_id: line.producto.id, cantidad: line.cantidadSolicitada })) });
    } catch (error) {
      if (error instanceof Error && error.name === "AmbiguousVoiceLineError") {
        Alert.alert("Interpretación ambigua", error.message);
      }
    }
  };

  const confirm = () => {
    if (!confirmation || activeBranch === null) return;
    sale.mutate({ sucursal_id: activeBranch, metodo_pago: "efectivo", productos: confirmation.products }, {
      onSuccess: () => { setConfirmation(null); voice.setTranscript(""); Alert.alert("Venta registrada", "La venta por voz se registró correctamente."); },
      onError: (error) => Alert.alert("No se pudo registrar la venta", error instanceof Error ? error.message : "Intentá nuevamente."),
    });
  };

  if (voice.permissionLoading || branches.isLoading || stock.isLoading) return <ScreenContainer><ActivityIndicator color={colors.primary} /></ScreenContainer>;
  return <ScreenContainer scroll><Text variant="titleLarge">Asistente de ventas</Text><Text>Sucursal activa: {branchName || "Sin sucursal"}</Text><View style={styles.chips}>{(branches.data ?? []).map((branch) => <Chip key={branch.id} selected={branch.id === activeBranch} showSelectedCheck={false} onPress={() => setBranchId(branch.id)}>{branch.nombre}</Chip>)}</View><RegistroVozDrawer visible transcript={voice.transcript} recording={voice.recording} interpreting={voice.interpreting} error={voice.error} permissionError={voice.permissionError} onTranscriptChange={voice.setTranscript} onStart={voice.start} onStop={voice.stop} onInterpret={interpret} onDismiss={() => router.back()} onRequestPermission={voice.requestPermission} permissionDenied={voice.permission?.granted !== true} /><ConfirmationModal visible={confirmation !== null} title="Confirmar venta por voz" description={`Sucursal: ${branchName}\n${description}`} loading={sale.isPending} onDismiss={() => setConfirmation(null)} onConfirm={confirm} /></ScreenContainer>;
}

export default VoiceCommandView;
const styles = StyleSheet.create({ chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginVertical: spacing.md } });
