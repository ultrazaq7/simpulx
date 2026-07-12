"use client";
import { useI18n } from "@/lib/i18n";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastSeverity = "success" | "error" | "info";

// Modern toast: a solid, brand-colored bar pinned bottom-right with a countdown
// ring around the close button that visibly depletes over [durationMs], then
// auto-dismisses. Click the X to close early.
export function Toast({
  msg,
  severity = "success",
  onClose,
  durationMs = 4000,
}: {
  msg: string;
  severity?: ToastSeverity;
  onClose: () => void;
  durationMs?: number;
}) {
  const { t } = useI18n();
  // Keep the auto-dismiss timer stable across parent re-renders.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const t = setTimeout(() => onCloseRef.current(), durationMs);
    return () => clearTimeout(t);
  }, [durationMs]);

  const R = 9;
  const C = 2 * Math.PI * R; // ring circumference

  return (
    <div className="fixed bottom-6 right-6 z-[120] animate-toast-in">
      <div
        className={cn(
          "flex items-center gap-3 pl-4 pr-2 py-2.5 rounded-xl shadow-2xl ring-1 ring-black/10 text-[13.5px] font-semibold text-white max-w-[min(460px,calc(100vw-3rem))]",
          severity === "error" ? "bg-destructive" : "bg-primary",
        )}
      >
        <span className="min-w-0 break-words">{msg}</span>
        <button
          onClick={onClose}
          aria-label={t("components.close")}
          className="relative grid place-items-center w-7 h-7 shrink-0 rounded-full hover:bg-white/15 outline-none transition-colors"
        >
          <svg className="absolute inset-0 w-7 h-7 -rotate-90" viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r={R} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2.5" />
            <circle
              cx="12"
              cy="12"
              r={R}
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={C}
              style={{ animation: `toastRing ${durationMs}ms linear forwards` }}
            />
          </svg>
          <X className="w-3.5 h-3.5 relative" />
        </button>
      </div>
    </div>
  );
}
