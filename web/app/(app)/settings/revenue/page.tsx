"use client";
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import { TrendingDown, Wallet, Package, Sparkles, Users, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { RevenueReport } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChartTooltip } from "@/components/ChartTooltip";
import DateRangeFilter, { type DateRangeValue } from "@/components/DateRangeFilter";

const rp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
const rpShort = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp ${Math.round(n / 1_000)}rb`;
  return `Rp ${n}`;
};

export default function RevenuePage() {
  const { t } = useI18n();
  const TYPES: [string, string][] = [["", t("rev.allTypes")], ["bundle", "Bundle"], ["ai_credit", t("rev.aiCredit")]];
  const [range, setRange] = useState<DateRangeValue>({ preset: "all", from: "", to: "" });
  const [type, setType] = useState("");
  const [data, setData] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.revenue(range.from || undefined, range.to || undefined, type || undefined)
      .then((r) => { if (alive) setData(r); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range.from, range.to, type]);

  const k = data?.kpi;
  const trend = data?.trend || [];
  const health = data?.health;
  const churn = data?.churn;

  return (
    // The settings shell is overflow-hidden, so the page owns its own scroll:
    // a fixed filter bar with everything below it in one scrollable column.
    <div className="h-full flex flex-col min-h-0">
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 border-b border-border bg-card">
        <DateRangeFilter value={range} onChange={setRange} />
        <div className="flex rounded-md border border-border overflow-hidden">
          {TYPES.map(([v, label]) => (
            <button key={v} onClick={() => setType(v)}
              className={cn("px-3 py-1.5 text-[12.5px] font-medium transition-colors whitespace-nowrap",
                type === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
        {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        {/* Hero + product split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-primary/5 p-5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{t("rev.totalRevenue")}</p>
            <p className="text-[30px] sm:text-[34px] font-extrabold tabular-nums text-foreground leading-tight mt-1 break-words">{rp(k?.revenue || 0)}</p>
          </div>
          <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi icon={Package} label="Bundle" value={rpShort(k?.revenue_bundle || 0)} sub={`${k?.bundles || 0} ${t("rev.deals")}`} tone="primary" />
            <Kpi icon={Sparkles} label={t("rev.aiCredit")} value={rpShort(k?.revenue_ai_credit || 0)} sub={`${k?.ai_credits || 0} ${t("rev.topups")}`} tone="violet" />
            <Kpi icon={Users} label={t("rev.paidSignups")} value={`${k?.paid_signups || 0}`} sub={`${k?.trials_started || 0} ${t("rev.trial")}`} tone="emerald" />
            <Kpi icon={Wallet} label={t("rev.creditsSold")} value={`${(k?.credits_sold || 0).toLocaleString("id-ID")}`} sub={t("rev.credits")} tone="amber" />
          </div>
        </div>

        {/* Trend */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[13px] font-semibold text-foreground mb-3">{t("rev.monthlyTrend")}</p>
          {trend.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">{t("rev.noData")}</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <div className="min-w-[420px]">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={trend} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={(v: number) => rpShort(v)} />
                    <RTooltip cursor={{ fill: "hsl(var(--muted))" }} content={<ChartTooltip showTotal valueFormat={(v) => rp(v)} />} />
                    <Bar dataKey="bundle" stackId="r" fill="#2D8B73" name="Bundle" maxBarSize={34} />
                    <Bar dataKey="ai_credit" stackId="r" fill="#7C3AED" name="AI Kredit" radius={[3, 3, 0, 0]} maxBarSize={34} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* Health + churn */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">{t("rev.subHealth")}</p>
            <div className="grid grid-cols-2 gap-3">
              <Stat label={t("rev.active")} value={health?.active || 0} tone="emerald" icon={Users} />
              <Stat label={t("rev.trial")} value={health?.trial || 0} tone="violet" icon={Sparkles} />
              <Stat label={t("rev.expiringSoon")} value={health?.expiring_soon || 0} tone="amber" icon={Clock} />
              <Stat label={t("rev.expired")} value={health?.expired || 0} tone="rose" icon={AlertTriangle} />
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <TrendingDown className="w-4 h-4 text-rose-500" /> {t("rev.churn")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Stat label={t("rev.lapsed")} value={churn?.lapsed || 0} tone="rose" icon={TrendingDown} />
              <Stat label={t("rev.rejected")} value={churn?.rejected || 0} tone="muted" icon={AlertTriangle} />
            </div>
            <p className="text-[11.5px] text-muted-foreground mt-3 leading-relaxed">
              {t("rev.lapsedHint")}
            </p>
          </div>
        </div>

        {/* Top clients */}
        {(data?.top_orgs?.length || 0) > 0 && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <p className="text-[13px] font-semibold text-foreground px-4 py-2.5 border-b border-border">{t("rev.topClients")}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/30 border-b border-border">
                    <th className="px-4 py-2">{t("rev.client")}</th>
                    <th className="px-4 py-2 text-right">{t("rev.deals")}</th>
                    <th className="px-4 py-2 text-right">{t("rev.revenue")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data!.top_orgs.map((o, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium text-foreground truncate max-w-[220px] sm:max-w-none">{o.org}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{o.deals}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap">{rp(o.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const TONES: Record<string, string> = {
  primary: "text-primary bg-primary/10",
  violet: "text-violet-600 bg-violet-500/10",
  emerald: "text-emerald-600 bg-emerald-500/10",
  amber: "text-amber-600 bg-amber-500/10",
  rose: "text-rose-600 bg-rose-500/10",
  muted: "text-muted-foreground bg-muted",
};

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: any; label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <div className={cn("w-8 h-8 rounded-lg grid place-items-center mb-2", TONES[tone])}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-[18px] font-extrabold tabular-nums text-foreground leading-none break-words">{value}</p>
      <p className="text-[12px] font-medium text-foreground mt-1">{label}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={cn("w-6 h-6 rounded-md grid place-items-center shrink-0", TONES[tone])}><Icon className="w-3.5 h-3.5" /></span>
        <span className="text-[20px] font-extrabold tabular-nums text-foreground">{value.toLocaleString("id-ID")}</span>
      </div>
      <p className="text-[12px] text-muted-foreground leading-snug">{label}</p>
    </div>
  );
}
