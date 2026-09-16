import { Stack } from "expo-router";
import { SplashScreen } from "expo-router";
import "react-native-url-polyfill/auto";
import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { paperTheme } from "../shared/theme";
import { queryClient } from "../shared/lib/queryClient";
import { SessionProvider, useAuth } from "../features/auth/hooks/useAuth";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={paperTheme}>
          <SessionProvider>
            <RootNavigator />
          </SessionProvider>
        </PaperProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== "loading") void SplashScreen.hideAsync();
  }, [status]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === "ready"}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="escanear" options={{ presentation: "modal" }} />
        <Stack.Screen name="registrar-producto" options={{ presentation: "modal" }} />
        <Stack.Screen name="registro-voz" options={{ presentation: "modal" }} />
        <Stack.Screen name="movimientos" />
        <Stack.Screen name="nueva-venta" />
        <Stack.Screen name="ajustes-ia" />
        <Stack.Screen name="producto-detalle" />
      </Stack.Protected>
      <Stack.Protected guard={status !== "ready"}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
