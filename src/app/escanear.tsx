import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  BarcodeScanningResult,
  BarcodeType,
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import axios from "axios";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Producto,
  buscarProductoPorCodigo,
  extraerMensajeError,
} from "@/lib/api";
import { establecerProductoPendiente } from "@/lib/pendiente-venta";
import { colors, radius, spacing } from "@/constants/theme";
import { formatearPrecio } from "@/lib/utils";

const MENSAJE_CONEXION =
  "No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.";
const MENSAJE_NO_ENCONTRADO = "Producto no encontrado.";
const MENSAJE_PERMISO_DENEGADO =
  "El acceso a la cámara fue denegado. Habilitalo desde la configuración del dispositivo.";
const MENSAJE_PERMISO_NECESARIO =
  "Para escanear productos necesitamos acceder a la cámara de tu dispositivo.";

const TIPOS_CODIGO: BarcodeType[] = [
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "code128",
  "code39",
  "code93",
  "itf14",
  "codabar",
  "qr",
  "pdf417",
  "aztec",
  "datamatrix",
];

type EstadoEscaneo = "leyendo" | "buscando" | "producto" | "noEncontrado" | "error";

const INTERVALO_RELECTURA_MS = 2000;

function esCodigoNoEncontrado(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

export default function EscanearProductoScreen() {
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [estado, setEstado] = useState<EstadoEscaneo>("leyendo");
  const [producto, setProducto] = useState<Producto | null>(null);
  const [errorEscaneo, setErrorEscaneo] = useState<string | null>(null);

  const escaneoActivo = useRef(true);
  const ultimaLectura = useRef<{ valor: string; tiempo: number } | null>(null);
  const ultimoCodigo = useRef("");

  const procesarCodigo = async (codigo: string) => {
    escaneoActivo.current = false;
    ultimoCodigo.current = codigo;
    setProducto(null);
    setErrorEscaneo(null);
    setEstado("buscando");
    try {
      const encontrado = await buscarProductoPorCodigo(codigo);
      setProducto(encontrado);
      setEstado("producto");
    } catch (error) {
      if (esCodigoNoEncontrado(error)) {
        setEstado("noEncontrado");
      } else {
        setErrorEscaneo(extraerMensajeError(error, MENSAJE_CONEXION));
        setEstado("error");
      }
    }
  };

  const onBarcodeScanned = (resultado: BarcodeScanningResult) => {
    if (!escaneoActivo.current) return;
    const ahora = Date.now();
    const previa = ultimaLectura.current;
    if (
      previa &&
      previa.valor === resultado.data &&
      ahora - previa.tiempo < INTERVALO_RELECTURA_MS
    ) {
      return;
    }
    ultimaLectura.current = { valor: resultado.data, tiempo: ahora };
    procesarCodigo(resultado.data);
  };

  const volverALeer = () => {
    ultimaLectura.current = null;
    escaneoActivo.current = true;
    setProducto(null);
    setErrorEscaneo(null);
    setEstado("leyendo");
  };

  const reintentar = () => {
    if (ultimoCodigo.current) {
      procesarCodigo(ultimoCodigo.current);
    }
  };

  const agregarAVenta = () => {
    if (!producto) return;
    establecerProductoPendiente(producto);
    router.push("/nueva-venta");
  };

  if (permiso === null) {
    return (
      <SafeAreaView style={styles.pantalla} edges={["top"]}>
        <View style={styles.centro}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.textoSecundario}>Solicitando permiso de cámara...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permiso.granted) {
    return (
      <SafeAreaView style={styles.pantalla} edges={["top"]}>
        <View style={styles.centro}>
          <Text style={styles.titulo}>Permiso de cámara</Text>
          <Text style={styles.textoSecundario}>
            {permiso.canAskAgain ? MENSAJE_PERMISO_NECESARIO : MENSAJE_PERMISO_DENEGADO}
          </Text>
          <Pressable
            style={styles.boton}
            onPress={() => (permiso.canAskAgain ? pedirPermiso() : Linking.openSettings())}
          >
            <Text style={styles.textoBoton}>
              {permiso.canAskAgain ? "Permitir acceso a la cámara" : "Abrir configuración"}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.pantalla} edges={["top", "bottom"]}>
      <View style={styles.camaraContenedor}>
        <CameraView
          style={styles.camara}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: TIPOS_CODIGO }}
          onBarcodeScanned={onBarcodeScanned}
        >
          <View style={styles.barraSuperior}>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={styles.textoBarra}>Volver</Text>
            </Pressable>
            <Text style={styles.titulo}>Escanear producto</Text>
            <View style={styles.espacioBarra} />
          </View>

          <View style={styles.zonaGuia}>
            <View style={styles.marco}>
              <View style={[styles.esquina, styles.esquinaTopLeft]} />
              <View style={[styles.esquina, styles.esquinaTopRight]} />
              <View style={[styles.esquina, styles.esquinaBottomLeft]} />
              <View style={[styles.esquina, styles.esquinaBottomRight]} />
            </View>
            <Text style={styles.textoGuia}>Coloca el código dentro del marco</Text>
          </View>

          {estado !== "leyendo" && (
            <View style={styles.tarjetaResultado}>
              {estado === "buscando" && (
                <View style={styles.contenidoResultado}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.textoResultado}>Buscando producto...</Text>
                </View>
              )}

              {estado === "producto" && producto && (
                <View style={styles.contenidoResultado}>
                  <Text style={styles.tituloResultado}>Producto encontrado</Text>
                  <Text style={styles.nombreProducto} numberOfLines={2}>
                    {producto.nombre}
                  </Text>
                  <Text style={styles.detalleProducto}>Código: {producto.codigo}</Text>
                  <Text style={styles.detalleProducto}>Categoría: {producto.categoria}</Text>
                  <Text style={styles.precioProducto}>
                    {formatearPrecio(producto.precio)}
                  </Text>
                  <View style={styles.filaBotones}>
                    <Pressable style={styles.botonSecundario} onPress={volverALeer}>
                      <Text style={styles.textoBotonSecundario}>Escanear otro</Text>
                    </Pressable>
                    <Pressable style={styles.boton} onPress={agregarAVenta}>
                      <Text style={styles.textoBoton}>Agregar a venta</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {estado === "noEncontrado" && (
                <View style={styles.contenidoResultado}>
                  <Text style={styles.tituloResultado}>{MENSAJE_NO_ENCONTRADO}</Text>
                  <Text style={styles.textoResultado}>
                    El código escaneado no corresponde a ningún producto registrado.
                  </Text>
                  <Pressable style={styles.boton} onPress={volverALeer}>
                    <Text style={styles.textoBoton}>Intentar nuevamente</Text>
                  </Pressable>
                </View>
              )}

              {estado === "error" && (
                <View style={styles.contenidoResultado}>
                  <Text style={styles.tituloResultado}>No se pudo completar la búsqueda</Text>
                  <Text style={styles.textoError}>{errorEscaneo}</Text>
                  <View style={styles.filaBotones}>
                    <Pressable style={styles.botonSecundario} onPress={volverALeer}>
                      <Text style={styles.textoBotonSecundario}>Cancelar</Text>
                    </Pressable>
                    <Pressable style={styles.boton} onPress={reintentar}>
                      <Text style={styles.textoBoton}>Reintentar</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          )}
        </CameraView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colors.black,
  },
  centro: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colors.background,
    gap: spacing.lg,
  },
  camaraContenedor: {
    flex: 1,
  },
  camara: {
    flex: 1,
  },
  barraSuperior: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  textoBarra: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.white,
  },
  titulo: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.white,
    textAlign: "center",
  },
  espacioBarra: {
    width: 60,
  },
  zonaGuia: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
  marco: {
    width: 250,
    height: 250,
  },
  esquina: {
    position: "absolute",
    width: 42,
    height: 42,
    borderColor: colors.white,
    borderWidth: 4,
  },
  esquinaTopLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: radius.md,
  },
  esquinaTopRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: radius.md,
  },
  esquinaBottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: radius.md,
  },
  esquinaBottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: radius.md,
  },
  textoGuia: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.white,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
  tarjetaResultado: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  contenidoResultado: {
    alignItems: "stretch",
    gap: spacing.sm,
  },
  tituloResultado: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  nombreProducto: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  detalleProducto: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  precioProducto: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.primary,
    marginTop: spacing.sm,
  },
  textoResultado: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
  },
  textoError: {
    fontSize: 14,
    color: colors.danger,
    textAlign: "center",
  },
  textoSecundario: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
  },
  filaBotones: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  boton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  botonSecundario: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  textoBoton: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.white,
  },
  textoBotonSecundario: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.primary,
  },
});