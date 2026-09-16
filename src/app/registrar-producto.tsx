import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import axios from "axios";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  obtenerSucursales,
  registrarProducto,
  type ProductoRegistrado,
  type Sucursal,
} from "@/lib/api";
import { Chip } from "@/components/chip";
import { colors, radius, spacing } from "@/constants/theme";

const MENSAJE_CONEXION =
  "No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.";

interface ErroresFormulario {
  nombre?: string;
  codigo?: string;
  categoria?: string;
  precio?: string;
  cantidad?: string;
  sucursal?: string;
}

function validarFormulario(
  nombre: string,
  codigo: string,
  categoria: string,
  precioTexto: string,
  cantidadTexto: string,
  sucursalId: number | null
): ErroresFormulario {
  const errores: ErroresFormulario = {};

  if (!nombre.trim()) errores.nombre = "El nombre es obligatorio.";
  if (!codigo.trim()) errores.codigo = "El código es obligatorio.";
  if (!categoria.trim()) errores.categoria = "La categoría es obligatoria.";
  if (sucursalId === null) errores.sucursal = "Debes seleccionar una sucursal.";

  const precioTextoNormalizado = precioTexto.trim().replace(",", ".");
  if (!precioTexto.trim()) {
    errores.precio = "El precio es obligatorio.";
  } else {
    const precio = Number(precioTextoNormalizado);
    if (!Number.isFinite(precio) || precio < 0) {
      errores.precio = "El precio debe ser un número mayor o igual a 0.";
    }
  }

  if (!cantidadTexto.trim()) {
    errores.cantidad = "La cantidad inicial es obligatoria.";
  } else if (!/^\d+$/.test(cantidadTexto.trim())) {
    errores.cantidad =
      "La cantidad inicial debe ser un entero mayor o igual a 0.";
  }

  return errores;
}

function extraerErrorServidor(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: unknown; errors?: Record<string, unknown> }
      | undefined;
    if (data && typeof data.errors === "object" && data.errors !== null) {
      const primerMensaje = Object.values(data.errors).find(
        (valor) => Array.isArray(valor) && valor.length > 0
      );
      if (
        Array.isArray(primerMensaje) &&
        typeof primerMensaje[0] === "string"
      ) {
        return primerMensaje[0];
      }
    }
    if (typeof data?.message === "string" && data.message.length > 0) {
      return data.message;
    }
  }
  return MENSAJE_CONEXION;
}

export default function RegistrarProductoScreen() {
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [categoria, setCategoria] = useState("");
  const [precio, setPrecio] = useState("");
  const [cantidad, setCantidad] = useState("");

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalCargando, setSucursalCargando] = useState(true);
  const [errorSucursales, setErrorSucursales] = useState<string | null>(null);
  const [sucursalId, setSucursalId] = useState<number | null>(null);

  const [errores, setErrores] = useState<ErroresFormulario>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [productoCreado, setProductoCreado] =
    useState<ProductoRegistrado | null>(null);

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

  useEffect(() => {
    cargarSucursales();
  }, [cargarSucursales]);

  const guardar = async () => {
    const erroresFormulario = validarFormulario(
      nombre,
      codigo,
      categoria,
      precio,
      cantidad,
      sucursalId
    );
    setErrores(erroresFormulario);
    setErrorGeneral(null);
    if (Object.keys(erroresFormulario).length > 0) return;

    setGuardando(true);
    try {
      const creado = await registrarProducto({
        nombre: nombre.trim(),
        codigo: codigo.trim(),
        categoria: categoria.trim(),
        precio: Number(precio.trim().replace(",", ".")),
        cantidad: parseInt(cantidad.trim(), 10),
        sucursal_id: sucursalId as number,
      });
      setProductoCreado(creado);
      setNombre("");
      setCodigo("");
      setCategoria("");
      setPrecio("");
      setCantidad("");
      setErrores({});
    } catch (error) {
      setErrorGeneral(extraerErrorServidor(error));
    } finally {
      setGuardando(false);
    }
  };

  const volverAProductos = () => {
    setProductoCreado(null);
    router.back();
  };

  const puedeGuardar =
    !guardando &&
    sucursales.length > 0 &&
    !sucursalCargando &&
    errorSucursales === null &&
    sucursalId !== null;

  return (
    <SafeAreaView style={styles.pantalla} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.titulo}>Registrar producto</Text>

        <Text style={styles.etiquetaCampo}>Nombre del producto</Text>
        <TextInput
          style={[
            styles.campo,
            errores.nombre && styles.campoError,
          ]}
          placeholder="Nombre del producto"
          placeholderTextColor={colors.textSecondary}
          value={nombre}
          onChangeText={setNombre}
          maxLength={255}
        />
        {errores.nombre && <Text style={styles.textoError}>{errores.nombre}</Text>}

        <Text style={styles.etiquetaCampo}>Código</Text>
        <TextInput
          style={[
            styles.campo,
            errores.codigo && styles.campoError,
          ]}
          placeholder="Código"
          placeholderTextColor={colors.textSecondary}
          value={codigo}
          onChangeText={setCodigo}
          maxLength={255}
          autoCorrect={false}
          autoCapitalize="characters"
        />
        {errores.codigo && <Text style={styles.textoError}>{errores.codigo}</Text>}

        <Text style={styles.etiquetaCampo}>Categoría</Text>
        <TextInput
          style={[
            styles.campo,
            errores.categoria && styles.campoError,
          ]}
          placeholder="Categoría"
          placeholderTextColor={colors.textSecondary}
          value={categoria}
          onChangeText={setCategoria}
          maxLength={255}
        />
        {errores.categoria && (
          <Text style={styles.textoError}>{errores.categoria}</Text>
        )}

        <Text style={styles.etiquetaCampo}>Precio</Text>
        <TextInput
          style={[
            styles.campo,
            errores.precio && styles.campoError,
          ]}
          placeholder="0.00"
          placeholderTextColor={colors.textSecondary}
          value={precio}
          onChangeText={setPrecio}
          keyboardType="decimal-pad"
        />
        {errores.precio && <Text style={styles.textoError}>{errores.precio}</Text>}

        <Text style={styles.etiquetaCampo}>Sucursal</Text>
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
          <Text style={styles.textoSecundario}>
            No hay sucursales disponibles.
          </Text>
        ) : (
          <>
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
            {errores.sucursal && (
              <Text style={styles.textoError}>{errores.sucursal}</Text>
            )}
          </>
        )}

        <Text style={styles.etiquetaCampo}>Cantidad inicial</Text>
        <TextInput
          style={[
            styles.campo,
            errores.cantidad && styles.campoError,
          ]}
          placeholder="0"
          placeholderTextColor={colors.textSecondary}
          value={cantidad}
          onChangeText={setCantidad}
          keyboardType="number-pad"
        />
        {errores.cantidad && (
          <Text style={styles.textoError}>{errores.cantidad}</Text>
        )}

        <Text style={styles.notaCantidad}>
          La cantidad inicial se asigna a la sucursal seleccionada y se registra
          como una entrada de inventario.
        </Text>

        {errorGeneral && (
          <View style={styles.tarjetaError}>
            <Text style={styles.textoErrorGeneral}>{errorGeneral}</Text>
          </View>
        )}

        <Pressable
          style={[
            styles.botonGuardar,
            !puedeGuardar && styles.botonDeshabilitado,
          ]}
          disabled={!puedeGuardar}
          onPress={guardar}
        >
          {guardando ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.textoBoton}>Registrar producto</Text>
          )}
        </Pressable>
      </ScrollView>

      <Modal
        visible={productoCreado !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setProductoCreado(null)}
      >
        <View style={styles.fondoModal}>
          <View style={styles.tarjetaModal}>
            <View style={styles.contenidoModal}>
              <Text style={styles.tituloModal}>Producto registrado</Text>
              <Text style={styles.textoModal}>
                {productoCreado?.producto.nombre ?? ""} se registró
                correctamente.
              </Text>
              <Text style={styles.textoDetalleModal}>
                Sucursal: {productoCreado?.sucursal.nombre ?? ""}
                {"\n"}
                Cantidad inicial: {productoCreado?.cantidad_inicial ?? 0}
              </Text>
              <Pressable
                style={styles.boton}
                onPress={() => setProductoCreado(null)}
              >
                <Text style={styles.textoBoton}>Registrar otro producto</Text>
              </Pressable>
              <Pressable
                style={styles.botonSecundario}
                onPress={volverAProductos}
              >
                <Text style={styles.textoBotonSecundario}>Volver a Productos</Text>
              </Pressable>
            </View>
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
  etiquetaCampo: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
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
  campoError: {
    borderColor: colors.danger,
  },
  textoError: {
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.xs,
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
  textoSecundario: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  notaCantidad: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  tarjetaError: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  textoErrorGeneral: {
    fontSize: 14,
    color: colors.danger,
    textAlign: "center",
    lineHeight: 20,
  },
  botonGuardar: {
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
    alignSelf: "stretch",
    alignItems: "center",
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
  textoDetalleModal: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
});