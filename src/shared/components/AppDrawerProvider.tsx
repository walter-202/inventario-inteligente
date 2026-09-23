import React, { useCallback, useState, type PropsWithChildren } from "react";
import { ActivityIndicator, Modal, StyleSheet, View, useWindowDimensions } from "react-native";
import { Text } from "react-native-paper";
import { Drawer } from "react-native-drawer-layout";
import { colors, spacing } from "../theme";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { AppDrawerContent } from "./AppDrawerContent";
import { DrawerContext, useAppDrawer, type DrawerContextValue } from "./DrawerContext";

export { useAppDrawer, type DrawerContextValue };

export function AppDrawerProvider({ children }: PropsWithChildren) {
  const { status, isRevalidating } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const { width } = useWindowDimensions();
  const showRevalidationCover = status === "ready" && isRevalidating;

  const openDrawer = useCallback(() => {
    if (status === "ready" && !isRevalidating) setIsOpen(true);
  }, [isRevalidating, status]);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  const toggleDrawer = useCallback(() => {
    if (status === "ready" && !isRevalidating) setIsOpen((prev) => !prev);
  }, [isRevalidating, status]);

  if (status !== "ready") {
    return (
      <DrawerContext.Provider value={{ openDrawer, closeDrawer, toggleDrawer, isOpen: false }}>
        {children}
      </DrawerContext.Provider>
    );
  }

  const drawerWidth = Math.min(Math.max(width * 0.82, 280), 340);

  return (
    <DrawerContext.Provider value={{ openDrawer, closeDrawer, toggleDrawer, isOpen }}>
      <View style={styles.container}>
        <Drawer
          open={isOpen}
          onOpen={openDrawer}
          onClose={closeDrawer}
          drawerType="front"
          drawerPosition="left"
          swipeEdgeWidth={60}
          drawerStyle={[styles.drawer, { width: drawerWidth }]}
          overlayStyle={styles.overlay}
          renderDrawerContent={() => <AppDrawerContent />}
        >
          {children}
        </Drawer>
        <Modal
          visible={showRevalidationCover}
          animationType="none"
          presentationStyle="fullScreen"
          statusBarTranslucent
          onRequestClose={() => {}}
        >
          <View style={styles.revalidationCover} accessibilityViewIsModal>
            <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Verificando permisos" />
            <Text variant="bodyMedium" style={styles.revalidationText}>Verificando permisos...</Text>
          </View>
        </Modal>
      </View>
    </DrawerContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  drawer: {
    backgroundColor: colors.surface,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
  },
  overlay: {
    backgroundColor: colors.backdrop,
  },
  revalidationCover: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  revalidationText: {
    color: colors.textSecondary,
  },
});
