"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEscClose } from "@/lib/useEscClose";

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
  // The calendar stays collapsed behind the DATE RANGE field until the user opens
  // it (clicks the field / icon), matching the enterprise reference.
  const [showCal, setShowCal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);

  // Auto-align the popover so it never clips off the right edge: if there isn't
  // room to open leftward, anchor it to the trigger's right. Overrides `align`.
  const [autoAlign, setAutoAlign] = useState<"left" | "right">(align);
  useEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setAutoAlign(r.left + 300 > window.innerWidth - 12 ? "right" : "left");
  }, [open, align]);
  useEffect(() => { if (!open) setShowCal(false); }, [open]);
  // Esc closes the calendar first, then the popover (shared LIFO stack).
  useEscClose(open, () => setOpen(false));
  useEscClose(showCal, () => setShowCal(false));

  const [pick, setPick] = useState<{ start: string; end: string }>({ start: value.from, end: value.to });
  const [hover, setHover] = useState("");
  const [view, setView] = useState(() => { const a = value.from ? parse(value.from) : new Date(); return new Date(a.getFullYear(), a.getMonth(), 1); });
  useEffect(() => { setPick({ start: value.from, end: value.to }); }, [value.from, value.to]);

  const isCustom = value.preset === "custom" || (!value.preset && !!value.from);
  const label = isCustom && value.from ? `${us(value.from)} - ${us(value.to)}` : (PRESETS.find((p) => p[0] === value.preset)?.[1] || "All time");

  const isFiltered = (!!value.preset && value.preset !== "all") || !!value.from;
  function choosePreset(key: string) { const r = presetRange(key); onChange({ preset: key, from: r.from, to: r.to }); setOpen(false); }
  function clearFilter() { onChange({ preset: "all", from: "", to: "" }); setShowCal(false); setOpen(false); }
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
  // Only surface a range for a real custom pick (or while actively picking). A
  // preset like "Last 30 days" must NOT pre-fill the DATE RANGE field/calendar —
  // the field stays a placeholder until the user picks a custom range.
  const active = value.preset === "custom" || selecting;
  const lo = !active ? "" : (selecting && hover ? (hover < pick.start ? hover : pick.start) : pick.start);
  const hi = !active ? "" : (selecting && hover ? (hover < pick.start ? pick.start : hover) : pick.end);

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
            <button type="button" onClick={() => setShowCal((v) => !v)}
              className={cn("w-full flex items-center gap-2 px-2 h-9 rounded-md border bg-background text-[12px] outline-none transition-colors overflow-hidden", showCal ? "border-primary ring-2 ring-primary/20" : "border-input hover:border-muted-foreground/40")}>
              <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className={cn("truncate min-w-0 tabular-nums", lo ? "text-foreground" : "text-muted-foreground/60")}>
                {lo ? us(lo) : "MM/DD/YYYY"} <span className="text-muted-foreground/50">–</span> {hi ? us(hi) : "MM/DD/YYYY"}
              </span>
            </button>
            {showCal && (<div className="mt-2">
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
            </div>)}
          </div>
          {isFiltered && (
            <div className="mt-2 pt-2 border-t border-border">
              <button type="button" onClick={clearFilter}
                className="w-full h-8 rounded-md text-[12.5px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors">
                Clear filter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
