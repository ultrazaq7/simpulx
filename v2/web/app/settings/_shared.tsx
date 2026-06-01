"use client";
// Shared building blocks for the settings section: a toast hook and small bits
// reused across the split setting pages. Keeps each page focused on its own data.
import { useState, type ReactNode } from "react";
import { Box, Snackbar, Alert, Typography } from "@mui/material";

export type ToastSeverity = "success" | "error" | "info";

// useToast centralizes the Snackbar+Alert pattern every settings page repeats.
export function useToast() {
  const [toast, setToast] = useState<{ msg: string; severity: ToastSeverity } | null>(null);
  const notify = (msg: string, severity: ToastSeverity = "success") => setToast({ msg, severity });
  const ToastHost = (
    <Snackbar open={!!toast} autoHideDuration={3500} onClose={() => setToast(null)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
      {toast ? (
        <Alert onClose={() => setToast(null)} severity={toast.severity} variant="filled"
          sx={{ borderRadius: "8px", fontWeight: 600, fontSize: 13, maxWidth: 460 }}>
          {toast.msg}
        </Alert>
      ) : undefined}
    </Snackbar>
  );
  return { notify, ToastHost };
}

// PageHeader: a clean, title-less header row. Left = optional meta/filters,
// right = primary action. Used so every settings page shares the same chrome.
export function PageHeader({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2.5, flexWrap: "wrap", minHeight: 36 }}>
      {left}
      <Box sx={{ flex: 1 }} />
      {right}
    </Box>
  );
}

// Standard scroll container + padding for a settings page body.
export function PageBody({ children, maxWidth }: { children: ReactNode; maxWidth?: number }) {
  return (
    <Box sx={{ px: 3, py: 3, mx: "auto", width: "100%", maxWidth: maxWidth ?? 1040 }}>
      {children}
    </Box>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "text.secondary", textTransform: "uppercase", mb: 1.5 }}>
      {children}
    </Typography>
  );
}

export const ROLES = ["owner", "admin", "manager", "agent"];
export const ROLE_PERMS: Record<string, string> = {
  owner: "Full access including billing and workspace deletion",
  admin: "Manage users, channels, automations, templates and settings",
  manager: "Manage conversations, broadcasts and view analytics",
  agent: "Handle assigned conversations and contacts",
};
export const ROLE_COLOR: Record<string, string> = { owner: "#7C3AED", admin: "#2563EB", manager: "#0891B2", agent: "#64748B" };

export function initials(name: string) {
  return (name || "")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
