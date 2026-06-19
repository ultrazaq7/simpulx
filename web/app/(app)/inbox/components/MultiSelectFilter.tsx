"use client";
import { useState, useMemo, useCallback } from "react";
import { Search, ListFilter, X, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
  color?: string; // optional swatch shown next to the label (e.g. interest level)
}

interface MultiSelectFilterProps {
  label: string;
  icon?: React.ReactNode;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** "chip" = compact pill for the top bar; "field" = full-width labeled field for the filter panel. */
  variant?: "chip" | "field";
}

export default function MultiSelectFilter({
  label, icon, options, selected, onChange, variant = "chip",
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const has = selected.length > 0;

  const toggle = useCallback((value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }, [selected, onChange]);

  const showSearch = options.length > 0;

  // ── Shared: searchable, checkable option list ──
  const OptionList = (
    <>
      {showSearch && (
        <div className="relative mb-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}`}
            className="w-full h-8 pl-8 pr-2 rounded-md border border-input bg-background text-[12.5px] outline-none focus:border-primary"
          />
        </div>
      )}
      <div className="max-h-52 overflow-auto -mx-1 px-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-5">No matches</p>
        ) : (
          filtered.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => toggle(opt.value)}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted text-left outline-none"
              >
                <span className={cn(
                  "w-[16px] h-[16px] rounded-[5px] border grid place-items-center shrink-0 transition-colors",
                  checked ? "bg-primary border-primary text-white" : "border-input bg-background",
                )}>
                  {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                </span>
                <span className="text-[13px] font-medium text-foreground/90 truncate">{opt.label}</span>
              </button>
            );
          })
        )}
      </div>
    </>
  );

  // ── Field variant: full-width, label on top, expands in-flow (no clipping inside the panel) ──
  if (variant === "field") {
    return (
      <div>
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</p>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "w-full h-9 px-3 inline-flex items-center justify-between gap-2 rounded-md border bg-background text-[13px] transition-colors outline-none",
            open ? "border-primary" : "border-input hover:border-input/80",
          )}
        >
          <span className={cn("truncate", has ? "font-semibold text-foreground" : "text-muted-foreground")}>
            {has ? `${selected.length} selected` : "Any"}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {has && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); onChange([]); }}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            )}
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
          </span>
        </button>
        {open && (
          <div className="mt-1.5 p-2 rounded-md border border-border bg-background">
            {OptionList}
          </div>
        )}
      </div>
    );
  }

  // ── Chip variant: compact pill + floating dropdown (top filter bar) ──
  const close = () => { setOpen(false); setSearch(""); };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "h-7 inline-flex items-center gap-1 rounded-md px-2 text-[11px] font-semibold ring-1 transition-colors outline-none",
          has
            ? "bg-primary/10 text-primary ring-primary/30"
            : "bg-transparent text-muted-foreground ring-border hover:bg-muted hover:text-foreground",
        )}
      >
        {icon ?? <ListFilter className="w-[15px] h-[15px]" />}
        <span>{has ? `${label} (${selected.length})` : label}</span>
        {has ? (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); onChange([]); }}
            className="ml-0.5 -mr-0.5 rounded p-0.5 hover:bg-primary/20"
          >
            <X className="w-3 h-3" />
          </span>
        ) : (
          <ChevronDown className="w-3 h-3 -mr-0.5 opacity-60" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute left-0 top-full mt-1.5 w-60 rounded-lg border border-border bg-popover shadow-xl z-50 p-2 animate-scale-in origin-top-left">
            {OptionList}
          </div>
        </>
      )}
    </div>
  );
}
