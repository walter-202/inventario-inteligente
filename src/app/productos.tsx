import { useCallback, useEffect, useRef, useState } from "react";
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
import { Link, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Producto, obtenerProductos } from "@/lib/api";
import { ProductoCard } from "@/components/product-card";
import { Chip } from "@/components/chip";
import { colors, radius, spacing } from "@/constants/theme";

const MENSAJE_SIN_RESULTADOS = "No se encontraron productos.";
const MENSAJE_ERROR =
  "No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.";

export default function ProductosScreen() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | null>(
    null
  );
  const [busqueda, setBusqueda] = useState("");
  const [busquedaAplazada, setBusquedaAplazada] = useState("");
  const [pagina, setPagina] = useState(1);
  const [ultimaPagina, setUltimaPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const secuencia = useRef(0);

  const q = busquedaAplazada.trim() || undefined;
  const categoria = categoriaSeleccionada ?? undefined;

  const cargar = useCallback(
    async (paginaObjetivo: number, reemplazar: boolean, comoRefresco = false) => {
      const id = ++secuencia.current;
      if (comoRefresco) {
        setRefrescando(true);
      } else if (reemplazar) {
        setCargando(true);
      } else {
        setCargandoMas(true);
      }
      setError(null);

      try {
        const res = await obtenerProductos({
          q,
          categoria,
          page: paginaObjetivo,
        });
        if (id !== secuencia.current) return;

        setProductos((prev) => {
          const base = reemplazar ? [] : prev;
          const vistos = new Set(base.map((p) => p.id));
          const juntados = [...base];
          for (const p of res.data) {
            if (!vistos.has(p.id)) {
              vistos.add(p.id);
              juntados.push(p);
            }
          }
          return juntados;
        });

        setCategorias((prev) => {
          const set = new Set(prev);
          for (const p of res.data) set.add(p.categoria);
          return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
        });

        setPagina(res.current_page);
        setUltimaPagina(res.last_page);
      } catch {
        if (id !== secuencia.current) return;
        setError(MENSAJE_ERROR);
      } finally {
        if (id !== secuencia.current) return;
        setCargando(false);
        setCargandoMas(false);
        setRefrescando(false);
      }
    },
    [q, categoria]
  );

  useEffect(() => {
    const timer = setTimeout(() => setBusquedaAplazada(busqueda), 400);
    return () => clearTimeout(timer);
  }, [busqueda]);

  useFocusEffect(
    useCallback(() => {
      cargar(1, true);
    }, [cargar])
  );

  const cargarMas = () => {
    if (cargando || cargandoMas || refrescando || error || pagina >= ultimaPagina) {
      return;
    }
    cargar(pagina + 1, false);
  };

  const refrescar = () => cargar(1, true, true);

  return (
    <SafeAreaView style={styles.pantalla} edges={["top"]}>
      <FlatList
        data={productos}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <ProductoCard producto={item} />}
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
        onEndReached={cargarMas}
        onEndReachedThreshold={0.4}
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
            <Text style={styles.titulo}>Productos</Text>
            <Link href="/registrar-producto" asChild>
              <Pressable style={styles.botonRegistrar}>
                <Text style={styles.textoBotonRegistrar}>
                  Registrar producto
                </Text>
              </Pressable>
            </Link>
            <TextInput
              style={styles.buscador}
              placeholder="Buscar por nombre, código o categoría"
              placeholderTextColor={colors.textSecondary}
              value={busqueda}
              onChangeText={setBusqueda}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {categorias.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipsZona}
                contentContainerStyle={styles.chips}
              >
                <Chip
                  texto="Todas"
                  activo={categoriaSeleccionada === null}
                  onPress={() => setCategoriaSeleccionada(null)}
                />
                {categorias.map((c) => (
                  <Chip
                    key={c}
                    texto={c}
                    activo={categoriaSeleccionada === c}
                    onPress={() => setCategoriaSeleccionada(c)}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.centroVacio}>
            {cargando ? (
              <>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.mensajeCarga}>Cargando productos...</Text>
              </>
            ) : error ? (
              <>
                <Text style={styles.textoError}>{error}</Text>
                <Pressable style={styles.boton} onPress={() => cargar(1, true)}>
                  <Text style={styles.textoBoton}>Reintentar</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.mensajeVacio}>{MENSAJE_SIN_RESULTADOS}</Text>
            )}
          </View>
        }
        ListFooterComponent={
          <>
            {cargandoMas && (
              <View style={styles.pieCarga}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.mensajePie}>Cargando más productos...</Text>
              </View>
            )}
            {!cargandoMas && error && productos.length > 0 && (
              <View style={styles.barraError}>
                <Text style={styles.textoError}>{error}</Text>
                <Pressable
                  style={styles.boton}
                  onPress={() => cargar(pagina + 1, false)}
                >
                  <Text style={styles.textoBoton}>Reintentar</Text>
                </Pressable>
              </View>
            )}
          </>
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
  botonRegistrar: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  textoBotonRegistrar: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.white,
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
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  chipsZona: {
    flexGrow: 0,
    marginBottom: spacing.lg,
  },
  chips: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
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
  pieCarga: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  mensajePie: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  barraError: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
});