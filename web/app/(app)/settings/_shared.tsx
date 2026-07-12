"use client";
import { useI18n } from "@/lib/i18n";
// Shared building blocks for the settings section: a toast hook and small bits
// reused across the split setting pages. Keeps each page focused on its own data.
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import { Tip } from "@/components/ui/tooltip";
import { Toast, type ToastSeverity } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";

export type { ToastSeverity };

// useToast centralizes the toast pattern every settings page repeats, and also
// exposes an in-app confirm() (replacing window.confirm). ToastHost renders both
// the toast and the confirm dialog, so pages just render {ToastHost} once.
export function useToast() {
  const [toast, setToast] = useState<{ msg: string; severity: ToastSeverity } | null>(null);
  const notify = (msg: string, severity: ToastSeverity = "success") => setToast({ msg, severity });
  const { confirm, ConfirmHost } = useConfirm();

  const ToastHost = (
    <>
      {toast && <Toast msg={toast.msg} severity={toast.severity} onClose={() => setToast(null)} />}
      {ConfirmHost}
    </>
  );

  return { notify, confirm, ToastHost };
}

// PageHeader: a clean, title-less header row. Left = optional meta/filters,
// right = primary action. Used so every settings page shares the same chrome.
export function PageHeader({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-5 flex-wrap min-h-[36px]">
      {left}
      <div className="flex-1" />
      {right}
    </div>
  );
}

// Standard scroll container + padding for a settings page body.
// wide = use the full available width (no centered max-width) while keeping scroll.
export function PageBody({ children, maxWidth, fill, wide }: { children: ReactNode; maxWidth?: number; fill?: boolean; wide?: boolean }) {
  // fill = stretch to full height (for list/table pages so the card doesn't hang).
  if (fill) {
    return <div className="px-6 py-6 w-full h-full flex flex-col min-h-0">{children}</div>;
  }
  // Non-fill pages scroll inside themselves (the content area is overflow-hidden),
  // so long settings pages still scroll but never add a second outer scrollbar.
  return (
    <div className="h-full overflow-y-auto">
      <div className={cn("px-6 py-6 w-full", !wide && "mx-auto")} style={wide ? undefined : { maxWidth: maxWidth ?? 1040 }}>
        {children}
      </div>
    </div>
  );
}

// Consistent section label across all settings pages.
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase mb-3">
      {children}
    </p>
  );
}

// SettingsCard: the white card wrapper used by almost every settings page.
export function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("bg-card border border-border rounded-lg shadow-xs", className)}>
      {children}
    </div>
  );
}

// InfoHint: a small (i) button that reveals a description on hover, so fields can
// stay clean instead of carrying verbose helper text underneath.
export function InfoHint({ text }: { text: string }) {
  const { t } = useI18n();
  return (
    <Tip label={text}>
      <button type="button" tabIndex={-1} aria-label={t("settings.moreInfo")}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors align-middle">
        <Info className="w-3.5 h-3.5" />
      </button>
    </Tip>
  );
}

// FieldLabel: the tiny label above every form input. Repeated ~30 times across pages.
// An optional `hint` renders an info button + hover tooltip beside the label.
export function FieldLabel({ children, className, hint }: { children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cn("flex items-center gap-1.5 text-[12px] font-bold text-foreground/80 mb-1", className)}>
      <span>{children}</span>
      {hint && <InfoHint text={hint} />}
    </label>
  );
}

// Standard input class string for consistency.
export const INPUT_CLASS = "w-full h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary";

// PrimaryButton: the brand-green action button.
export function PrimaryButton({ children, onClick, disabled, className }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md text-sm font-semibold",
        "hover:bg-primary-dark shadow-sm hover:shadow-brand-md disabled:opacity-50 transition-all outline-none",
        className,
      )}
    >
      {children}
    </button>
  );
}

// GhostButton: secondary / cancel actions.
export function GhostButton({ children, onClick, disabled, className }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-foreground/70 hover:bg-muted transition-colors outline-none disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export const ROLES = ["owner", "admin", "manager", "agent"];
export const ROLE_PERMS: Record<string, string> = {
  owner: "Full access including billing and workspace deletion",
  admin: "Manage users, channels, automations, templates and settings",
  manager: "Manage conversations, broadcasts and view analytics",
  agent: "Handle assigned conversations and contacts",
};
// Darkened so each color passes WCAG AA (4.5:1) as text on its own 10% tint.
export const ROLE_COLOR: Record<string, string> = { owner: "#6D28D9", admin: "#1D4ED8", manager: "#0E7490", agent: "#475569" };

export function initials(name: string) {
  return (name || "")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
