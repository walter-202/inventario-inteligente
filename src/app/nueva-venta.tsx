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
import { Link, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  InventarioItem,
  Producto,
  Sucursal,
  extraerMensajeError,
  obtenerInventario,
  obtenerProductos,
  obtenerSucursales,
  registrarVenta,
} from "@/lib/api";
import { tomarProductoPendiente } from "@/lib/pendiente-venta";
import { Chip } from "@/components/chip";
import { colors, radius, spacing } from "@/constants/theme";
import { formatearPrecio } from "@/lib/utils";

const MENSAJE_CONEXION =
  "No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.";
const MENSAJE_SIN_SUCURSALES = "No hay sucursales disponibles.";
const MENSAJE_SIN_COINCIDENCIAS = "No se encontraron productos.";
const MENSAJE_CARRITO_VACIO = "No hay productos agregados.";

const METODOS_PAGO = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "QR", etiqueta: "QR" },
  { valor: "tarjeta", etiqueta: "Tarjeta" },
  { valor: "transferencia", etiqueta: "Transferencia" },
];

interface ItemCarrito {
  producto: Producto;
  cantidad: number;
  stock: number;
}

interface FilaResultadoProps {
  producto: Producto;
  stock: number;
  onAgregar: (producto: Producto) => void;
}

function FilaResultado({ producto, stock, onAgregar }: FilaResultadoProps) {
  const sinStock = stock <= 0;
  return (
    <View style={styles.tarjetaResultado}>
      <View style={styles.columnaResultado}>
        <Text style={styles.nombreProducto} numberOfLines={1}>
          {producto.nombre}
        </Text>
        <Text style={styles.detalleProducto} numberOfLines={1}>
          Código: {producto.codigo} · {formatearPrecio(producto.precio)}
        </Text>
        <Text
          style={[
            styles.stockTexto,
            sinStock ? styles.stockSinTexto : styles.stockDisponibleTexto,
          ]}
        >
          {sinStock
            ? "Sin stock en esta sucursal"
            : `Disponible: ${stock}`}
        </Text>
      </View>
      <Pressable
        style={[
          styles.botonAgregar,
          sinStock && styles.botonAgregarDeshabilitado,
        ]}
        disabled={sinStock}
        onPress={() => onAgregar(producto)}
      >
        <Text
          style={[
            styles.textoBotonAgregar,
            sinStock && styles.textoBotonAgregarDeshabilitado,
          ]}
        >
          Agregar
        </Text>
      </Pressable>
    </View>
  );
}

interface FilaCarritoProps {
  item: ItemCarrito;
  onIncrementar: (id: number) => void;
  onDecrementar: (id: number) => void;
  onQuitar: (id: number) => void;
}

function FilaCarrito({ item, onIncrementar, onDecrementar, onQuitar }: FilaCarritoProps) {
  const { producto, cantidad, stock } = item;
  const alMaximo = cantidad >= stock;

  return (
    <View style={styles.tarjetaCarrito}>
      <View style={styles.filaCarritoTop}>
        <View style={styles.columnaCarrito}>
          <Text style={styles.nombreProducto} numberOfLines={1}>
            {producto.nombre}
          </Text>
          <Text style={styles.detalleProducto} numberOfLines={1}>
            {formatearPrecio(producto.precio)} · Código: {producto.codigo}
          </Text>
        </View>
        <Pressable onPress={() => onQuitar(producto.id)} hitSlop={8}>
          <Text style={styles.quitar}>Quitar</Text>
        </Pressable>
      </View>
      <View style={styles.filaCarritoBottom}>
        <View style={styles.stepper}>
          <Pressable
            style={styles.stepperBoton}
            disabled={cantidad <= 1}
            onPress={() => onDecrementar(producto.id)}
          >
            <Text
              style={[
                styles.stepperTexto,
                cantidad <= 1 && styles.stepperTextoDeshabilitado,
              ]}
            >
              −
            </Text>
          </Pressable>
          <Text style={styles.stepperCantidad}>{cantidad}</Text>
          <Pressable
            style={styles.stepperBoton}
            disabled={alMaximo}
            onPress={() => onIncrementar(producto.id)}
          >
            <Text
              style={[
                styles.stepperTexto,
                alMaximo && styles.stepperTextoDeshabilitado,
              ]}
            >
              +
            </Text>
          </Pressable>
        </View>
        <View style={styles.columnaSubtotal}>
          <Text style={styles.subtotal}>{formatearPrecio(producto.precio * cantidad)}</Text>
          {alMaximo && (
            <Text style={styles.avisoStock}>Máximo disponible: {stock}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

export default function NuevaVentaScreen() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalCargando, setSucursalCargando] = useState(true);
  const [errorSucursales, setErrorSucursales] = useState<string | null>(null);
  const [sucursalId, setSucursalId] = useState<number | null>(null);

  const [inventario, setInventario] = useState<InventarioItem[]>([]);
  const [inventarioCargando, setInventarioCargando] = useState(false);
  const [errorInventario, setErrorInventario] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplazada, setBusquedaAplazada] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [buscando, setBuscando] = useState(false);

  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorVenta, setErrorVenta] = useState<string | null>(null);

  const secuenciaBusqueda = useRef(0);
  const secuenciaInventario = useRef(0);
  const pendienteRef = useRef<Producto | null>(null);

  useFocusEffect(
    useCallback(() => {
      const pendiente = tomarProductoPendiente();
      if (pendiente) {
        pendienteRef.current = pendiente;
      }
    }, [])
  );

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
    const timer = setTimeout(() => setBusquedaAplazada(busqueda), 400);
    return () => clearTimeout(timer);
  }, [busqueda]);

  const stockPorProducto = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of inventario) map.set(item.producto_id, item.cantidad);
    return map;
  }, [inventario]);

  useEffect(() => {
    const pendiente = pendienteRef.current;
    if (pendiente === null) return;
    if (sucursalCargando) return;
    if (sucursalId === null) {
      if (sucursales.length === 0) {
        pendienteRef.current = null;
        Alert.alert(
          "Venta no disponible",
          "No hay sucursales disponibles para registrar la venta."
        );
      }
      return;
    }
    const stock = stockPorProducto.get(pendiente.id);
    if (stock === undefined) return;
    pendienteRef.current = null;
    if (stock <= 0) {
      Alert.alert(
        "Sin stock",
        `No hay stock de "${pendiente.nombre}" en la sucursal seleccionada.`
      );
      return;
    }
    setCarrito((prev) => {
      const existente = prev.find((i) => i.producto.id === pendiente.id);
      if (existente) {
        return prev.map((i) =>
          i.producto.id === pendiente.id
            ? { ...i, cantidad: Math.min(i.cantidad + 1, i.stock) }
            : i
        );
      }
      return [...prev, { producto: pendiente, cantidad: 1, stock }];
    });
    Alert.alert(
      "Producto agregado",
      `"${pendiente.nombre}" se agregó a la venta.`
    );
  }, [sucursalId, sucursalCargando, sucursales.length, stockPorProducto]);

  useEffect(() => {
    const texto = busquedaAplazada.trim();
    if (!texto) {
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
  }, [busquedaAplazada]);

  const seleccionarSucursal = (id: number) => {
    if (id === sucursalId) return;
    setCarrito([]);
    setBusqueda("");
    setResultados([]);
    setSucursalId(id);
  };

  const total = useMemo(
    () => carrito.reduce((acc, i) => acc + i.producto.precio * i.cantidad, 0),
    [carrito]
  );

  const agregarProducto = (producto: Producto) => {
    const stock = stockPorProducto.get(producto.id) ?? 0;
    if (stock <= 0) return;
    setCarrito((prev) => {
      const existente = prev.find((i) => i.producto.id === producto.id);
      if (existente) {
        return prev.map((i) =>
          i.producto.id === producto.id
            ? { ...i, cantidad: Math.min(i.cantidad + 1, i.stock) }
            : i
        );
      }
      return [...prev, { producto, cantidad: 1, stock }];
    });
  };

  const incrementar = (id: number) =>
    setCarrito((prev) =>
      prev.map((i) =>
        i.producto.id === id
          ? { ...i, cantidad: Math.min(i.cantidad + 1, i.stock) }
          : i
      )
    );

  const decrementar = (id: number) =>
    setCarrito((prev) =>
      prev.map((i) =>
        i.producto.id === id
          ? { ...i, cantidad: Math.max(i.cantidad - 1, 1) }
          : i
      )
    );

  const quitar = (id: number) =>
    setCarrito((prev) => prev.filter((i) => i.producto.id !== id));

  const abrirConfirmacion = () => {
    setErrorVenta(null);
    setModalVisible(true);
  };

  const cerrarModal = () => {
    if (enviando) return;
    setModalVisible(false);
  };

  const confirmarVenta = async () => {
    if (sucursalId === null || carrito.length === 0) return;
    setEnviando(true);
    setErrorVenta(null);
    try {
      await registrarVenta({
        sucursal_id: sucursalId,
        metodo_pago: metodoPago,
        productos: carrito.map((i) => ({
          producto_id: i.producto.id,
          cantidad: i.cantidad,
        })),
      });
      setModalVisible(false);
      setCarrito([]);
      setBusqueda("");
      setResultados([]);
      cargarInventario(sucursalId);
      Alert.alert("Venta registrada", "La venta se registró correctamente.");
    } catch (err) {
      setErrorVenta(extraerMensajeError(err, MENSAJE_CONEXION));
    } finally {
      setEnviando(false);
    }
  };

  const nombreSucursal =
    sucursales.find((s) => s.id === sucursalId)?.nombre ?? "";
  const nombreMetodo =
    METODOS_PAGO.find((m) => m.valor === metodoPago)?.etiqueta ?? metodoPago;

  return (
    <SafeAreaView style={styles.pantalla} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.titulo}>Nueva venta</Text>

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
                onPress={() => seleccionarSucursal(s.id)}
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
        <Link href="/escanear" asChild>
          <Pressable style={styles.enlaceEscanear}>
            <Text style={styles.textoEnlaceEscanear}>Escanear producto</Text>
          </Pressable>
        </Link>
        {buscando && (
          <View style={styles.zonaCarga}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.textoSecundario}>Buscando productos...</Text>
          </View>
        )}
        {!buscando && busqueda.trim().length > 0 && resultados.length === 0 && (
          <Text style={styles.textoSecundario}>{MENSAJE_SIN_COINCIDENCIAS}</Text>
        )}
        {resultados.length > 0 && (
          <View style={styles.zonaResultados}>
            {resultados.map((p) => (
              <FilaResultado
                key={p.id}
                producto={p}
                stock={stockPorProducto.get(p.id) ?? 0}
                onAgregar={agregarProducto}
              />
            ))}
          </View>
        )}

        <Text style={styles.etiquetaSeccion}>Método de pago</Text>
        <View style={styles.chipsFila}>
          {METODOS_PAGO.map((m) => (
            <Chip
              key={m.valor}
              texto={m.etiqueta}
              activo={metodoPago === m.valor}
              onPress={() => setMetodoPago(m.valor)}
            />
          ))}
        </View>

        <Text style={styles.etiquetaSeccion}>Resumen de la venta</Text>
        {carrito.length === 0 ? (
          <Text style={styles.textoSecundario}>{MENSAJE_CARRITO_VACIO}</Text>
        ) : (
          carrito.map((item) => (
            <FilaCarrito
              key={item.producto.id}
              item={item}
              onIncrementar={incrementar}
              onDecrementar={decrementar}
              onQuitar={quitar}
            />
          ))
        )}

        <View style={styles.tarjetaTotal}>
          <Text style={styles.textoTotal}>Total</Text>
          <Text style={styles.montoTotal}>{formatearPrecio(total)}</Text>
        </View>

        <Pressable
          style={[
            styles.botonRegistrar,
            carrito.length === 0 && styles.botonDeshabilitado,
          ]}
          disabled={carrito.length === 0}
          onPress={abrirConfirmacion}
        >
          <Text style={styles.textoBoton}>Registrar venta</Text>
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
                <Text style={styles.textoModal}>Registrando venta...</Text>
              </View>
            ) : errorVenta ? (
              <View style={styles.contenidoModal}>
                <Text style={styles.tituloModal}>
                  No se pudo registrar la venta
                </Text>
                <Text style={styles.textoModal}>{errorVenta}</Text>
                <Pressable style={styles.boton} onPress={confirmarVenta}>
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
                  {"\n"}Método de pago: {nombreMetodo}
                  {"\n"}Productos: {carrito.length} ítems
                  {"\n"}Total: {formatearPrecio(total)}
                </Text>
                <Pressable style={styles.boton} onPress={confirmarVenta}>
                  <Text style={styles.textoBoton}>Confirmar venta</Text>
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
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  enlaceEscanear: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  textoEnlaceEscanear: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
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
    marginTop: spacing.md,
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
  stockTexto: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  stockDisponibleTexto: {
    color: colors.primary,
  },
  stockSinTexto: {
    color: colors.danger,
  },
  botonAgregar: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  botonAgregarDeshabilitado: {
    backgroundColor: colors.border,
  },
  textoBotonAgregar: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.white,
  },
  textoBotonAgregarDeshabilitado: {
    color: colors.textSecondary,
  },
  tarjetaCarrito: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  filaCarritoTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  columnaCarrito: {
    flex: 1,
  },
  quitar: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.danger,
  },
  filaCarritoBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  stepperBoton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperTexto: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.white,
  },
  stepperTextoDeshabilitado: {
    color: colors.textSecondary,
  },
  stepperCantidad: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    minWidth: 24,
    textAlign: "center",
  },
  columnaSubtotal: {
    alignItems: "flex-end",
  },
  subtotal: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  avisoStock: {
    fontSize: 11,
    color: colors.danger,
    marginTop: 2,
  },
  tarjetaTotal: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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