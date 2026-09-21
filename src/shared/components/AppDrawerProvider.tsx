import React, { useCallback, useState, type PropsWithChildren } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { Drawer } from "react-native-drawer-layout";
import { colors } from "../theme";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { AppDrawerContent } from "./AppDrawerContent";
import { DrawerContext, useAppDrawer, type DrawerContextValue } from "./DrawerContext";

export { useAppDrawer, type DrawerContextValue };

export function AppDrawerProvider({ children }: PropsWithChildren) {
  const { status } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const { width } = useWindowDimensions();

  const openDrawer = useCallback(() => {
    if (status === "ready") setIsOpen(true);
  }, [status]);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  const toggleDrawer = useCallback(() => {
    if (status === "ready") setIsOpen((prev) => !prev);
  }, [status]);

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
    </DrawerContext.Provider>
  );
}

const styles = StyleSheet.create({
  drawer: {
    backgroundColor: colors.surface,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
  },
  overlay: {
    backgroundColor: colors.backdrop,
  },
});
