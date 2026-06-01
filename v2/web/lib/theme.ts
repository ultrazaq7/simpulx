"use client";
import { createTheme } from "@mui/material/styles";

// ── V1 Brand Colors (from app_style.dart) ───────────────
// Primary: brandGreen #2D8B73
// PrimaryDark: brandGreenDark #236F5D
// Accent: brandAmber #F5A623
// Background: #F4F8F6
// Surface: #FFFFFF
// Border: #DCE8E1
// Text: #0F172A

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#2D8B73", light: "#3AA88D", dark: "#236F5D", contrastText: "#fff" },
    secondary: { main: "#F5A623", light: "#FFBE4F", dark: "#D4890A" },
    success: { main: "#2D8B73", light: "#4CAF50", dark: "#1B5E20" },
    warning: { main: "#F59E0B", light: "#FBBF24", dark: "#D97706" },
    error: { main: "#EF4444", light: "#F87171", dark: "#DC2626" },
    info: { main: "#0288D1" },
    background: { default: "#F4F8F6", paper: "#FFFFFF" },
    text: { primary: "#0F172A", secondary: "#667085", disabled: "#9CA3AF" },
    divider: "rgba(0,0,0,0.08)",
    action: { hover: "rgba(0,0,0,0.04)", selected: "rgba(45,139,115,0.08)" },
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    h4: { fontWeight: 700, fontSize: "1.5rem", letterSpacing: "-0.01em" },
    h5: { fontWeight: 700, fontSize: "1.25rem", letterSpacing: "-0.01em" },
    h6: { fontWeight: 600, fontSize: "1rem" },
    subtitle1: { fontWeight: 600, fontSize: "0.9375rem" },
    subtitle2: { fontWeight: 600, fontSize: "0.8125rem", textTransform: "uppercase" as const, letterSpacing: "0.05em", color: "#667085" },
    body1: { fontSize: "0.875rem", lineHeight: 1.6 },
    body2: { fontSize: "0.8125rem", lineHeight: 1.5 },
    caption: { fontSize: "0.6875rem", color: "#9CA3AF" },
    button: { textTransform: "none" as const, fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  shadows: [
    "none",
    "0 1px 2px rgba(0,0,0,0.05)",
    "0 1px 3px rgba(0,0,0,0.08)",
    "0 2px 4px rgba(0,0,0,0.08)",
    "0 4px 6px rgba(0,0,0,0.07)",
    "0 6px 12px rgba(0,0,0,0.08)",
    "0 8px 16px rgba(0,0,0,0.08)",
    "0 12px 24px rgba(0,0,0,0.1)",
    "0 16px 32px rgba(0,0,0,0.1)",
    "0 20px 40px rgba(0,0,0,0.12)",
    ...Array(15).fill("0 20px 40px rgba(0,0,0,0.12)"),
  ] as any,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale" },
        "*::-webkit-scrollbar": { width: 6, height: 6 },
        "*::-webkit-scrollbar-thumb": { background: "#CBD5E1", "&:hover": { background: "#94A3B8" } },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { fontWeight: 600, padding: "10px 24px", fontSize: "0.875rem", lineHeight: 1.5, borderRadius: 8 },
        contained: { boxShadow: "none", borderRadius: 8, "&:hover": { boxShadow: "0 4px 12px rgba(45,139,115,0.3)" } },
        outlined: { borderWidth: 1.5, borderColor: "rgba(0,0,0,0.18)", color: "#344054", "&:hover": { borderWidth: 1.5, borderColor: "rgba(0,0,0,0.35)", bgcolor: "rgba(0,0,0,0.03)" } },
        sizeSmall: { padding: "7px 18px", fontSize: "0.8125rem" },
        sizeLarge: { padding: "14px 32px", fontSize: "1rem" },
      },
    },
    MuiCard: {
      defaultProps: { variant: "outlined" },
      styleOverrides: {
        root: { borderRadius: 8, borderColor: "rgba(0,0,0,0.08)", boxShadow: "none" },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, fontSize: "0.6875rem", height: 24, borderRadius: 8 },
        sizeSmall: { height: 20, fontSize: "0.625rem" },
      },
    },
    MuiTextField: {
      defaultProps: { size: "small", variant: "outlined" },
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 8, fontSize: "0.875rem",
            "& fieldset": { borderColor: "rgba(0,0,0,0.12)" },
            "&:hover fieldset": { borderColor: "rgba(0,0,0,0.24)" },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { padding: "8px 12px" },
        head: { fontWeight: 600, fontSize: "0.6875rem", textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "#667085", whiteSpace: "nowrap" as const, padding: "8px 12px" },
        body: { fontSize: "0.75rem", borderColor: "rgba(0,0,0,0.06)", padding: "6px 12px" },
      },
    },
    MuiTooltip: {
      defaultProps: { arrow: true },
      styleOverrides: { tooltip: { fontSize: "0.75rem", borderRadius: "6px", padding: "6px 12px" } },
    },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 8 } } },
    MuiTab: { styleOverrides: { root: { textTransform: "none" as const, fontWeight: 600, fontSize: "0.8125rem", minHeight: 40 } } },
    MuiAvatar: { styleOverrides: { root: { fontSize: "0.8125rem", fontWeight: 600 } } },
    MuiSelect: { defaultProps: { size: "small" }, styleOverrides: { root: { borderRadius: 8, fontSize: "0.875rem" } } },
  },
});

export default theme;
