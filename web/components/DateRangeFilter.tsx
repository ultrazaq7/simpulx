"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// One enterprise date-range filter, reused app-wide: preset list + calendar range.
export type DateRangeValue = { preset: string; from: string; to: string };

function fmtLocal(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function parse(s: string) { const [y, m, d] = s.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); }

export function presetRange(key: string): { from: string; to: string } {
  const today = new Date();
  const t = fmtLocal(today);
  const back = (n: number) => { const d = new Date(today); d.setDate(today.getDate() - n); return fmtLocal(d); };
  switch (key) {
    case "today": return { from: t, to: t };
    case "yesterday": return { from: back(1), to: back(1) };
    case "7d": return { from: back(6), to: t };
    case "30d": return { from: back(29), to: t };
    case "90d": return { from: back(89), to: t };
    default: return { from: "", to: "" };
  }
}

const PRESETS: [string, string][] = [
  ["all", "All time"], ["today", "Today"], ["yesterday", "Yesterday"], ["7d", "Last 7 days"], ["30d", "Last 30 days"],
];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function nice(s: string) { return s ? parse(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""; }

export default function DateRangeFilter({ value, onChange, align = "left" }: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);

  const [pick, setPick] = useState<{ start: string; end: string }>({ start: value.from, end: value.to });
  const [view, setView] = useState(() => { const a = value.from ? parse(value.from) : new Date(); return new Date(a.getFullYear(), a.getMonth(), 1); });
  useEffect(() => { setPick({ start: value.from, end: value.to }); }, [value.from, value.to]);

  const isCustom = value.preset === "custom" || (!value.preset && !!value.from);
  const label = isCustom && value.from ? `${nice(value.from)} - ${nice(value.to)}` : (PRESETS.find((p) => p[0] === value.preset)?.[1] || "All time");

  function choosePreset(key: string) { const r = presetRange(key); onChange({ preset: key, from: r.from, to: r.to }); setOpen(false); }
  function onDay(d: Date) {
    const s = fmtLocal(d);
    if (!pick.start || pick.end) { setPick({ start: s, end: "" }); return; }
    const [from, to] = s < pick.start ? [s, pick.start] : [pick.start, s];
    setPick({ start: from, end: to });
    onChange({ preset: "custom", from, to });
    setOpen(false);
  }

  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const dim = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = Array(first.getDay()).fill(null);
    for (let d = 1; d <= dim; d++) out.push(new Date(view.getFullYear(), view.getMonth(), d));
    return out;
  }, [view]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-background text-[13px] font-medium text-foreground hover:bg-muted outline-none transition-colors">
        {label}<ChevronDown className="w-4 h-4 text-muted-foreground" />
      </button>
      {open && (
        <div className={cn("absolute z-50 mt-1.5 w-[290px] rounded-xl border border-border bg-popover shadow-xl p-2", align === "right" ? "right-0" : "left-0")}>
          <div className="flex flex-col">
            {PRESETS.map(([k, l]) => (
              <button key={k} onClick={() => choosePreset(k)}
                className={cn("text-left px-2.5 py-1.5 rounded-md text-[13px] outline-none hover:bg-muted transition-colors", value.preset === k ? "text-primary font-semibold" : "text-foreground")}>{l}</button>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} className="p-1 rounded-md hover:bg-muted outline-none"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-[13px] font-semibold text-foreground">{view.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
              <button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} className="p-1 rounded-md hover:bg-muted outline-none"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {DOW.map((d) => <div key={d} className="text-[10px] font-bold text-muted-foreground py-1">{d}</div>)}
              {cells.map((d, i) => d === null ? <div key={i} /> : (() => {
                const s = fmtLocal(d);
                const edge = s === pick.start || s === pick.end;
                const between = pick.start && pick.end && s > pick.start && s < pick.end;
                return (
                  <button key={i} onClick={() => onDay(d)}
                    className={cn("h-8 rounded-md text-[12px] outline-none transition-colors", edge ? "bg-primary text-white" : between ? "bg-primary/15 text-foreground" : "text-foreground hover:bg-muted")}>{d.getDate()}</button>
                );
              })())}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
