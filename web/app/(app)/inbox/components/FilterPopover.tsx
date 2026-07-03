"use client";
import { useMemo, useState } from "react";
import { Search, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEscClose } from "@/lib/useEscClose";
import type { FilterOption } from "./MultiSelectFilter";

export interface FilterCategory {
  key: string;
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (v: string[]) => void;
}

export interface FilterToggle {
  key: string;
  label: string;
  active: boolean;
  onToggle: () => void;
  dividerBefore?: boolean; // render a section separator above this toggle
}

interface FilterPopoverProps {
  categories: FilterCategory[];
  toggles: FilterToggle[];
  activeCount: number;
  onClearAll: () => void;
  onClose: () => void;
}

// SleekFlow-style master-detail filter: categories on the left, the selected
// category's searchable options on the right.
export default function FilterPopover({ categories, toggles, activeCount, onClearAll, onClose }: FilterPopoverProps) {
  const [activeKey, setActiveKey] = useState("");
  const [search, setSearch] = useState("");
  useEscClose(true, onClose); // mounted only while open

  // No category open by default; the detail panel reveals on hover (or click).
  const activeCat = categories.find((c) => c.key === activeKey);

  const filteredOptions = useMemo(() => {
    if (!activeCat) return [];
    if (!search.trim()) return activeCat.options;
    const q = search.toLowerCase();
    return activeCat.options.filter((o) => o.label.toLowerCase().includes(q));
  }, [activeCat, search]);

  const toggleOption = (value: string) => {
    if (!activeCat) return;
    const next = activeCat.selected.includes(value)
      ? activeCat.selected.filter((v) => v !== value)
      : [...activeCat.selected, value];
    activeCat.onChange(next);
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        onMouseLeave={() => setActiveKey("")}
        className="relative z-50 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover shadow-2xl overflow-hidden animate-scale-in origin-top-left flex"
      >
        {/* ── Left: categories + toggles ── */}
        <div className="w-[224px] shrink-0 border-r border-border flex flex-col">
          <p className="px-4 pt-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Filter</p>
          <div className="flex-1 overflow-y-auto pb-1">
            {categories.map((c) => {
              const count = c.selected.length;
              const isActive = c.key === activeKey;
              return (
                <button
                  key={c.key}
                  type="button"
                  onMouseEnter={() => { setActiveKey(c.key); setSearch(""); }}
                  onClick={() => { setActiveKey(c.key); setSearch(""); }}
                  className={cn(
                    "w-full flex items-center gap-2 pl-4 pr-3 py-2.5 text-[13px] font-medium outline-none transition-colors",
                    isActive ? "bg-primary/[0.07] text-primary" : "text-foreground/85 hover:bg-muted",
                  )}
                >
                  <span className="truncate">{c.label}</span>
                  {count > 0 && (
                    <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold grid place-items-center">{count}</span>
                  )}
                  <ChevronRight className={cn("w-4 h-4 shrink-0", count > 0 ? "ml-1.5" : "ml-auto", isActive ? "text-primary" : "text-muted-foreground/60")} />
                </button>
              );
            })}

            {toggles.length > 0 && <div className="my-1.5 mx-3 border-t border-border" />}
            {toggles.map((t) => (
              <div key={t.key}>
              {t.dividerBefore && <div className="my-1.5 mx-3 border-t border-border" />}
              <button
                type="button"
                onClick={t.onToggle}
                className="w-full flex items-center gap-2.5 pl-4 pr-3 py-2 text-[13px] font-medium text-foreground/85 hover:bg-muted outline-none group"
              >
                <span className={cn(
                  "w-[16px] h-[16px] rounded-[5px] border grid place-items-center shrink-0 transition-colors",
                  t.active ? "bg-primary border-primary text-white" : "border-input bg-background group-hover:border-primary/50",
                )}>
                  {t.active && <Check className="w-3 h-3" strokeWidth={3} />}
                </span>
                <span className="truncate">{t.label}</span>
              </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={activeCount === 0}
            onClick={onClearAll}
            className="px-4 py-2.5 text-left text-[13px] font-semibold text-muted-foreground hover:text-foreground border-t border-border disabled:opacity-40 disabled:hover:text-muted-foreground outline-none transition-colors"
          >
            Clear all
          </button>
        </div>

        {/* ── Right: options for the hovered category (revealed on hover) ── */}
        {activeCat && (
          <div className="w-[332px] flex flex-col max-h-[420px] animate-slide-in-left">
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{activeCat.label}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allValues = filteredOptions.map((o) => o.value);
                      activeCat.onChange(allValues);
                    }}
                    className="text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:underline outline-none"
                  >
                    Select all
                  </button>
                  {activeCat.selected.length > 0 && (
                    <button
                      type="button"
                      onClick={() => activeCat.onChange([])}
                      className="text-[11px] font-semibold text-primary hover:underline outline-none"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="px-4 pb-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Search ${activeCat.label.toLowerCase()}`}
                    className="w-full h-9 pl-8 pr-2 rounded-md border border-input bg-background text-[13px] outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-2 pb-2">
                {filteredOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    {activeCat.options.length === 0 ? "Nothing to filter here yet" : "No matches"}
                  </p>
                ) : (
                  filteredOptions.map((opt) => {
                    const checked = activeCat.selected.includes(opt.value);
                    return (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => toggleOption(opt.value)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-muted text-left outline-none group"
                      >
                        <span className={cn(
                          "w-[16px] h-[16px] rounded-[5px] border grid place-items-center shrink-0 transition-colors",
                          checked ? "bg-primary border-primary text-white" : "border-input bg-background group-hover:border-primary/50",
                        )}>
                          {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                        </span>
                        {opt.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />}
                        <span className="text-[13px] font-medium text-foreground/90 truncate">{opt.label}</span>
                      </button>
                    );
                  })
                )}
              </div>
          </div>
        )}
      </div>
    </>
  );
}
