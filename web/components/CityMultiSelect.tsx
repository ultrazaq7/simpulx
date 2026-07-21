"use client";
// Service-area picker: metro-area presets on top, then a searchable city list.
//
// The campaign's service area used to be settable ONLY as a side effect of
// uploading a pricelist, which left catalog-less campaigns (a lender, a clinic, a
// course) permanently empty — and empty means the assistant can never recognise
// an out-of-area lead, and ads have no geo target to derive. This is the direct
// editor for it, so pricing a city and serving it stay separate claims.
//
// Free text is allowed on purpose: ID_CITIES is explicitly not exhaustive, so a
// user must be able to type a kecamatan or a city we did not list and press Enter.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X, Check, MapPin } from "lucide-react";
import { ID_CITIES, ID_CITY_GROUPS } from "@/lib/idCities";
import { cn } from "@/lib/utils";

export function CityMultiSelect({
  value,
  onChange,
  placeholder = "Select cities",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    // Escape closes the dropdown. Listened for on the document rather than on the
    // search input so it works wherever focus sits inside the panel, and stopped
    // from bubbling so it does not also close the surrounding wizard modal.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setOpen(false); setQ(""); }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const selected = useMemo(() => new Set(value), [value]);

  // Any city the user typed that is not in our list still has to appear in the
  // list, otherwise it silently becomes uneditable once the input is cleared.
  const options = useMemo(() => {
    const all = Array.from(new Set([...ID_CITIES, ...value]));
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((c) => c.toLowerCase().includes(needle)) : all;
  }, [q, value]);

  const typed = q.trim();
  const canAddTyped =
    typed.length > 0 && !options.some((c) => c.toLowerCase() === typed.toLowerCase());

  function toggle(city: string) {
    onChange(selected.has(city) ? value.filter((c) => c !== city) : [...value, city]);
  }

  // A preset toggles as a unit: if every city in it is already selected, tapping
  // it removes them. Otherwise it adds the missing ones without dropping anything
  // the user picked by hand.
  function toggleGroup(cities: string[]) {
    const allIn = cities.every((c) => selected.has(c));
    if (allIn) {
      onChange(value.filter((c) => !cities.includes(c)));
    } else {
      onChange(Array.from(new Set([...value, ...cities])));
    }
  }

  function addTyped() {
    if (!canAddTyped) return;
    onChange(Array.from(new Set([...value, typed])));
    setQ("");
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full h-10 px-3 flex items-center gap-2 rounded-md border border-input bg-muted text-sm text-left outline-none transition-shadow focus:border-primary"
      >
        <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className={cn("flex-1 truncate", value.length === 0 && "text-muted-foreground/70")}>
          {value.length === 0 ? placeholder : `${value.length} ${value.length === 1 ? "city" : "cities"} selected`}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {value.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 h-7 rounded-full border border-border bg-card text-[12.5px] font-medium text-foreground">
              {c}
              <button type="button" onClick={() => toggle(c)} className="p-0.5 rounded-full hover:bg-muted outline-none" aria-label={`Remove ${c}`}>
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </span>
          ))}
          <button type="button" onClick={() => onChange([])} className="inline-flex items-center h-7 px-2 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground outline-none">
            Clear all
          </button>
        </div>
      )}

      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-lg border border-border bg-card shadow-xl overflow-hidden animate-scale-in">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addTyped(); }
                }}
                placeholder="Search or type a city…"
                className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-muted text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Presets first: picking a metro area is the common case, and doing it
              one city at a time is where people quietly miss one. */}
          <div className="px-2 py-2 border-b border-border bg-muted/30 flex flex-wrap gap-1.5">
            {ID_CITY_GROUPS.map((g) => {
              const allIn = g.cities.every((c) => selected.has(c));
              return (
                <button
                  key={g.label}
                  type="button"
                  onClick={() => toggleGroup(g.cities)}
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 h-7 rounded-full border text-[12px] font-semibold transition-colors outline-none",
                    allIn ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  <MapPin className="w-3 h-3" />
                  {g.label}
                  <span className="text-muted-foreground font-medium">{g.cities.length}</span>
                </button>
              );
            })}
          </div>

          <div className="max-h-[240px] overflow-auto py-1">
            {canAddTyped && (
              <button type="button" onClick={addTyped} className="w-full px-3 py-2 flex items-center gap-2 text-sm text-left hover:bg-muted outline-none">
                <Plus_ />
                Add <span className="font-semibold">{typed}</span>
              </button>
            )}
            {options.length === 0 && !canAddTyped ? (
              <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">No cities match.</p>
            ) : (
              options.map((c) => {
                const on = selected.has(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggle(c)}
                    className="w-full px-3 py-1.5 flex items-center gap-2.5 text-sm text-left hover:bg-muted outline-none"
                  >
                    <span className={cn("w-4 h-4 rounded border grid place-items-center shrink-0", on ? "bg-primary border-primary" : "border-input")}>
                      {on && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <span className="truncate">{c}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Plus_() {
  return (
    <span className="w-4 h-4 rounded border border-dashed border-input grid place-items-center shrink-0 text-muted-foreground text-[13px] leading-none">
      +
    </span>
  );
}
