import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Avatar, Divider, Drawer, Text } from "react-native-paper";
import { usePathname, useRouter } from "expo-router";
import {
  AlertTriangle,
  Bot,
  Boxes,
  LayoutDashboard,
  LogOut,
  Receipt,
  Settings,
  Shirt,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react-native";

import { colors, spacing } from "../theme";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { can, roleLabels } from "../../features/auth/lib/permissions";
import { useConfirm } from "./ConfirmDialog";
import { useAppDrawer } from "./DrawerContext";

export function AppDrawerContent() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { requestConfirm, dialog } = useConfirm();
  const { closeDrawer } = useAppDrawer();

  const handleNavigate = (path: string) => {
    closeDrawer();
    router.push(path as any);
  };

  const handleSignOut = async () => {
    const ok = await requestConfirm({
      title: "Cerrar sesión",
      message: "¿Estás seguro de que querés salir de tu cuenta en este dispositivo?",
      confirmLabel: "Cerrar sesión",
      danger: true,
    });
    if (ok) {
      closeDrawer();
      void signOut();
    }
  };

  const isTableroActive = pathname === "/" || pathname.includes("tablero");
  const isVentasActive = pathname.includes("ventas") || pathname.includes("nueva-venta");
  const isInventarioActive = pathname.includes("inventario") || pathname.includes("movimientos");
  const isProductosActive = pathname.includes("productos") || pathname.includes("catalogo");
  const isAsistenteActive = pathname.includes("asistente") || pathname.includes("registro-voz");

  const initials = profile?.nombre
    ? profile.nombre.substring(0, 2).toUpperCase()
    : profile?.email
    ? profile.email.substring(0, 2).toUpperCase()
    : "LM";

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {dialog}

      {/* Header del Perfil y Tienda */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Avatar.Text size={44} label={initials} style={styles.avatar} color="#FFFFFF" />
          <View style={styles.userInfo}>
            <Text variant="titleMedium" style={styles.userName} numberOfLines={1}>
              {profile?.nombre ?? profile?.email ?? "Usuario Lidemoda"}
            </Text>
            <View style={styles.roleBadge}>
              <Text variant="labelSmall" style={styles.roleText}>
                {profile?.rol ? roleLabels[profile.rol] : "Personal"}
              </Text>
            </View>
          </View>
        </View>
        <Text variant="bodySmall" style={styles.storeText}>
          Lidemoda · Sucursal Activa
        </Text>
      </View>

      <Divider style={styles.divider} />

      {/* Sección 1: PRINCIPAL */}
      <Drawer.Section title="MÓDULOS PRINCIPALES" style={styles.section}>
        <Drawer.Item
          label="Tablero"
          active={isTableroActive}
          icon={({ color, size }) => <LayoutDashboard color={color} size={size} />}
          onPress={() => handleNavigate("/")}
          style={isTableroActive ? styles.activeItem : styles.item}
        />
        <Drawer.Item
          label="Ventas & Caja"
          active={isVentasActive}
          icon={({ color, size }) => <Receipt color={color} size={size} />}
          onPress={() => handleNavigate("/ventas")}
          style={isVentasActive ? styles.activeItem : styles.item}
        />
        <Drawer.Item
          label="Inventario & Stock"
          active={isInventarioActive}
          icon={({ color, size }) => <Boxes color={color} size={size} />}
          onPress={() => handleNavigate("/inventario")}
          style={isInventarioActive ? styles.activeItem : styles.item}
        />
        <Drawer.Item
          label="Catálogo de Prendas"
          active={isProductosActive}
          icon={({ color, size }) => <Shirt color={color} size={size} />}
          onPress={() => handleNavigate("/productos")}
          style={isProductosActive ? styles.activeItem : styles.item}
        />
      </Drawer.Section>

      <Divider style={styles.divider} />

      {/* Sección 2: INTELIGENCIA ARTIFICIAL */}
      <Drawer.Section title="INTELIGENCIA & ANÁLISIS" style={styles.section}>
        <Drawer.Item
          label="Asistente por Voz"
          active={isAsistenteActive}
          icon={({ color, size }) => <Bot color={color} size={size} />}
          onPress={() => handleNavigate("/registro-voz")}
          style={isAsistenteActive ? styles.activeItem : styles.item}
        />
        <Drawer.Item
          label="Rotación & Marketing IA"
          active={pathname.includes("rotacion")}
          icon={({ color, size }) => <TrendingUp color={color} size={size} />}
          onPress={() => handleNavigate("/rotacion")}
          style={styles.item}
        />
        <Drawer.Item
          label="Stock Crítico & Alertas"
          active={pathname.includes("alertas-stock")}
          icon={({ color, size }) => <AlertTriangle color={color} size={size} />}
          onPress={() => handleNavigate("/alertas-stock")}
          style={styles.item}
        />
      </Drawer.Section>

      <Divider style={styles.divider} />

      {/* Sección 3: ADMINISTRACIÓN & SISTEMA */}
      <Drawer.Section title="SISTEMA" style={styles.section}>
        {can(profile?.rol, "users.manage") && (
          <Drawer.Item
            label="Colaboradores y Roles"
            active={pathname.includes("usuarios")}
            icon={({ color, size }) => <Users color={color} size={size} />}
            onPress={() => handleNavigate("/usuarios")}
            style={styles.item}
          />
        )}
        <Drawer.Item
          label="Ajustes de IA"
          active={pathname.includes("ajustes-ia")}
          icon={({ color, size }) => <Sparkles color={color} size={size} />}
          onPress={() => handleNavigate("/ajustes-ia")}
          style={styles.item}
        />
        <Drawer.Item
          label="Cerrar sesión"
          icon={({ size }) => <LogOut color={colors.danger} size={size} />}
          onPress={() => void handleSignOut()}
          style={styles.item}
          theme={{ colors: { onSurfaceVariant: colors.danger } }}
        />
      </Drawer.Section>

      <View style={styles.footer}>
        <Text variant="labelSmall" style={styles.footerText}>
          Lidemoda ERP v1.0.0 • 2026
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    backgroundColor: colors.primary,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  roleText: {
    color: colors.primary,
    fontWeight: "600",
  },
  storeText: {
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  divider: {
    marginVertical: spacing.xs,
  },
  section: {
    marginBottom: spacing.xs,
  },
  item: {
    borderRadius: 12,
    marginHorizontal: spacing.sm,
  },
  activeItem: {
    borderRadius: 12,
    marginHorizontal: spacing.sm,
    backgroundColor: colors.primarySoft,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    alignItems: "center",
  },
  footerText: {
    color: colors.textMuted,
  },
});
