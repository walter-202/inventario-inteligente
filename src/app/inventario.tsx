import { useCallback, useMemo, useRef, useState } from "react";
import { useFocusEffect, Link } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Sucursal,
  InventarioItem,
  obtenerSucursales,
  obtenerInventario,
} from "@/lib/api";
import { InventarioCard } from "@/components/inventario-card";
import { Chip } from "@/components/chip";
import { colors, radius, spacing } from "@/constants/theme";

const MENSAJE_ERROR =
  "No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.";
const MENSAJE_SIN_SUCURSALES = "No hay sucursales disponibles.";
const MENSAJE_SIN_PRODUCTOS = "No existen productos registrados en esta sucursal.";
const MENSAJE_SIN_COINCIDENCIAS = "No se encontraron resultados para la búsqueda.";

export default function InventarioScreen() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalCargando, setSucursalCargando] = useState(true);
  const [errorSucursales, setErrorSucursales] = useState<string | null>(null);
  const [sucursalId, setSucursalId] = useState<number | null>(null);

  const [inventario, setInventario] = useState<InventarioItem[]>([]);
  const [cargando, setCargando] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const secuencia = useRef(0);
  const sucursalIdRef = useRef<number | null>(null);

  const cargarSucursales = useCallback(async () => {
    setSucursalCargando(true);
    setErrorSucursales(null);
    try {
      const data = await obtenerSucursales();
      setSucursales(data);
      const actual = sucursalIdRef.current;
      const nuevoId =
        actual !== null && data.some((s) => s.id === actual)
          ? actual
          : data.length > 0
            ? data[0].id
            : null;
      sucursalIdRef.current = nuevoId;
      setSucursalId(nuevoId);
    } catch {
      setErrorSucursales(MENSAJE_ERROR);
      setSucursales([]);
    } finally {
      setSucursalCargando(false);
    }
  }, []);

  const cargarInventario = useCallback(
    async (targetId: number, comoRefresco = false) => {
      const id = ++secuencia.current;
      setError(null);
      if (comoRefresco) {
        setRefrescando(true);
      } else {
        setCargando(true);
      }
      try {
        const data = await obtenerInventario(targetId);
        if (id !== secuencia.current) return;
        setInventario(data);
      } catch {
        if (id !== secuencia.current) return;
        setError(MENSAJE_ERROR);
      } finally {
        if (id !== secuencia.current) return;
        setCargando(false);
        setRefrescando(false);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      let activo = true;
      (async () => {
        await cargarSucursales();
        const id = sucursalIdRef.current;
        if (activo && id !== null) {
          await cargarInventario(id, true);
        }
      })();
      return () => {
        activo = false;
      };
    }, [cargarSucursales, cargarInventario])
  );

  const seleccionarSucursal = (id: number) => {
    if (id === sucursalId) return;
    sucursalIdRef.current = id;
    setInventario([]);
    setBusqueda("");
    setSucursalId(id);
    cargarInventario(id);
  };

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return inventario;
    return inventario.filter(
      (item) =>
        item.producto.nombre.toLowerCase().includes(texto) ||
        item.producto.codigo.toLowerCase().includes(texto)
    );
  }, [inventario, busqueda]);

  const refrescar = () => {
    cargarSucursales();
    if (sucursalId !== null) cargarInventario(sucursalId, true);
  };

  const mostrarSucursales = !sucursalCargando && !errorSucursales;

  return (
    <SafeAreaView style={styles.pantalla} edges={["top"]}>
      <FlatList
        data={sucursalId === null ? [] : filtrados}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <InventarioCard item={item} />}
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={refrescar}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <View>
            <Text style={styles.titulo}>Inventario</Text>
            <Link href="/movimientos" asChild>
              <Pressable style={styles.botonMovimiento}>
                <Text style={styles.textoBotonMovimiento}>
                  Registrar movimiento
                </Text>
              </Pressable>
            </Link>
            {mostrarSucursales && sucursales.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipsZona}
                contentContainerStyle={styles.chips}
              >
                {sucursales.map((s) => (
                  <Chip
                    key={s.id}
                    texto={s.nombre}
                    activo={sucursalId === s.id}
                    onPress={() => seleccionarSucursal(s.id)}
                  />
                ))}
              </ScrollView>
            )}
            {sucursalId !== null && mostrarSucursales && (
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
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.centroVacio}>
            {sucursalCargando ? (
              <>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.mensajeCarga}>Cargando sucursales...</Text>
              </>
            ) : errorSucursales ? (
              <>
                <Text style={styles.textoError}>{errorSucursales}</Text>
                <Pressable style={styles.boton} onPress={cargarSucursales}>
                  <Text style={styles.textoBoton}>Reintentar</Text>
                </Pressable>
              </>
            ) : sucursales.length === 0 ? (
              <Text style={styles.mensajeVacio}>{MENSAJE_SIN_SUCURSALES}</Text>
            ) : cargando ? (
              <>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.mensajeCarga}>Cargando inventario...</Text>
              </>
            ) : error ? (
              <>
                <Text style={styles.textoError}>{error}</Text>
                <Pressable
                  style={styles.boton}
                  onPress={() =>
                    sucursalId !== null && cargarInventario(sucursalId)
                  }
                >
                  <Text style={styles.textoBoton}>Reintentar</Text>
                </Pressable>
              </>
            ) : inventario.length === 0 ? (
              <Text style={styles.mensajeVacio}>{MENSAJE_SIN_PRODUCTOS}</Text>
            ) : (
              <Text style={styles.mensajeVacio}>{MENSAJE_SIN_COINCIDENCIAS}</Text>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contenido: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  titulo: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  botonMovimiento: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  textoBotonMovimiento: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.white,
  },
  chipsZona: {
    flexGrow: 0,
    marginBottom: spacing.md,
  },
  chips: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
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
    marginBottom: spacing.lg,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  centroVacio: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  mensajeCarga: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  mensajeVacio: {
    fontSize: 15,
    textAlign: "center",
    color: colors.textSecondary,
  },
  textoError: {
    fontSize: 14,
    textAlign: "center",
    color: colors.danger,
  },
  boton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  textoBoton: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.white,
  },
});