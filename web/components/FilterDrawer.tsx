"use client";
import { useI18n } from "@/lib/i18n";
// Shared "Filter" button + right-side filter drawer, so every list page collapses
// its inline filter dropdowns into one button that opens a consistent panel.
import { X, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

export function FilterButton({ count, onClick, label = "Filter" }: { count: number; onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border bg-background text-[13px] font-medium text-foreground hover:bg-muted outline-none transition-colors">
      <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />{label}
      {count > 0 && <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[11px] font-bold grid place-items-center tabular-nums">{count}</span>}
    </button>
  );
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-bold text-foreground/80 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export function FilterDrawer({ open, onClose, onClear, canClear = true, children }: {
  open: boolean; onClose: () => void; onClear: () => void; canClear?: boolean; children: ReactNode;
}) {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[60] animate-in" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[320px] max-w-[90vw] bg-card border-l border-border shadow-2xl z-[60] flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
          <p className="text-[14px] font-bold text-foreground">{t("components.filters")}</p>
          <button onClick={onClose} aria-label={t("components.closeFilters")}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground outline-none transition-colors"><X className="w-[18px] h-[18px]" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">{children}</div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border shrink-0">
          <button onClick={onClear} disabled={!canClear}
            className="flex-1 h-9 rounded-md border border-border text-[13px] font-semibold text-foreground hover:bg-muted disabled:opacity-50 outline-none transition-colors">{t("common.clear")}</button>
          <button onClick={onClose}
            className="flex-1 h-9 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary-dark outline-none transition-colors">{t("components.apply")}</button>
        </div>
      </div>
    </>
  );
}
