"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, XCircle } from "lucide-react";
import { cn, stageLabel } from "@/lib/utils";
import { useEscClose } from "@/lib/useEscClose";
import { useI18n } from "@/lib/i18n";
import type { Stage } from "@/lib/types";

// --- Stage color map (semantic data colors) ---
// Sales funnel colors (must match the dashboard's FUNNEL_COLORS order):
// New Lead -> Contacted -> Qualified -> Appointment -> Negotiation -> Purchase.
export const stageColorMap: Record<string, string> = {
  new_lead: "#6366F1", "new lead": "#6366F1",
  contacted: "#0EA5E9",
  qualified: "#14B8A6",
  appointment: "#8B5CF6",
  negotiation: "#F59E0B",
  purchase: "#16A34A",
  // legacy aliases (pre-rename) so old data still colors sensibly
  test_drive: "#F59E0B", "test drive": "#F59E0B",
  booking: "#16A34A",
};
export function getDotColor(name: string): string {
  return stageColorMap[name.toLowerCase()] || stageColorMap[name.toLowerCase().replace(/\s+/g, "_")] || "#64748B";
}

// Pipeline stages = progress (New ... Purchase). Lost/Spam are terminal OUTCOMES
// (dispositions + reason), not stages — so they live in their own section here.
// Shared by the inbox chat header and the Contacts table so both behave identically.
// The menu renders in a portal so it never gets clipped by a scrolling table.
export function StageMenu({
  stages, currentStageId, onSelect, onMarkOutcome, align = "left",
}: {
  stages: Stage[];
  currentStageId: string | null;
  onSelect: (id: string) => void;
  onMarkOutcome: () => void;
  align?: "left" | "right";
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
        className="flex items-center gap-1.5 px-2.5 h-8 rounded-l-md text-[13px] font-semibold text-foreground hover:bg-muted transition-colors outline-none"
      >
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: current ? getDotColor(current.name) : "hsl(var(--muted-foreground))" }} />
        {current ? stageLabel(t, current) : "Select stage"}
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
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
            <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pipeline stage</p>
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
            <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Outcome</p>
            <button
              onClick={() => { onMarkOutcome(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 outline-none"
            >
              <XCircle className="w-3.5 h-3.5" />
              Mark as lost / spam
            </button>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
