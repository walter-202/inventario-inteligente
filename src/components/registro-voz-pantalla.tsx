import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import {
  InventarioItem,
  Producto,
  Sucursal,
  extraerMensajeError,
  obtenerInventario,
  obtenerSucursales,
  registrarVenta,
} from "@/lib/api";
import {
  InterpretacionError,
  interpretarVoz,
  type LineaInterpretada,
} from "@/services/voiceService";
import { Chip } from "@/components/chip";
import { colors, radius, spacing } from "@/constants/theme";
import { formatearPrecio } from "@/lib/utils";

const MENSAJE_CONEXION =
  "No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.";
const MENSAJE_SIN_SUCURSALES = "No hay sucursales disponibles.";
const MENSAJE_PERMISO_NECESARIO =
  "Para registrar operaciones por voz necesitamos acceso al micrófono de tu dispositivo.";
const MENSAJE_PERMISO_DENEGADO =
  "El acceso al micrófono fue denegado. Habilitalo desde la configuración del dispositivo.";

const IDIOMA_VOZ = "es-ES";

interface PermisoVoz {
  granted: boolean;
  status: string;
  canAskAgain: boolean;
  expires: string | number;
  restricted?: boolean;
}

interface LineaConfirmacion {
  producto: Producto;
  cantidad: number;
  cantidadSolicitada: number;
  stock: number;
  ajustada: boolean;
  sinStock: boolean;
}

function mensajeErrorVoz(error: string): string {
  switch (error) {
    case "network":
      return "Error de red durante el reconocimiento de voz.";
    case "no-speech":
      return "No se detectó habla. Mantené presionado y hablá nuevamente.";
    case "not-allowed":
      return MENSAJE_PERMISO_DENEGADO;
    case "language-not-supported":
      return "Reconocimiento de voz no disponible para español en este dispositivo.";
    case "service-not-allowed":
      return "Reconocimiento de voz no disponible en este dispositivo.";
    case "busy":
      return "El reconocimiento de voz está ocupado. Intentá nuevamente.";
    case "aborted":
      return "Reconocimiento cancelado.";
    case "audio-capture":
      return "No se pudo capturar el audio del micrófono.";
    default:
      return "Ocurrió un error durante el reconocimiento de voz.";
  }
}

function unirProductosIguales(lineas: LineaInterpretada[]): LineaInterpretada[] {
  const agrupadas = new Map<number, LineaInterpretada>();
  for (const linea of lineas) {
    const existente = agrupadas.get(linea.producto.id);
    if (existente) {
      agrupadas.set(linea.producto.id, {
        producto: linea.producto,
        cantidadSolicitada:
          existente.cantidadSolicitada + linea.cantidadSolicitada,
      });
    } else {
      agrupadas.set(linea.producto.id, { ...linea });
    }
  }
  return Array.from(agrupadas.values());
}

export default function RegistroVozPantalla() {
  const [permiso, setPermiso] = useState<PermisoVoz | undefined | null>(
    undefined
  );

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalCargando, setSucursalCargando] = useState(true);
  const [errorSucursales, setErrorSucursales] = useState<string | null>(null);
  const [sucursalId, setSucursalId] = useState<number | null>(null);

  const [inventario, setInventario] = useState<InventarioItem[]>([]);
  const [inventarioCargando, setInventarioCargando] = useState(false);
  const [errorInventario, setErrorInventario] = useState<string | null>(null);

  const [texto, setTexto] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [errorVoz, setErrorVoz] = useState<string | null>(null);
  const [aclaracion, setAclaracion] = useState<string | null>(null);
  const [grabando, setGrabando] = useState(false);

  const [lineas, setLineas] = useState<LineaConfirmacion[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorVenta, setErrorVenta] = useState<string | null>(null);

  const secuenciaInventario = useRef(0);

  const cargarSucursales = useCallback(async () => {
    setSucursalCargando(true);
    setErrorSucursales(null);
    try {
      const data = await obtenerSucursales();
      setSucursales(data);
      setSucursalId((prev) => {
        if (prev !== null && data.some((s) => s.id === prev)) return prev;
        return data.length > 0 ? data[0].id : null;
      });
    } catch {
      setErrorSucursales(MENSAJE_CONEXION);
      setSucursales([]);
    } finally {
      setSucursalCargando(false);
    }
  }, []);

  const cargarInventario = useCallback(async (targetId: number) => {
    const id = ++secuenciaInventario.current;
    setInventarioCargando(true);
    setErrorInventario(null);
    try {
      const data = await obtenerInventario(targetId);
      if (id !== secuenciaInventario.current) return;
      setInventario(data);
    } catch {
      if (id !== secuenciaInventario.current) return;
      setErrorInventario(MENSAJE_CONEXION);
    } finally {
      if (id !== secuenciaInventario.current) return;
      setInventarioCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarSucursales();
  }, [cargarSucursales]);

  useEffect(() => {
    if (sucursalId !== null) {
      cargarInventario(sucursalId);
    }
  }, [sucursalId, cargarInventario]);

  useEffect(() => {
    ExpoSpeechRecognitionModule.getPermissionsAsync()
      .then(setPermiso)
      .catch(() => setPermiso(null));
  }, []);

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results?.[0]?.transcript ?? "";
    if (transcript) setTexto(transcript);
    if (event.isFinal) setGrabando(false);
  });

  useSpeechRecognitionEvent("error", (event) => {
    setGrabando(false);
    if (event.error !== "aborted") {
      setErrorVoz(mensajeErrorVoz(event.error));
    }
  });

  useSpeechRecognitionEvent("end", () => {
    setGrabando(false);
  });

  const pedirPermiso = async () => {
    try {
      const resultado = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      setPermiso(resultado);
    } catch {
      setPermiso(null);
    }
  };

  const habilitarEnAjustes = () => {
    Linking.openSettings();
  };

  const stockPorProducto = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of inventario) map.set(item.producto_id, item.cantidad);
    return map;
  }, [inventario]);

  const puedeGrabar = permiso?.granted === true && !procesando;

  const empezarGrabar = () => {
    if (!puedeGrabar) return;
    setErrorVoz(null);
    setTexto("");
    setGrabando(true);
    ExpoSpeechRecognitionModule.start({
      lang: IDIOMA_VOZ,
      interimResults: true,
      maxAlternatives: 1,
    });
  };

  const terminarGrabar = () => {
    if (!grabando) return;
    ExpoSpeechRecognitionModule.stop();
  };

  const puedeInterpretar =
    sucursalId !== null &&
    !inventarioCargando &&
    errorInventario === null &&
    texto.trim().length > 0 &&
    !procesando;

  const procesar = async () => {
    const frase = texto.trim();
    if (!frase || sucursalId === null) return;

    setProcesando(true);
    setAclaracion(null);
    setErrorVoz(null);
    try {
      const resultado = await interpretarVoz(frase);
      if (resultado.tipo === "aclaracion") {
        setAclaracion(resultado.mensaje);
        return;
      }

      const agrupadas = unirProductosIguales(resultado.lineas);
      const lineasConStock: LineaConfirmacion[] = agrupadas.map((linea) => {
        const stock = stockPorProducto.get(linea.producto.id) ?? 0;
        const sinStock = stock <= 0;
        const cantidad = sinStock
          ? 0
          : Math.min(linea.cantidadSolicitada, stock);
        return {
          producto: linea.producto,
          cantidad,
          cantidadSolicitada: linea.cantidadSolicitada,
          stock,
          ajustada: !sinStock && cantidad !== linea.cantidadSolicitada,
          sinStock,
        };
      });

      const sinStock = lineasConStock.find((linea) => linea.sinStock);
      if (sinStock) {
        setAclaracion(
          `El producto "${sinStock.producto.nombre}" no tiene stock disponible en la sucursal seleccionada.`
        );
        return;
      }

      setLineas(lineasConStock);
      setErrorVenta(null);
      setModalVisible(true);
    } catch (error) {
      if (error instanceof InterpretacionError) {
        setAclaracion(error.message);
      } else {
        setAclaracion(MENSAJE_CONEXION);
      }
    } finally {
      setProcesando(false);
    }
  };

  const cerrarModal = () => {
    if (enviando) return;
    setModalVisible(false);
  };

  const corregir = () => {
    if (enviando) return;
    setModalVisible(false);
    setAclaracion(
      "Corregí el texto reconocido y presioná Interpretar nuevamente."
    );
  };

  const confirmar = async () => {
    if (sucursalId === null || lineas.length === 0) return;
    setEnviando(true);
    setErrorVenta(null);
    try {
      await registrarVenta({
        sucursal_id: sucursalId,
        metodo_pago: "efectivo",
        productos: lineas.map((linea) => ({
          producto_id: linea.producto.id,
          cantidad: linea.cantidad,
        })),
      });
      setModalVisible(false);
      setLineas([]);
      setTexto("");
      setAclaracion(null);
      cargarInventario(sucursalId);
      Alert.alert(
        "Venta registrada",
        "La venta por voz se registró correctamente."
      );
    } catch (err) {
      setErrorVenta(extraerMensajeError(err, MENSAJE_CONEXION));
    } finally {
      setEnviando(false);
    }
  };

  const total = useMemo(
    () => lineas.reduce((acc, l) => acc + l.producto.precio * l.cantidad, 0),
    [lineas]
  );

  const nombreSucursal =
    sucursales.find((s) => s.id === sucursalId)?.nombre ?? "";

  if (permiso === undefined) {
    return (
      <SafeAreaView style={styles.pantalla} edges={["top"]}>
        <View style={styles.zonaCarga}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.textoSecundario}>Verificando permisos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (permiso === null || !permiso.granted) {
    return (
      <SafeAreaView style={styles.pantalla} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.contenido}>
          <Text style={styles.titulo}>Registro por voz</Text>
          <View style={styles.tarjetaInfo}>
            <Text style={styles.textoInfo}>{MENSAJE_PERMISO_NECESARIO}</Text>
            {permiso && permiso.canAskAgain ? (
              <Pressable style={styles.boton} onPress={pedirPermiso}>
                <Text style={styles.textoBoton}>Permitir acceso al micrófono</Text>
              </Pressable>
            ) : (
              <>
                <Text style={styles.textoError}>{MENSAJE_PERMISO_DENEGADO}</Text>
                <Pressable style={styles.boton} onPress={habilitarEnAjustes}>
                  <Text style={styles.textoBoton}>Abrir configuración</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.pantalla} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.titulo}>Registro por voz</Text>

        <Text style={styles.etiquetaSeccion}>Sucursal</Text>
        {sucursalCargando ? (
          <View style={styles.zonaCarga}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.textoSecundario}>Cargando sucursales...</Text>
          </View>
        ) : errorSucursales ? (
          <View style={styles.zonaError}>
            <Text style={styles.textoError}>{errorSucursales}</Text>
            <Pressable style={styles.boton} onPress={cargarSucursales}>
              <Text style={styles.textoBoton}>Reintentar</Text>
            </Pressable>
          </View>
        ) : sucursales.length === 0 ? (
          <Text style={styles.textoSecundario}>{MENSAJE_SIN_SUCURSALES}</Text>
        ) : (
          <View style={styles.chipsFila}>
            {sucursales.map((s) => (
              <Chip
                key={s.id}
                texto={s.nombre}
                activo={sucursalId === s.id}
                onPress={() => setSucursalId(s.id)}
              />
            ))}
          </View>
        )}

        {errorInventario && (
          <View style={styles.zonaError}>
            <Text style={styles.textoError}>{errorInventario}</Text>
            <Pressable
              style={styles.boton}
              onPress={() =>
                sucursalId !== null && cargarInventario(sucursalId)
              }
            >
              <Text style={styles.textoBoton}>Reintentar</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.etiquetaSeccion}>1. Hablá la operación</Text>
        <Text style={styles.textoSecundario}>
          Por ejemplo: "vendí dos cafés y un paquete de pañales".
        </Text>

        <View style={styles.zonaMic}>
          <Pressable
            style={[
              styles.botonMic,
              grabando ? styles.botonMicGrabando : styles.botonMicNormal,
            ]}
            onPressIn={empezarGrabar}
            onPressOut={terminarGrabar}
            disabled={!puedeGrabar}
          >
            <View
              style={[
                styles.puntoMic,
                grabando ? styles.puntoMicGrabando : styles.puntoMicNormal,
              ]}
            />
          </Pressable>
          <Text style={styles.textoEstadoMic}>
            {grabando
              ? "Escuchando... solta para terminar"
              : "Mantené presionado para hablar"}
          </Text>
          {errorVoz && <Text style={styles.textoError}>{errorVoz}</Text>}
        </View>

        <Text style={styles.etiquetaSeccion}>2. Texto reconocido</Text>
        <TextInput
          style={styles.buscador}
          placeholder="El texto reconocido aparece aquí"
          placeholderTextColor={colors.textSecondary}
          value={texto}
          onChangeText={setTexto}
          multiline
          autoCorrect={false}
        />

        {inventarioCargando && (
          <View style={styles.zonaCarga}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.textoSecundario}>Cargando inventario...</Text>
          </View>
        )}

        <Pressable
          style={[
            styles.botonRegistrar,
            !puedeInterpretar && styles.botonDeshabilitado,
          ]}
          disabled={!puedeInterpretar}
          onPress={procesar}
        >
          {procesando ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.textoBoton}>
              {aclaracion ? "Interpretar de nuevo" : "Interpretar"}
            </Text>
          )}
        </Pressable>

        {aclaracion && (
          <View style={styles.tarjetaAclaracion}>
            <Text style={styles.textoAclaracion}>{aclaracion}</Text>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={cerrarModal}
      >
        <View style={styles.fondoModal}>
          <View style={styles.tarjetaModal}>
            {enviando ? (
              <View style={styles.contenidoModal}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.textoModal}>Registrando venta...</Text>
              </View>
            ) : errorVenta ? (
              <View style={styles.contenidoModal}>
                <Text style={styles.tituloModal}>
                  No se pudo registrar la venta
                </Text>
                <Text style={styles.textoModal}>{errorVenta}</Text>
                <Pressable style={styles.boton} onPress={confirmar}>
                  <Text style={styles.textoBoton}>Reintentar</Text>
                </Pressable>
                <Pressable style={styles.botonSecundario} onPress={cerrarModal}>
                  <Text style={styles.textoBotonSecundario}>Cancelar</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.contenidoModal}>
                <Text style={styles.tituloModal}>Confirmar venta</Text>
                <Text style={styles.textoModal}>
                  Sucursal: {nombreSucursal}
                  {"\n"}Método de pago: Efectivo
                </Text>
                <View style={styles.listaModal}>
                  {lineas.map((linea) => (
                    <View key={linea.producto.id} style={styles.filaLinea}>
                      <View style={styles.columnaLinea}>
                        <Text style={styles.nombreLinea} numberOfLines={2}>
                          {linea.producto.nombre}
                        </Text>
                        <Text style={styles.detalleLinea} numberOfLines={1}>
                          {linea.cantidad} × {formatearPrecio(linea.producto.precio)}
                        </Text>
                        {linea.ajustada && (
                          <Text style={styles.avisoStock}>
                            Stock disponible: {linea.stock} · se ajustó la cantidad
                          </Text>
                        )}
                      </View>
                      <Text style={styles.subtotalLinea}>
                        {formatearPrecio(linea.producto.precio * linea.cantidad)}
                      </Text>
                    </View>
                  ))}
                </View>
                <View style={styles.filaTotal}>
                  <Text style={styles.textoTotal}>Total</Text>
                  <Text style={styles.montoTotal}>{formatearPrecio(total)}</Text>
                </View>
                <Pressable style={styles.boton} onPress={confirmar}>
                  <Text style={styles.textoBoton}>Confirmar venta</Text>
                </Pressable>
                <Pressable style={styles.botonSecundario} onPress={corregir}>
                  <Text style={styles.textoBotonSecundario}>Corregir productos</Text>
                </Pressable>
                <Pressable style={styles.botonSecundario} onPress={cerrarModal}>
                  <Text style={styles.textoBotonSecundario}>Cancelar</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contenido: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  titulo: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  etiquetaSeccion: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  textoSecundario: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  chipsFila: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  zonaCarga: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  zonaError: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  tarjetaInfo: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.lg,
  },
  textoInfo: {
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: "center",
    lineHeight: 22,
  },
  zonaMic: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  botonMic: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  botonMicNormal: {
    backgroundColor: colors.primary,
  },
  botonMicGrabando: {
    backgroundColor: colors.black,
  },
  puntoMic: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  puntoMicNormal: {
    backgroundColor: colors.white,
  },
  puntoMicGrabando: {
    backgroundColor: colors.danger,
  },
  textoEstadoMic: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
  },
  buscador: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 60,
    textAlignVertical: "top",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  botonRegistrar: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  botonDeshabilitado: {
    backgroundColor: colors.border,
  },
  boton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  botonSecundario: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignSelf: "stretch",
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
    color: colors.textSecondary,
  },
  textoError: {
    fontSize: 14,
    textAlign: "center",
    color: colors.danger,
  },
  tarjetaAclaracion: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  textoAclaracion: {
    fontSize: 14,
    color: colors.danger,
    textAlign: "center",
    lineHeight: 20,
  },
  fondoModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  tarjetaModal: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 420,
  },
  contenidoModal: {
    alignItems: "center",
    gap: spacing.md,
  },
  tituloModal: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  textoModal: {
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: "center",
    lineHeight: 22,
  },
  listaModal: {
    alignSelf: "stretch",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  filaLinea: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  columnaLinea: {
    flex: 1,
  },
  nombreLinea: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  detalleLinea: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  avisoStock: {
    fontSize: 11,
    color: colors.danger,
    marginTop: 2,
  },
  subtotalLinea: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  filaTotal: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  textoTotal: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  montoTotal: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.primary,
  },
});