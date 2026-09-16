import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  InventarioItem,
  Producto,
  Sucursal,
  extraerMensajeError,
  obtenerInventario,
  obtenerProductos,
  obtenerSucursales,
  registrarEntrada,
  registrarSalida,
  registrarTransferencia,
} from "@/lib/api";
import { Chip } from "@/components/chip";
import { colors, radius, spacing } from "@/constants/theme";
import { formatearPrecio } from "@/lib/utils";

const MENSAJE_CONEXION =
  "No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.";
const MENSAJE_SIN_SUCURSALES = "No hay sucursales disponibles.";
const MENSAJE_SIN_COINCIDENCIAS = "No se encontraron productos.";

const TIPOS = [
  { valor: "entrada", etiqueta: "Entrada" },
  { valor: "salida", etiqueta: "Salida" },
  { valor: "transferencia", etiqueta: "Transferencia" },
] as const;

type TipoMovimiento = (typeof TIPOS)[number]["valor"];

function tituloTipo(tipo: TipoMovimiento): string {
  return TIPOS.find((t) => t.valor === tipo)?.etiqueta ?? tipo;
}

interface FilaResultadoProps {
  producto: Producto;
  onSeleccionar: (producto: Producto) => void;
}

function FilaResultado({ producto, onSeleccionar }: FilaResultadoProps) {
  return (
    <Pressable style={styles.tarjetaResultado} onPress={() => onSeleccionar(producto)}>
      <View style={styles.columnaResultado}>
        <Text style={styles.nombreProducto} numberOfLines={1}>
          {producto.nombre}
        </Text>
        <Text style={styles.detalleProducto} numberOfLines={1}>
          Código: {producto.codigo} · {formatearPrecio(producto.precio)}
        </Text>
      </View>
      <Pressable
        style={styles.botonSeleccionar}
        onPress={() => onSeleccionar(producto)}
      >
        <Text style={styles.textoBotonSeleccionar}>Elegir</Text>
      </Pressable>
    </Pressable>
  );
}

export default function MovimientosScreen() {
  const [tipo, setTipo] = useState<TipoMovimiento>("entrada");

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalCargando, setSucursalCargando] = useState(true);
  const [errorSucursales, setErrorSucursales] = useState<string | null>(null);
  const [sucursalId, setSucursalId] = useState<number | null>(null);
  const [sucursalOrigenId, setSucursalOrigenId] = useState<number | null>(null);
  const [sucursalDestinoId, setSucursalDestinoId] = useState<number | null>(
    null
  );

  const [inventario, setInventario] = useState<InventarioItem[]>([]);
  const [inventarioCargando, setInventarioCargando] = useState(false);
  const [errorInventario, setErrorInventario] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplazada, setBusquedaAplazada] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState<Producto | null>(
    null
  );

  const [cantidad, setCantidad] = useState("");
  const [observacion, setObservacion] = useState("");
  const [errores, setErrores] = useState<string[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorVenta, setErrorVenta] = useState<string | null>(null);

  const secuenciaBusqueda = useRef(0);
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
      setSucursalOrigenId((prev) => {
        if (prev !== null && data.some((s) => s.id === prev)) return prev;
        return data.length > 0 ? data[0].id : null;
      });
      setSucursalDestinoId((prev) => {
        if (prev !== null && data.some((s) => s.id === prev)) return prev;
        return data.length > 1 ? data[1].id : null;
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
    const timer = setTimeout(() => setBusquedaAplazada(busqueda), 400);
    return () => clearTimeout(timer);
  }, [busqueda]);

  const sucursalStockId =
    tipo === "transferencia" ? sucursalOrigenId : sucursalId;

  useEffect(() => {
    if (sucursalStockId !== null) {
      cargarInventario(sucursalStockId);
    }
  }, [sucursalStockId, cargarInventario]);

  useEffect(() => {
    const texto = busquedaAplazada.trim();
    if (!texto || productoSeleccionado !== null) {
      setResultados([]);
      return;
    }
    const id = ++secuenciaBusqueda.current;
    setBuscando(true);
    obtenerProductos({ q: texto })
      .then((res) => {
        if (id === secuenciaBusqueda.current) setResultados(res.data);
      })
      .catch(() => {
        if (id === secuenciaBusqueda.current) setResultados([]);
      })
      .finally(() => {
        if (id === secuenciaBusqueda.current) setBuscando(false);
      });
  }, [busquedaAplazada, productoSeleccionado]);

  const stockPorProducto = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of inventario) map.set(item.producto_id, item.cantidad);
    return map;
  }, [inventario]);

  const cambiarTipo = (nuevoTipo: TipoMovimiento) => {
    if (nuevoTipo === tipo) return;
    setTipo(nuevoTipo);
    setCantidad("");
    setObservacion("");
    setErrores([]);
  };

  const seleccionarProducto = (producto: Producto) => {
    setProductoSeleccionado(producto);
    setBusqueda("");
    setResultados([]);
    setErrores([]);
  };

  const quitarProducto = () => {
    setProductoSeleccionado(null);
    setResultados([]);
    setErrores([]);
  };

  const nombreSucursalStock = sucursales.find(
    (s) => s.id === sucursalStockId
  )?.nombre;

  const stockDisponible =
    productoSeleccionado !== null
      ? stockPorProducto.get(productoSeleccionado.id) ?? 0
      : 0;

  const validar = (): string[] => {
    const lista: string[] = [];

    if (tipo === "transferencia") {
      if (sucursales.length < 2) {
        lista.push(
          "Se necesitan al menos dos sucursales para realizar una transferencia."
        );
      }
      if (sucursalOrigenId === sucursalDestinoId) {
        lista.push(
          "Las sucursales de origen y destino deben ser diferentes."
        );
      }
    } else if (sucursalId === null) {
      lista.push("Seleccioná la sucursal.");
    }

    if (productoSeleccionado === null) {
      lista.push("Seleccioná un producto.");
    }

    const cantidadTexto = cantidad.trim();
    if (!cantidadTexto) {
      lista.push("Indicá la cantidad.");
    } else if (!/^\d+$/.test(cantidadTexto)) {
      lista.push("La cantidad debe ser un número entero mayor o igual a 1.");
    } else {
      const cantidadNumerica = parseInt(cantidadTexto, 10);
      if (cantidadNumerica < 1) {
        lista.push("La cantidad debe ser mayor o igual a 1.");
      } else if (
        productoSeleccionado !== null &&
        (tipo === "salida" || tipo === "transferencia") &&
        cantidadNumerica > stockDisponible
      ) {
        lista.push(
          `Stock insuficiente en la sucursal. Disponible: ${stockDisponible}.`
        );
      }
    }

    return lista;
  };

  const abrirConfirmacion = () => {
    const erroresFormulario = validar();
    setErrores(erroresFormulario);
    if (erroresFormulario.length > 0) return;
    setErrorVenta(null);
    setModalVisible(true);
  };

  const cerrarModal = () => {
    if (enviando) return;
    setModalVisible(false);
  };

  const confirmar = async () => {
    if (productoSeleccionado === null) return;

    const cantidadNumerica = parseInt(cantidad.trim(), 10);
    const observacionTexto = observacion.trim();
    const base = {
      producto_id: productoSeleccionado.id,
      cantidad: cantidadNumerica,
      ...(observacionTexto ? { observacion: observacionTexto } : {}),
    };

    setEnviando(true);
    setErrorVenta(null);
    try {
      if (tipo === "entrada" && sucursalId !== null) {
        await registrarEntrada({ ...base, sucursal_id: sucursalId });
      } else if (tipo === "salida" && sucursalId !== null) {
        await registrarSalida({ ...base, sucursal_id: sucursalId });
      } else if (
        tipo === "transferencia" &&
        sucursalOrigenId !== null &&
        sucursalDestinoId !== null
      ) {
        await registrarTransferencia({
          ...base,
          sucursal_origen_id: sucursalOrigenId,
          sucursal_destino_id: sucursalDestinoId,
        });
      }

      setModalVisible(false);
      setCantidad("");
      setObservacion("");
      setProductoSeleccionado(null);
      setErrores([]);
      if (sucursalStockId !== null) cargarInventario(sucursalStockId);

      Alert.alert(
        `${tituloTipo(tipo)} registrada`,
        `La ${tituloTipo(tipo).toLowerCase()} se registró correctamente.`
      );
    } catch (err) {
      setErrorVenta(extraerMensajeError(err, MENSAJE_CONEXION));
    } finally {
      setEnviando(false);
    }
  };

  const nombreSucursalSeleccionada = sucursales.find(
    (s) => s.id === (tipo === "transferencia" ? sucursalOrigenId : sucursalId)
  )?.nombre;

  const nombreSucursalDestino = sucursales.find(
    (s) => s.id === sucursalDestinoId
  )?.nombre;

  const descripcionModal = useMemo(() => {
    const lineas: string[] = [];
    if (tipo === "transferencia") {
      lineas.push(
        `Transferencia: ${nombreSucursalSeleccionada ?? "-"} → ${nombreSucursalDestino ?? "-"}`
      );
    } else {
      lineas.push(
        `${tituloTipo(tipo)}: ${nombreSucursalSeleccionada ?? "-"}`
      );
    }
    if (productoSeleccionado) {
      lineas.push(`Producto: ${productoSeleccionado.nombre}`);
    }
    lineas.push(`Cantidad: ${cantidad.trim()}`);
    const observacionTexto = observacion.trim();
    if (observacionTexto) lineas.push(`Observación: ${observacionTexto}`);
    return lineas.join("\n");
  }, [
    tipo,
    nombreSucursalSeleccionada,
    nombreSucursalDestino,
    productoSeleccionado,
    cantidad,
    observacion,
  ]);

  const seleccionarSucursal = (id: number) => {
    if (id === sucursalId) return;
    setSucursalId(id);
    setInventario([]);
    setErrores([]);
  };

  const seleccionarOrigen = (id: number) => {
    if (id === sucursalOrigenId) return;
    setSucursalOrigenId(id);
    setInventario([]);
    setErrores([]);
  };

  const seleccionarDestino = (id: number) => {
    if (id === sucursalDestinoId) return;
    setSucursalDestinoId(id);
    setErrores([]);
  };

  return (
    <SafeAreaView style={styles.pantalla} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.titulo}>Movimientos de inventario</Text>

        <Text style={styles.etiquetaSeccion}>Operación</Text>
        <View style={styles.chipsFila}>
          {TIPOS.map((t) => (
            <Chip
              key={t.valor}
              texto={t.etiqueta}
              activo={tipo === t.valor}
              onPress={() => cambiarTipo(t.valor)}
            />
          ))}
        </View>

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
        ) : tipo === "transferencia" ? (
          <>
            <Text style={styles.etiquetaSeccion}>Sucursal de origen</Text>
            <View style={styles.chipsFila}>
              {sucursales.map((s) => (
                <Chip
                  key={`o-${s.id}`}
                  texto={s.nombre}
                  activo={sucursalOrigenId === s.id}
                  onPress={() => seleccionarOrigen(s.id)}
                />
              ))}
            </View>
            <Text style={styles.etiquetaSeccion}>Sucursal de destino</Text>
            <View style={styles.chipsFila}>
              {sucursales.map((s) => (
                <Chip
                  key={`d-${s.id}`}
                  texto={s.nombre}
                  activo={sucursalDestinoId === s.id}
                  onPress={() => seleccionarDestino(s.id)}
                />
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.etiquetaSeccion}>Sucursal</Text>
            <View style={styles.chipsFila}>
              {sucursales.map((s) => (
                <Chip
                  key={s.id}
                  texto={s.nombre}
                  activo={sucursalId === s.id}
                  onPress={() => seleccionarSucursal(s.id)}
                />
              ))}
            </View>
          </>
        )}

        {errorInventario && (
          <View style={styles.zonaError}>
            <Text style={styles.textoError}>{errorInventario}</Text>
            <Pressable
              style={styles.boton}
              onPress={() =>
                sucursalStockId !== null && cargarInventario(sucursalStockId)
              }
            >
              <Text style={styles.textoBoton}>Reintentar</Text>
            </Pressable>
          </View>
        )}

        {productoSeleccionado ? (
          <>
            <Text style={styles.etiquetaSeccion}>Producto seleccionado</Text>
            <View style={styles.tarjetaProducto}>
              <View style={styles.columnaResultado}>
                <Text style={styles.nombreProducto} numberOfLines={1}>
                  {productoSeleccionado.nombre}
                </Text>
                <Text style={styles.detalleProducto} numberOfLines={1}>
                  Código: {productoSeleccionado.codigo} ·{" "}
                  {formatearPrecio(productoSeleccionado.precio)}
                </Text>
                {!inventarioCargando && (
                  <Text style={styles.stockDisponible}>
                    Stock en {nombreSucursalStock ?? "la sucursal"}:{" "}
                    {stockDisponible}
                  </Text>
                )}
              </View>
              <Pressable hitSlop={8} onPress={quitarProducto}>
                <Text style={styles.quitar}>Quitar</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.etiquetaSeccion}>Buscar producto</Text>
            <TextInput
              style={styles.buscador}
              placeholder="Buscar por nombre o código"
              placeholderTextColor={colors.textSecondary}
              value={busqueda}
              onChangeText={setBusqueda}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {buscando && (
              <View style={styles.zonaCarga}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.textoSecundario}>Buscando productos...</Text>
              </View>
            )}
            {!buscando && busqueda.trim().length > 0 && resultados.length === 0 && (
              <Text style={styles.textoSecundario}>
                {MENSAJE_SIN_COINCIDENCIAS}
              </Text>
            )}
            {resultados.length > 0 && (
              <View style={styles.zonaResultados}>
                {resultados.map((p) => (
                  <FilaResultado
                    key={p.id}
                    producto={p}
                    onSeleccionar={seleccionarProducto}
                  />
                ))}
              </View>
            )}
          </>
        )}

        {inventarioCargando && (
          <View style={styles.zonaCarga}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.textoSecundario}>Cargando inventario...</Text>
          </View>
        )}

        <Text style={styles.etiquetaSeccion}>Cantidad</Text>
        <TextInput
          style={styles.campo}
          placeholder="0"
          placeholderTextColor={colors.textSecondary}
          value={cantidad}
          onChangeText={setCantidad}
          keyboardType="number-pad"
        />

        <Text style={styles.etiquetaSeccion}>Observación (opcional)</Text>
        <TextInput
          style={[styles.campo, styles.campoObservacion]}
          placeholder="Motivo de la operación"
          placeholderTextColor={colors.textSecondary}
          value={observacion}
          onChangeText={setObservacion}
          multiline
          maxLength={500}
        />

        {errores.length > 0 && (
          <View style={styles.tarjetaErrores}>
            {errores.map((mensaje, indice) => (
              <Text key={indice} style={styles.textoError}>
                {mensaje}
              </Text>
            ))}
          </View>
        )}

        <Pressable
          style={[styles.botonRegistrar, enviando && styles.botonDeshabilitado]}
          disabled={enviando}
          onPress={abrirConfirmacion}
        >
          <Text style={styles.textoBoton}>
            Registrar {tituloTipo(tipo).toLowerCase()}
          </Text>
        </Pressable>
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
                <Text style={styles.textoModal}>
                  {`Registrando ${tituloTipo(tipo).toLowerCase()}...`}
                </Text>
              </View>
            ) : errorVenta ? (
              <View style={styles.contenidoModal}>
                <Text style={styles.tituloModal}>
                  No se pudo completar la operación
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
                <Text style={styles.tituloModal}>Confirmar operación</Text>
                <Text style={styles.textoModal}>{descripcionModal}</Text>
                <Pressable style={styles.boton} onPress={confirmar}>
                  <Text style={styles.textoBoton}>Confirmar</Text>
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
  buscador: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  campo: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
  },
  campoObservacion: {
    minHeight: 80,
    textAlignVertical: "top",
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
  zonaResultados: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  tarjetaResultado: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  columnaResultado: {
    flex: 1,
  },
  nombreProducto: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  detalleProducto: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  botonSeleccionar: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  textoBotonSeleccionar: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.white,
  },
  tarjetaProducto: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  quitar: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.danger,
  },
  stockDisponible: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
    marginTop: 4,
  },
  tarjetaErrores: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  textoError: {
    fontSize: 14,
    textAlign: "center",
    color: colors.danger,
  },
  botonRegistrar: {
    marginTop: spacing.xl,
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
});