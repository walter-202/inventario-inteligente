import { useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { BarcodeScanningResult, BarcodeType, CameraView, useCameraPermissions } from "expo-camera";
import { ActivityIndicator, Button, Card, Text } from "react-native-paper";
import type { Producto } from "../../../shared/types/domain";
import { buscarProductoPorCodigo } from "../api/productosApi";
import { esProductoNoEncontrado } from "../lib/productLookupErrors";
import { colors, spacing } from "../../../shared/theme";

const BARCODE_TYPES: BarcodeType[] = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "code93", "itf14", "codabar", "qr", "pdf417", "aztec", "datamatrix"];
type ScanState = "reading" | "searching" | "found" | "notFound" | "error";

export function BarcodeScannerView({ onProductFound, onCancel }: { onProductFound: (producto: Producto) => void; onCancel: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<ScanState>("reading");
  const [product, setProduct] = useState<Producto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);

  const handleScan = async ({ data }: BarcodeScanningResult) => {
    if (!active.current) return;
    active.current = false;
    setState("searching");
    try {
      const found = await buscarProductoPorCodigo(data);
      setProduct(found);
      setState("found");
    } catch (scanError) {
      if (esProductoNoEncontrado(scanError)) {
        setError("Producto no encontrado.");
        setState("notFound");
      } else {
        setError(scanError instanceof Error ? scanError.message : "No se pudo buscar el producto.");
        setState("error");
      }
    }
  };

  if (!permission) return <View style={styles.center}><ActivityIndicator /></View>;
  if (!permission.granted) return <View style={styles.center}><Text>{permission.canAskAgain ? "Necesitamos acceso a la cámara para escanear." : "Habilitá la cámara desde la configuración."}</Text><Button mode="contained" onPress={() => permission.canAskAgain ? requestPermission() : Linking.openSettings()}>{permission.canAskAgain ? "Permitir cámara" : "Abrir configuración"}</Button><Button onPress={onCancel}>Cancelar</Button></View>;
  return (
    <View style={styles.container}>
      {state === "reading" || state === "searching" ? (
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
          onBarcodeScanned={state === "reading" ? handleScan : undefined}
        />
      ) : (
        <View style={styles.center}>
          <Card>
            <Card.Content style={styles.center}>
              {state === "found" && product ? (
                <>
                  <Text variant="titleLarge">{product.nombre}</Text>
                  <Text>{product.codigo}</Text>
                  <Button mode="contained" onPress={() => onProductFound(product)}>Agregar a venta</Button>
                </>
              ) : state === "error" ? (
                <>
                  <Text variant="titleLarge">No se pudo completar la búsqueda</Text>
                  <Text>{error}</Text>
                  <Button mode="contained" onPress={() => { active.current = true; setState("reading"); setError(null); }}>Reintentar</Button>
                </>
              ) : (
                <>
                  <Text variant="titleLarge">Producto no encontrado</Text>
                  <Text>{error}</Text>
                  <Button mode="contained" onPress={() => { active.current = true; setState("reading"); setError(null); }}>Intentar nuevamente</Button>
                </>
              )}
            </Card.Content>
          </Card>
        </View>
      )}
      {state === "searching" ? <View style={styles.overlay}><ActivityIndicator color={colors.white} /><Text style={styles.overlayText}>Buscando producto...</Text></View> : null}
      <Button onPress={onCancel} textColor={colors.white} style={styles.cancel}>Cancelar</Button>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.black }, camera: { flex: 1 }, center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.lg }, overlay: { position: "absolute", top: "45%", alignSelf: "center", alignItems: "center", gap: spacing.sm }, overlayText: { color: colors.white }, cancel: { position: "absolute", bottom: spacing.xl, alignSelf: "center" } });
