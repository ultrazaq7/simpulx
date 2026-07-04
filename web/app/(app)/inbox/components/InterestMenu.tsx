"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { AltArrowDownLinear as ChevronDown, CheckReadLinear as Check } from "solar-icon-set";
import { cn, interestColor } from "@/lib/utils";
import { useEscClose } from "@/lib/useEscClose";
import { Tip } from "@/components/ui/tooltip";

// Compact lead-interest (temperature) picker for the chat header, next to the
// Stage chip. Interest is otherwise read-only in the Details panel; this is the
// single place to change it by hand. Portaled so it never gets clipped.
const OPTS = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
];

export function InterestMenu({
  value, onSelect, align = "left",
}: {
  value: string | null;
  onSelect: (v: string) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const W = 176; // w-44
  useEscClose(open, () => setOpen(false));
  const cur = (value || "").toLowerCase();
  const current = OPTS.find((o) => o.value === cur);

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
      <Tip label="Interest level">
        <button
          ref={btnRef}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 px-2.5 h-8 rounded-md border border-border bg-background text-[13px] font-semibold text-foreground hover:bg-muted transition-colors outline-none shrink-0"
        >
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: current ? interestColor(current.value) : "hsl(var(--muted-foreground))" }} />
          {current?.label || "Unset"}
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </Tip>

      {open && pos && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className={cn(
              "z-[81] w-44 bg-popover rounded-lg border border-border shadow-xl py-1 animate-scale-in",
              align === "right" ? "origin-top-right" : "origin-top-left",
            )}
          >
            <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Interest level</p>
            <button
              onClick={() => { onSelect(""); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-foreground/90 hover:bg-muted outline-none"
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-muted-foreground/40" />
              Unset
              {cur === "" && <Check className="w-4 h-4 text-primary ml-auto" />}
            </button>
            {OPTS.map((o) => (
              <button
                key={o.value}
                onClick={() => { onSelect(o.value); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-foreground/90 hover:bg-muted outline-none"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: interestColor(o.value) }} />
                {o.label}
                {cur === o.value && <Check className="w-4 h-4 text-primary ml-auto" />}
              </button>
            ))}

          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
