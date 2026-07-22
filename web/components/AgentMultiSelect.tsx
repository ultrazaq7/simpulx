"use client";
import { useI18n } from "@/lib/i18n";
// Polished agent multi-select: avatar chips, search, select-all, removable pills.
// Used in the campaign wizard (per branch) and anywhere agents are picked.
import { useState, useMemo, useRef, useEffect } from "react";
import { Search, Check, ChevronDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEscClose } from "@/lib/useEscClose";

export interface AgentOption { id: string; name: string }

function initialsOf(name: string) {
  return (name || "").split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

const AVATAR_COLORS = ["#2563EB", "#7C3AED", "#0891B2", "#DB2777", "#EA580C", "#16A34A", "#9333EA", "#0D9488"];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Avatar({ id, name, size = 22 }: { id: string; name: string; size?: number }) {
  return (
    <span style={{ width: size, height: size, background: colorFor(id) }}
      className="rounded-full grid place-items-center text-white font-bold shrink-0" >
      <span style={{ fontSize: size * 0.42 }}>{initialsOf(name)}</span>
    </span>
  );
}

export function AgentMultiSelect({ options, selected, onChange, placeholder = "Select agents" }: {
  options: AgentOption[]; selected: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  // Esc closes THIS dropdown first (topmost-first via the shared LIFO stack) so a
  // press inside a wizard/drawer dismisses the open menu, not the whole wizard.
  useEscClose(open, () => { setOpen(false); setQ(""); });

  const filtered = useMemo(() => (q ? options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase())) : options), [options, q]);
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const allSel = options.length > 0 && selected.length === options.length;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={cn("w-full min-h-9 px-3 py-1.5 inline-flex items-center justify-between gap-2 rounded-md border bg-background text-[13px] transition-colors outline-none",
          open ? "border-primary" : "border-input hover:border-input/80")}>
        <span className="inline-flex items-center gap-1.5">
          <Users className="w-4 h-4 text-muted-foreground shrink-0" />
          {selected.length === 0
            ? <span className="text-muted-foreground">{placeholder}</span>
            : <span className="font-semibold text-foreground">{selected.length} agent{selected.length > 1 ? "s" : ""} selected</span>}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-lg border border-border bg-popover shadow-xl p-2 animate-scale-in">
          <div className="relative mb-1.5">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("components.searchAgents")}
              className="w-full h-8 pl-8 pr-2 rounded-md border border-input bg-background text-[12.5px] outline-none focus:border-primary" />
          </div>
          {options.length > 0 && (
            <button type="button" onClick={() => onChange(allSel ? [] : options.map((o) => o.id))}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted text-left text-[12px] font-semibold text-primary outline-none">
              {allSel ? t("components.clearAll") : t("components.selectAll")}
            </button>
          )}
          <div className="max-h-56 overflow-auto -mx-1 px-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-5">{t("components.noAgents")}</p>
            ) : filtered.map((o) => {
              const c = selected.includes(o.id);
              return (
                <button type="button" key={o.id} onClick={() => toggle(o.id)} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted text-left outline-none">
                  <span className={cn("w-[16px] h-[16px] rounded-[5px] border grid place-items-center shrink-0", c ? "bg-primary border-primary text-white" : "border-input bg-background")}>
                    {c && <Check className="w-3 h-3" strokeWidth={3} />}
                  </span>
                  <Avatar id={o.id} name={o.name} />
                  <span className="text-[13px] font-medium text-foreground/90 truncate">{o.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* No chip list under the trigger: a real team wraps it over several rows and
          pushes the rest of the form down. The trigger carries the count, and the
          dropdown shows and removes each selection in a list that scrolls. Same
          reasoning as the service-area picker. */}
    </div>
  );
}
