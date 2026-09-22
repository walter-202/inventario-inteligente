import { MD3LightTheme } from "react-native-paper";

/** Design tokens for the Lidemoda mobile client. */
export const colors = {
  primary: "#2563EB",
  primaryDark: "#1D4ED8",
  primarySoft: "#EFF6FF",
  primaryBorder: "#DBEAFE",
  secondary: "#6366F1",
  secondaryDark: "#4F46E5",
  secondarySoft: "#EEF2FF",
  tertiary: "#06B6D4",
  tertiaryDark: "#0891B2",
  tertiarySoft: "#ECFEFF",
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
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  warning: "#D97706",
  warningSoft: "#FEF3C7",
  success: "#10B981",
  successSoft: "#D1FAE5",
  successDark: "#047857",
  /** Acento cálido de mercado (identidad Lidemoda): héroes, análisis y voz. */
  accent: "#F97316",
  accentDark: "#C2410C",
  accentSoft: "#FFEDD5",
  blush: "#FFF7ED",
  rosa: "#EC4899",
  violeta: "#8B5CF6",
  info: "#2563EB",
  infoSoft: "#DBEAFE",
  backdrop: "rgba(15, 23, 42, 0.45)",
} as const;

/** Semantic tokens for entity status badges (ventas, despachos). */
export const statusColors = {
  completed: { bg: "#E8F5E9", text: "#2E7D32" },
  cancelled: { bg: "#FFEBEE", text: "#C62828" },
  inTransit: { bg: "#FEF3C7", text: "#B45309" },
  disabled: "#94A3B8",
} as const;

/** Semantic tokens for inventory movement direction. */
export const movementColors = {
  entrada: { bg: "#DCFCE7", text: "#15803D", icon: "#15803D" },
  salida: { bg: "#FEE2E2", text: "#B91C1C", icon: "#B45309" },
  transferencia: { bg: "#DBEAFE", text: "#1D4ED8", icon: "#1D4ED8" },
} as const;

export const gradients = {
  /** Héroe del panel: naranja mercado → rosa. */
  sunset: ["#F97316", "#EC4899"] as const,
  /** Orbe de voz: violeta → rosa → naranja. */
  orb: ["#8B5CF6", "#EC4899", "#F97316"] as const,
} as const;

export const typography = {
  fontFamily: { heading: "System", body: "System", mono: "monospace" },
  sizes: { hero: 32, title: 24, heading: 18, subheading: 16, body: 14, caption: 12, micro: 10 },
  weights: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    heavy: "800" as const,
  },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, pill: 9999 } as const;
export const shadows = {
  subtle: { shadowColor: colors.neutral, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  card: { shadowColor: colors.neutral, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  floating: { shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 6 },
} as const;

/** Paper MD3 theme; extend the official MD3 light theme rather than replacing it. */
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

export type AppTheme = typeof paperTheme;
export const theme = { colors, statusColors, movementColors, gradients, typography, spacing, radius, shadows, paperTheme };
