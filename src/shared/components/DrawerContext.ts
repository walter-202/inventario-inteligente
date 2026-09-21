import { createContext, useContext } from "react";

export interface DrawerContextValue {
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  isOpen: boolean;
}

export const DrawerContext = createContext<DrawerContextValue>({
  openDrawer: () => {},
  closeDrawer: () => {},
  toggleDrawer: () => {},
  isOpen: false,
});

export function useAppDrawer(): DrawerContextValue {
  return useContext(DrawerContext);
}
