import { Stack } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { paperTheme } from "../shared/theme";
import { queryClient } from "../shared/lib/queryClient";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={paperTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="escanear" options={{ presentation: "modal" }} />
            <Stack.Screen name="registrar-producto" options={{ presentation: "modal" }} />
            <Stack.Screen name="registro-voz" options={{ presentation: "modal" }} />
            <Stack.Screen name="movimientos" />
            <Stack.Screen name="nueva-venta" />
            <Stack.Screen name="ajustes-ia" />
          </Stack>
        </PaperProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
