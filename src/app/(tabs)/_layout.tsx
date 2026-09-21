import { Tabs } from "expo-router";
import { AlertTriangle, BookOpen, LayoutDashboard, TrendingUp } from "lucide-react-native";
import { colors } from "../../shared/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
      }}
    >
      {/* 4 Tabs Contextuales para el Módulo Tablero */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Resumen",
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="kardex"
        options={{
          title: "Kardex",
          tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="rotacion"
        options={{
          title: "Rotación IA",
          tabBarIcon: ({ color, size }) => <TrendingUp color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="alertas"
        options={{
          title: "Alertas",
          tabBarIcon: ({ color, size }) => <AlertTriangle color={color} size={size} />,
        }}
      />

      {/* Rutas conservadas con href: null para acceso vía Drawer y compatibilidad */}
      <Tabs.Screen
        name="productos"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="inventario"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="ventas"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="mas"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
