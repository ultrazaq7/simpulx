"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// `dot` is an optional CSS color rendered as a small leading status dot (used for
// e.g. lead interest hot/warm/cold) — a clean, professional alternative to emoji.
export interface SelectOption { value: string; label: string; disabled?: boolean; dot?: string }

interface MenuPos { left: number; width: number; maxH: number; up: boolean; top?: number; bottom?: number }

// Polished, searchable single-select to replace native <select> across the app.
// Brand green, soft, searchable (auto when >6 options or `searchable`).
// The menu is portaled to <body> with fixed positioning so it never gets clipped
// by an overflow-hidden ancestor (cards, dialogs), and flips up when low on space.
export function Select({
  value, options, onChange, placeholder = "Select...", className, searchable, disabled,
}: {
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  searchable?: boolean;
  disabled?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<MenuPos>({ left: 0, width: 0, maxH: 320, up: false });
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const current = options.find((o) => o.value === value);
  // Search box on for every dropdown (opt out with searchable={false}).
  const showSearch = searchable ?? true;
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false); setQ("");
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Measure the trigger and decide where the menu goes (below by default, above
  // when there isn't room), capping height to the available space.
  useEffect(() => {
    if (!open || !ref.current) return;
    const decide = () => {
      const r = ref.current!.getBoundingClientRect();
      const gap = 6, desired = 320, minH = 200;
      const below = window.innerHeight - r.bottom - gap;
      const above = r.top - gap;
      const up = below < Math.min(desired, minH) && above > below;
      const maxH = Math.max(160, Math.min(desired, up ? above : below));
      setPos({
        left: r.left, width: r.width, maxH, up,
        top: up ? undefined : r.bottom + gap,
        bottom: up ? window.innerHeight - r.top + gap : undefined,
      });
    };
    decide();
    window.addEventListener("resize", decide);
    window.addEventListener("scroll", decide, true);
    return () => { window.removeEventListener("resize", decide); window.removeEventListener("scroll", decide, true); };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full h-9 px-3 flex items-center gap-2 rounded-md border bg-background text-[13px] text-left outline-none transition-shadow disabled:opacity-50 disabled:cursor-not-allowed",
          open ? "border-primary ring-2 ring-primary/20" : "border-input hover:border-muted-foreground/30",
        )}
      >
        {current?.dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: current.dot }} />}
        <span className={cn("flex-1 truncate", current ? "text-foreground" : "text-muted-foreground")}>{current?.label || placeholder}</span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH, zIndex: 1000 }}
          className={cn(
            "rounded-lg border border-border bg-popover shadow-xl overflow-hidden animate-scale-in flex flex-col",
            pos.up ? "origin-bottom" : "origin-top",
          )}
        >
          {showSearch && (
            <div className="p-2 border-b border-border shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search..."
                  className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          )}
          <div className="overflow-auto py-1 flex-1 min-h-0">
            {filtered.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-4">No results</p>
            ) : filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                disabled={o.disabled}
                onClick={() => { onChange(o.value); setOpen(false); setQ(""); }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left outline-none transition-colors disabled:opacity-40",
                  o.value === value ? "bg-primary/10 text-primary font-semibold" : "text-foreground/90 hover:bg-muted",
                )}
              >
                {o.dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: o.dot }} />}
                <span className="flex-1 truncate">{o.label}</span>
                {o.value === value && <Check className="w-4 h-4 shrink-0" />}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default Select;
