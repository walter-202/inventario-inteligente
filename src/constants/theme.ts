export const colors = {
  // Primario: #2563EB (Royal Electric Blue)
  primary: "#2563EB",
  primaryDark: "#1D4ED8",
  primarySoft: "#EFF6FF",
  primaryBorder: "#DBEAFE",

  // Secundario: #6366F1 (Indigo / Blurple)
  secondary: "#6366F1",
  secondaryDark: "#4F46E5",
  secondarySoft: "#EEF2FF",

  // Terciario: #06B6D4 (Cyan / Teal)
  tertiary: "#06B6D4",
  tertiaryDark: "#0891B2",
  tertiarySoft: "#ECFEFF",

  // Neutros / Superficies
  neutral: "#0F172A",
  neutralDark: "#0B1120",
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#64748B",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceSecondary: "#F1F5F9",
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  white: "#FFFFFF",
  black: "#000000",

  // Semánticos / Estados
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  warning: "#D97706",
  warningSoft: "#FEF3C7",
  success: "#10B981",
  successSoft: "#D1FAE5",
  info: "#2563EB",
  infoSoft: "#DBEAFE",
};

export const typography = {
  fontFamily: {
    heading: "System", // Hanken Grotesk fallback
    body: "System",
    mono: "monospace", // JetBrains Mono fallback
  },
  sizes: {
    hero: 32,
    title: 24,
    heading: 18,
    subheading: 16,
    body: 14,
    caption: 12,
    micro: 10,
  },
  weights: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    heavy: "800" as const,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

import { MD3LightTheme } from "react-native-paper";

export const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    primaryContainer: colors.primarySoft,
    secondary: colors.secondary,
    secondaryContainer: colors.secondarySoft,
    tertiary: colors.tertiary,
    tertiaryContainer: colors.tertiarySoft,
    background: colors.background,
    surface: colors.surface,
    error: colors.danger,
    errorContainer: colors.dangerSoft,
    outline: colors.border,
  },
};

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 9999,
};

export const shadows = {
  subtle: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  card: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  floating: {
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
};

export const theme = {
  colors,
  typography,
  spacing,
  radius,
  shadows,
  paperTheme,
};