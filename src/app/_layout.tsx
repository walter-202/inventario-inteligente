import { Stack } from "expo-router";
import { SplashScreen } from "expo-router";
import "react-native-url-polyfill/auto";
import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AlertCircle, ArrowLeft, Check, ChevronDown, ChevronUp, Eye, EyeOff, Search, X } from "lucide-react-native";
import { View } from "react-native";
import { paperTheme } from "../shared/theme";
import { queryClient } from "../shared/lib/queryClient";
import { SessionProvider, useAuth } from "../features/auth/hooks/useAuth";

void SplashScreen.preventAutoHideAsync();

function renderPaperIcon(props: { name: string; color?: string; size: number }) {
  const iconColor = props.color ?? "#0F172A";
  switch (props.name) {
    case "check":
      return <Check size={props.size} color={iconColor} />;
    case "close":
    case "x":
      return <X size={props.size} color={iconColor} />;
    case "magnify":
      return <Search size={props.size} color={iconColor} />;
    case "eye":
      return <Eye size={props.size} color={iconColor} />;
    case "eye-off":
      return <EyeOff size={props.size} color={iconColor} />;
    case "menu-down":
      return <ChevronDown size={props.size} color={iconColor} />;
    case "menu-up":
      return <ChevronUp size={props.size} color={iconColor} />;
    case "arrow-left":
      return <ArrowLeft size={props.size} color={iconColor} />;
    case "alert-circle":
      return <AlertCircle size={props.size} color={iconColor} />;
    default:
      return <View style={{ width: props.size, height: props.size }} />;
  }
}

import { AppDrawerProvider } from "../shared/components/AppDrawerProvider";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={paperTheme} settings={{ icon: renderPaperIcon }}>
          <SessionProvider>
            <AppDrawerProvider>
              <RootNavigator />
            </AppDrawerProvider>
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
        <Stack.Screen name="registro-voz" />
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
