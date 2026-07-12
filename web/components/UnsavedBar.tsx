"use client";
import { useI18n } from "@/lib/i18n";
import { Loader2 } from "lucide-react";

// Floating unsaved-changes bar. Appears only when there are pending edits, so a
// settings page never needs its own inline Save button. One bar app-wide.
export default function UnsavedBar({ count, saving, onSave, onCancel, saveLabel = "Save changes" }: {
  count: number;
  saving?: boolean;
  onSave: () => void;
  onCancel: () => void;
  saveLabel?: string;
}) {
  const { t } = useI18n();
  if (count <= 0) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 pl-4 pr-2 py-2 rounded-xl border border-border bg-card shadow-2xl">
      <span className="text-[13px] text-foreground/80 whitespace-nowrap">
        {t("components.youHaveUpdated")} <b className="text-foreground tabular-nums">{count}</b> field{count === 1 ? "" : "s"}
      </span>
      <button
        onClick={onCancel}
        disabled={saving}
        className="h-8 px-3 rounded-lg text-[13px] font-semibold text-foreground/70 hover:bg-muted outline-none disabled:opacity-50 transition-colors"
      >
        {t("common.cancel")}
      </button>
      <button
        onClick={onSave}
        disabled={saving}
        className="h-8 px-4 rounded-lg text-[13px] font-semibold text-white bg-primary hover:bg-primary-dark shadow-sm outline-none disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors"
      >
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{saveLabel}
      </button>
    </div>
  );
}
