"use client";
import { useState } from "react";
import { Search, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import SidePanel from "@/components/SidePanel";
import type { FilterCategory, FilterToggle } from "./FilterPopover";

interface FiltersDrawerProps {
  open: boolean;
  onClose: () => void;
  categories: FilterCategory[];
  toggles: FilterToggle[];
  activeCount: number;
  onClearAll: () => void;
}

// Enterprise filter drawer: each category is a collapsible section (with an
// inline search once it has more than a handful of options). Changes apply live
// to the parent; the footer offers Reset (clear all) and Done. Reuses the same
// FilterCategory/FilterToggle contract as the old FilterPopover.
export default function FiltersDrawer({ open, onClose, categories, toggles, activeCount, onClearAll }: FiltersDrawerProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState<Record<string, string>>({});

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Filters"
      description={activeCount > 0 ? `${activeCount} active` : "Narrow down the list"}
      width="sm"
      onApply={onClose}
      applyLabel="Done"
      onReset={activeCount > 0 ? onClearAll : undefined}
    >
      <div className="space-y-2">
        {categories.map((cat) => {
          const isOpen = expanded === cat.key;
          const q = (search[cat.key] || "").toLowerCase();
          const opts = q ? cat.options.filter((o) => o.label.toLowerCase().includes(q)) : cat.options;
          const showSearch = cat.options.length > 6;
          return (
            <div key={cat.key} className="rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : cat.key)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left outline-none hover:bg-muted/50 transition-colors"
              >
                <span className="text-[13px] font-semibold text-foreground">{cat.label}</span>
                {cat.selected.length > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold grid place-items-center">{cat.selected.length}</span>
                )}
                <ChevronDown className={cn("w-4 h-4 ml-auto text-muted-foreground transition-transform", isOpen && "rotate-180")} />
              </button>

              {isOpen && (
                <div className="border-t border-border px-2 pb-2">
                  {showSearch && (
                    <div className="relative my-2">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <input
                        value={search[cat.key] || ""}
                        onChange={(e) => setSearch((s) => ({ ...s, [cat.key]: e.target.value }))}
                        placeholder={`Search ${cat.label.toLowerCase()}`}
                        className="w-full h-8 pl-8 pr-2 rounded-md border border-input bg-background text-[12.5px] outline-none focus:border-primary"
                      />
                    </div>
                  )}
                  <div className="max-h-[240px] overflow-y-auto">
                    {opts.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">
                        {cat.options.length === 0 ? "Nothing here yet" : "No matches"}
                      </p>
                    ) : (
                      opts.map((opt) => {
                        const checked = cat.selected.includes(opt.value);
                        return (
                          <button
                            type="button"
                            key={opt.value}
                            onClick={() =>
                              cat.onChange(
                                checked ? cat.selected.filter((v) => v !== opt.value) : [...cat.selected, opt.value],
                              )
                            }
                            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted text-left outline-none group"
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
          );
        })}

        {toggles.length > 0 && (
          <div className="pt-1 space-y-0.5">
            {toggles.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={t.onToggle}
                className="w-full flex items-center gap-2.5 px-1 py-2 text-[13px] font-medium text-foreground/85 hover:bg-muted rounded-md outline-none group"
              >
                <span className={cn(
                  "w-[16px] h-[16px] rounded-[5px] border grid place-items-center shrink-0 transition-colors",
                  t.active ? "bg-primary border-primary text-white" : "border-input bg-background group-hover:border-primary/50",
                )}>
                  {t.active && <Check className="w-3 h-3" strokeWidth={3} />}
                </span>
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </SidePanel>
  );
}
