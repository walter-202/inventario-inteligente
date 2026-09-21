import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Plus, Search, X } from "lucide-react-native";
import { Link, router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Button, Text } from "react-native-paper";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { AppHeader } from "../../../shared/components/AppHeader";
import { AppSearchbar } from "../../../shared/components/AppSearchbar";
import { colors, spacing } from "../../../shared/theme";
import { ProductCard } from "../components/ProductCard";
import { useProductos } from "../hooks/useProductos";
import { useCategoriasProductos } from "../hooks/useCategoriasProductos";

export function ProductosScreen() {
  const [search, setSearch] = useState("");
  const [deferredSearch, setDeferredSearch] = useState("");
  const [category, setCategory] = useState<string | undefined>();

  useEffect(() => {
    const timer = setTimeout(() => setDeferredSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useProductos({ q: deferredSearch || undefined, categoria: category });
  const categoriesQuery = useCategoriasProductos();

  useFocusEffect(
    useCallback(() => {
      void query.refetch();
    }, [query.refetch]),
  );

  const categories = useMemo(
    () => categoriesQuery.data ?? query.categories,
    [categoriesQuery.data, query.categories],
  );

  return (
    <ScreenContainer style={styles.safe}>
      <FlatList
        data={query.data}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ProductCard
            producto={item}
            onPress={() =>
              router.push({
                pathname: "/producto-detalle",
                params: { id: String(item.id) },
              })
            }
          />
        )}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => query.hasNextPage && query.fetchNextPage()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View>
            <AppHeader title="Productos" subtitle="Catálogo y búsqueda" />
            <Link href="/registrar-producto" asChild>
              <Button mode="contained" icon={() => <Plus size={18} color={colors.white} />} style={styles.action}>
                Registrar producto
              </Button>
            </Link>
            <AppSearchbar
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar por nombre, código o categoría"
              scanTitle="Buscar producto en catálogo"
              style={styles.search}
            />
            <View style={styles.chips}>
              <Button compact mode={!category ? "contained-tonal" : "text"} onPress={() => setCategory(undefined)}>
                Todas
              </Button>
              {categories.map((value) => (
                <Button
                  key={value}
                  compact
                  mode={category === value ? "contained-tonal" : "text"}
                  onPress={() => setCategory(value)}
                >
                  {value}
                </Button>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            {query.isLoading ? (
              <ActivityIndicator />
            ) : query.isError ? (
              <>
                <Text style={styles.error}>No se pudieron cargar los productos.</Text>
                <Button onPress={() => query.refetch()}>Reintentar</Button>
              </>
            ) : (
              <Text style={styles.muted}>No se encontraron productos.</Text>
            )}
          </View>
        }
        ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={styles.footer} /> : null}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  action: { marginBottom: spacing.md },
  search: { marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginBottom: spacing.lg },
  empty: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.xxxl },
  error: { color: colors.danger },
  muted: { color: colors.textSecondary },
  footer: { paddingVertical: spacing.lg },
});
