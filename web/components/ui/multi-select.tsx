"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Option { label: string; value: string; }
export interface MultiSelectProps {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

// Searchable multi-select. Uses an inline (non-portaled) dropdown like Select so
// it renders correctly inside modals/dialogs instead of opening behind them.
export function MultiSelect({ options, value, onChange, placeholder = "Select...", className }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<{ up: boolean; maxH: number }>({ up: false, maxH: 320 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQ(""); } };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Open upward when there isn't room below; cap height to the available space.
  useEffect(() => {
    if (!open || !ref.current) return;
    const decide = () => {
      const r = ref.current!.getBoundingClientRect();
      const gap = 8, desired = 320, minH = 180;
      const below = window.innerHeight - r.bottom - gap;
      const above = r.top - gap;
      const up = below < Math.min(desired, minH) && above > below;
      setMenu({ up, maxH: Math.max(140, Math.min(desired, up ? above : below)) });
    };
    decide();
    window.addEventListener("resize", decide);
    window.addEventListener("scroll", decide, true);
    return () => { window.removeEventListener("resize", decide); window.removeEventListener("scroll", decide, true); };
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s)) : options;
  }, [options, q]);

  const toggle = (val: string) => onChange(value.includes(val) ? value.filter((v) => v !== val) : [...value, val]);
  const allSelected = options.length > 0 && value.length === options.length;
  const selectedLabels = value.map((v) => options.find((o) => o.value === v)?.label || v);
  const display = selectedLabels.length === 0 ? placeholder
    : selectedLabels.length > 2 ? `${selectedLabels.length} selected` : selectedLabels.join(", ");

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full h-9 px-3 flex items-center gap-2 rounded-md border bg-background text-[13px] text-left outline-none transition-shadow",
          open ? "border-primary ring-2 ring-primary/20" : "border-input hover:border-muted-foreground/30",
        )}
      >
        <span className={cn("flex-1 truncate", selectedLabels.length === 0 && "text-muted-foreground/70")}>{display}</span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          style={{ maxHeight: menu.maxH }}
          className={cn(
            "absolute left-0 z-50 min-w-full w-max max-w-[280px] rounded-lg border border-border bg-popover shadow-xl overflow-hidden animate-scale-in flex flex-col",
            menu.up ? "bottom-full mb-1.5 origin-bottom-left" : "top-full mt-1.5 origin-top-left",
          )}
        >
          {options.length > 6 && (
            <div className="p-2 border-b border-border shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..."
                  className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-[13px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
          )}
          <div className="overflow-auto py-1 flex-1 min-h-0">
            {options.length > 0 && (
              <button type="button" onClick={() => onChange(allSelected ? [] : options.map((o) => o.value))}
                className="w-full px-3 py-1.5 mb-1 border-b border-border/60 text-[12px] font-semibold text-primary hover:bg-muted text-left outline-none">
                {allSelected ? "Clear all" : "Select all"}
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-4">No results</p>
            ) : filtered.map((o) => {
              const sel = value.includes(o.value);
              return (
                <button key={o.value} type="button" onClick={() => toggle(o.value)}
                  className={cn("w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left outline-none transition-colors hover:bg-muted",
                    sel ? "text-primary font-semibold" : "text-foreground/90")}>
                  <span className={cn("grid place-items-center w-4 h-4 rounded border shrink-0", sel ? "bg-primary border-primary text-white" : "border-input")}>
                    {sel && <Check className="w-3 h-3" />}
                  </span>
                  <span className="flex-1 truncate">{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
