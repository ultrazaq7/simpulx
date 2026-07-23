"use client";
// Shared Recharts tooltip styled like the rest of the app (popover surface,
// theme tokens, tabular numbers) instead of Recharts' default white box.
// Recharts clones this element with { active, payload, label } injected, so the
// formatter/showTotal props passed at the call site are preserved.
import { cn } from "@/lib/utils";

type Entry = { name?: string; value?: number; color?: string; dataKey?: string };

export function ChartTooltip({
  active, payload, label,
  labelFormat, valueFormat, showTotal, className,
}: {
  active?: boolean;
  payload?: Entry[];
  label?: string | number;
  labelFormat?: (l: string | number) => string;
  valueFormat?: (v: number) => string;
  showTotal?: boolean;
  className?: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => (p.value || 0) > 0);
  if (!rows.length) return null;
  const fmt = valueFormat || ((v: number) => v.toLocaleString("id-ID"));
  const total = rows.reduce((s, p) => s + (p.value || 0), 0);
  // Branded dark-teal surface so every chart tooltip (AI usage, campaign details)
  // matches the general report's tooltip instead of a light popover box.
  return (
    <div className={cn("rounded-md bg-[#0E5B54]/95 backdrop-blur-sm px-3 py-2 shadow-md text-[12px] min-w-[140px]", className)}>
      <p className="font-semibold text-white/70 mb-1.5">
        {labelFormat ? labelFormat(label ?? "") : String(label ?? "")}
      </p>
      <div className="space-y-1">
        {rows.map((p) => (
          <div key={p.dataKey || p.name} className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0 ring-1 ring-white/40" style={{ background: p.color }} />
            <span className="text-white/80 capitalize">{(p.name || "").replaceAll("_", " ")}</span>
            <span className="ml-auto font-bold tabular-nums text-white">{fmt(p.value || 0)}</span>
          </div>
        ))}
      </div>
      {showTotal && rows.length > 1 && (
        <div className="mt-1.5 pt-1.5 border-t border-white/15 flex justify-between gap-6">
          <span className="text-white/70">Total</span>
          <span className="font-semibold tabular-nums text-white">{fmt(total)}</span>
        </div>
      )}
    </div>
  );
}
