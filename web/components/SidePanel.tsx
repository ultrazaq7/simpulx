"use client";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEscClose } from "@/lib/useEscClose";

const WIDTHS = { sm: "max-w-[400px]", md: "max-w-[480px]", lg: "max-w-[640px]" } as const;

export interface SidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  width?: keyof typeof WIDTHS;
  children: ReactNode;
  /** Fully custom footer (e.g. wizard Back/Next). Overrides the built-in one. */
  footer?: ReactNode;
  /** Built-in footer: primary action. Omit `onApply` to hide the footer. */
  onApply?: () => void;
  applyLabel?: string;
  applyDisabled?: boolean;
  /** Built-in footer: left-aligned "Reset" text button. */
  onReset?: () => void;
  resetLabel?: string;
  /** Spinner on Apply + disables actions while an async submit runs. */
  busy?: boolean;
  cancelLabel?: string;
}

// Enterprise right-side drawer: header + scrollable body + sticky footer. One
// standalone primitive used app-wide for filters, forms, and wizards. Slides in
// from the right, closes on backdrop click / X / Escape (LIFO via useEscClose).
export default function SidePanel({
  open, onClose, title, description, width = "md", children,
  footer, onApply, applyLabel = "Apply", applyDisabled, onReset, resetLabel = "Reset",
  busy = false, cancelLabel = "Cancel",
}: SidePanelProps) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEscClose(open && !busy, onClose);

  // Mount immediately, then flip `shown` on the next frame so the slide-in
  // transition runs. On close, wait out the transition before unmounting.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(t);
  }, [open]);

  // Lock body scroll while any panel is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!mounted) return null;

  const showBuiltInFooter = footer === undefined && onApply !== undefined;

  return createPortal(
    <div className="fixed inset-0 z-[100]" aria-hidden={!open}>
      {/* Backdrop */}
      <div
        className={cn("absolute inset-0 bg-black/40 transition-opacity duration-200", shown ? "opacity-100" : "opacity-0")}
        onClick={busy ? undefined : onClose}
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "absolute inset-y-0 right-0 w-full bg-card border-l border-border shadow-2xl flex flex-col",
          "transition-transform duration-200 ease-out will-change-transform",
          WIDTHS[width],
          shown ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="shrink-0 flex items-start gap-3 px-5 py-4 border-b border-border">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-foreground truncate">{title}</h2>
            {description && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 -mr-1 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {/* Footer */}
        {footer !== undefined ? (
          <div className="shrink-0 border-t border-border bg-card px-5 py-3">{footer}</div>
        ) : showBuiltInFooter ? (
          <div className="shrink-0 flex items-center gap-2 border-t border-border bg-card px-5 py-3">
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                disabled={busy}
                className="text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-colors outline-none disabled:opacity-50"
              >
                {resetLabel}
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-9 px-3.5 rounded-md text-[13px] font-semibold text-foreground/80 hover:bg-muted transition-colors outline-none disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={busy || applyDisabled}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-colors outline-none disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {applyLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
