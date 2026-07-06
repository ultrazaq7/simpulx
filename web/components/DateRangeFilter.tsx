"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

// One enterprise date-range filter, reused app-wide: preset list + calendar range
// with a live hover preview of the range you're about to pick.
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

// MM/DD/YYYY to match the enterprise reference input.
function us(s: string) { if (!s) return ""; const d = parse(s); return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`; }

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
  const [hover, setHover] = useState("");
  const [view, setView] = useState(() => { const a = value.from ? parse(value.from) : new Date(); return new Date(a.getFullYear(), a.getMonth(), 1); });
  useEffect(() => { setPick({ start: value.from, end: value.to }); }, [value.from, value.to]);

  const isCustom = value.preset === "custom" || (!value.preset && !!value.from);
  const label = isCustom && value.from ? `${us(value.from)} - ${us(value.to)}` : (PRESETS.find((p) => p[0] === value.preset)?.[1] || "All time");

  function choosePreset(key: string) { const r = presetRange(key); onChange({ preset: key, from: r.from, to: r.to }); setOpen(false); }
  function onDay(d: Date) {
    const s = fmtLocal(d);
    if (!pick.start || pick.end) { setPick({ start: s, end: "" }); setHover(""); return; }
    const [from, to] = s < pick.start ? [s, pick.start] : [pick.start, s];
    setPick({ start: from, end: to });
    onChange({ preset: "custom", from, to });
    setOpen(false);
  }

  // While picking the second date, preview the range against the hovered day.
  const selecting = !!pick.start && !pick.end;
  const lo = selecting && hover ? (hover < pick.start ? hover : pick.start) : pick.start;
  const hi = selecting && hover ? (hover < pick.start ? pick.start : hover) : pick.end;

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
        <div className={cn("absolute z-50 mt-1.5 w-[300px] rounded-xl border border-border bg-popover shadow-xl p-2", align === "right" ? "right-0" : "left-0")}>
          <div className="flex flex-col">
            {PRESETS.map(([k, l]) => (
              <button key={k} onClick={() => choosePreset(k)}
                className={cn("text-left px-2.5 py-1.5 rounded-md text-[13px] outline-none hover:bg-muted transition-colors", value.preset === k ? "text-primary font-semibold" : "text-foreground")}>{l}</button>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-border">
            <p className="px-1 mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Date range</p>
            <div className="flex items-center gap-2 mb-2 px-2 h-9 rounded-md border border-input bg-background text-[12.5px]">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className={cn("tabular-nums", lo ? "text-foreground" : "text-muted-foreground/60")}>
                {lo ? us(lo) : "MM/DD/YYYY"} <span className="text-muted-foreground/50">–</span> {hi ? us(hi) : "MM/DD/YYYY"}
              </span>
            </div>
            <div className="flex items-center justify-between px-1 mb-1.5">
              <button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} className="p-1 rounded-md hover:bg-muted outline-none"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-[13px] font-semibold text-foreground">{view.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
              <button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} className="p-1 rounded-md hover:bg-muted outline-none"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-7 gap-y-0.5 text-center" onMouseLeave={() => setHover("")}>
              {DOW.map((d) => <div key={d} className="text-[10px] font-bold text-muted-foreground py-1">{d}</div>)}
              {cells.map((d, i) => d === null ? <div key={i} /> : (() => {
                const s = fmtLocal(d);
                const edge = (!!lo && s === lo) || (!!hi && s === hi);
                const between = !!lo && !!hi && s > lo && s < hi;
                return (
                  <div key={i} className={cn("py-0.5", between && "bg-primary/10", edge && lo !== hi && (s === lo ? "bg-primary/10 rounded-l-full" : "bg-primary/10 rounded-r-full"))}>
                    <button
                      onClick={() => onDay(d)}
                      onMouseEnter={() => setHover(s)}
                      className={cn("w-8 h-8 rounded-full text-[12px] outline-none transition-colors mx-auto flex items-center justify-center",
                        edge ? "bg-primary text-white font-semibold" : between ? "text-foreground" : "text-foreground hover:bg-muted")}>
                      {d.getDate()}
                    </button>
                  </div>
                );
              })())}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
