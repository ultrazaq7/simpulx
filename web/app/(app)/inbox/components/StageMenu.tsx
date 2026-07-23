"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, XCircle } from "lucide-react";
import { cn, stageLabel } from "@/lib/utils";
import { useEscClose } from "@/lib/useEscClose";
import { useI18n } from "@/lib/i18n";
import { stageColor } from "@/lib/leadColors";
import type { Stage } from "@/lib/types";

// Stage colors now come from the single source of truth in lib/leadColors so a
// stage is the same color in the inbox, the contacts table and every report.
// getDotColor / stageColorMap are kept as thin wrappers for existing callers.
export function getDotColor(name: string): string {
  return stageColor(name);
}
export const stageColorMap: Record<string, string> = new Proxy({}, {
  get: (_t, key) => stageColor(String(key)),
}) as Record<string, string>;

// Pipeline stages = progress (New ... Purchase). Lost/Spam are terminal OUTCOMES
// (dispositions + reason), not stages · so they live in their own section here.
// Shared by the inbox chat header and the Contacts table so both behave identically.
// The menu renders in a portal so it never gets clipped by a scrolling table.
export function StageMenu({
  stages, currentStageId, onSelect, onMarkOutcome, align = "left", compact = false,
}: {
  stages: Stage[];
  currentStageId: string | null;
  onSelect: (id: string) => void;
  onMarkOutcome: () => void;
  align?: "left" | "right";
  compact?: boolean; // denser trigger for the compact Contacts table
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const current = stages.find((s) => s.id === currentStageId);
  const W = 224; // w-56
  useEscClose(open, () => setOpen(false));

  useEffect(() => {
    if (!open || !btnRef.current) { setPos(null); return; }
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const left = align === "right" ? r.right - W : r.left;
      setPos({ top: r.bottom + 6, left: Math.min(Math.max(8, left), window.innerWidth - W - 8) });
    };
    place();
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", place); };
  }, [open, align]);

  return (
    <div className="relative inline-flex">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center font-semibold text-foreground hover:bg-muted transition-colors outline-none",
          compact ? "gap-1 px-2 h-6 rounded-md text-[11px]" : "gap-1.5 px-2.5 h-8 rounded-l-md text-[13px]",
        )}
      >
        <span className={cn("rounded-full shrink-0", compact ? "w-2 h-2" : "w-2.5 h-2.5")} style={{ backgroundColor: current ? getDotColor(current.name) : "hsl(var(--muted-foreground))" }} />
        {current ? stageLabel(t, current) : t("components.selectStage")}
        <ChevronDown className={cn("text-muted-foreground", compact ? "w-3 h-3" : "w-3.5 h-3.5")} />
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className={cn(
              "z-[81] w-56 bg-popover rounded-lg border border-border shadow-xl py-1 max-h-[400px] overflow-auto animate-scale-in",
              align === "right" ? "origin-top-right" : "origin-top-left",
            )}
          >
            <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("automation.pipelineStage")}</p>
            {stages.filter((s) => !(s.system_key || "").startsWith("lost") && !s.name.toLowerCase().startsWith("lost")).map((s) => (
              <button
                key={s.id}
                onClick={() => { onSelect(s.id); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-foreground/90 hover:bg-muted outline-none"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getDotColor(s.name) }} />
                {stageLabel(t, s)}
                {s.id === currentStageId && <Check className="w-4 h-4 text-primary ml-auto" />}
              </button>
            ))}
            <div className="border-t border-border my-1" />
            <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("inbox.outcome")}</p>
            <button
              onClick={() => { onMarkOutcome(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 outline-none"
            >
              <XCircle className="w-3.5 h-3.5" />
              {t("contacts.markAsLostSpam")}
            </button>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
