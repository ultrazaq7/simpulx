"use client";
import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Wallet, Package, Sparkles, Users, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import type { RevenueReport } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChartTooltip } from "@/components/ChartTooltip";

const rp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
const rpShort = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp ${Math.round(n / 1_000)}rb`;
  return `Rp ${n}`;
};

type Preset = { key: string; label: string; months?: number; days?: number };
const PRESETS: Preset[] = [
  { key: "30d", label: "30 hari", days: 30 },
  { key: "90d", label: "90 hari", days: 90 },
  { key: "6m", label: "6 bulan", months: 6 },
  { key: "12m", label: "12 bulan", months: 12 },
  { key: "ytd", label: "Tahun ini" },
];

function rangeFor(p: Preset): { from: string; to: string } {
  const to = new Date();
  let from = new Date();
  if (p.key === "ytd") from = new Date(to.getFullYear(), 0, 1);
  else if (p.days) from.setDate(from.getDate() - p.days);
  else if (p.months) from.setMonth(from.getMonth() - p.months);
  const f = (d: Date) => d.toISOString().slice(0, 10);
  return { from: f(from), to: f(to) };
}

export default function RevenuePage() {
  const [preset, setPreset] = useState("12m");
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [data, setData] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    if (custom) return custom;
    return rangeFor(PRESETS.find((p) => p.key === preset) || PRESETS[3]);
  }, [preset, custom]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.revenue(range.from, range.to).then((r) => { if (alive) setData(r); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range.from, range.to]);

  const k = data?.kpi;
  const trend = (data?.trend || []).map((t) => ({ ...t, label: t.month }));
  const health = data?.health;
  const churn = data?.churn;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" /> Revenue
          </h1>
          <p className="text-[13px] text-muted-foreground">Pendapatan, langganan aktif, dan churn dari transaksi yang di-approve.</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => { setPreset(p.key); setCustom(null); }}
              className={cn("px-2.5 py-1.5 rounded-md text-[12.5px] font-medium border transition-colors",
                !custom && preset === p.key ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-muted")}>
              {p.label}
            </button>
          ))}
          <div className="flex items-center gap-1 ml-1">
            <input type="date" value={range.from} onChange={(e) => setCustom({ from: e.target.value, to: range.to })}
              className="rounded-md border border-border bg-card px-2 py-1.5 text-[12px] outline-none" />
            <span className="text-muted-foreground text-xs">–</span>
            <input type="date" value={range.to} onChange={(e) => setCustom({ from: range.from, to: e.target.value })}
              className="rounded-md border border-border bg-card px-2 py-1.5 text-[12px] outline-none" />
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="py-24 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Memuat…
        </div>
      ) : (
        <>
          {/* Hero revenue + split */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-1 rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-primary/5 p-5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Total pendapatan</p>
              <p className="text-[34px] font-extrabold tabular-nums text-foreground leading-tight mt-1">{rp(k?.revenue || 0)}</p>
              <p className="text-[12px] text-muted-foreground mt-1">{range.from} → {range.to}</p>
            </div>
            <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Kpi icon={Package} label="Bundle" value={rpShort(k?.revenue_bundle || 0)} sub={`${k?.bundles || 0} deal`} tone="primary" />
              <Kpi icon={Sparkles} label="AI Kredit" value={rpShort(k?.revenue_ai_credit || 0)} sub={`${k?.ai_credits || 0} top-up`} tone="violet" />
              <Kpi icon={Users} label="Signup berbayar" value={`${k?.paid_signups || 0}`} sub={`${k?.trials_started || 0} trial`} tone="emerald" />
              <Kpi icon={Wallet} label="Kredit terjual" value={`${(k?.credits_sold || 0).toLocaleString("id-ID")}`} sub="kredit" tone="amber" />
            </div>
          </div>

          {/* Trend */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">Tren pendapatan bulanan</p>
            {trend.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Belum ada data di rentang ini.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={trend} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={(v: number) => rpShort(v)} />
                  <RTooltip cursor={{ fill: "hsl(var(--muted))" }} content={<ChartTooltip showTotal valueFormat={(v) => rp(v)} />} />
                  <Bar dataKey="bundle" stackId="r" fill="#2D8B73" name="Bundle" maxBarSize={34} />
                  <Bar dataKey="ai_credit" stackId="r" fill="#7C3AED" name="AI Kredit" radius={[3, 3, 0, 0]} maxBarSize={34} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Subscription health + churn */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[13px] font-semibold text-foreground mb-3">Kesehatan langganan</p>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Aktif" value={health?.active || 0} tone="emerald" icon={Users} />
                <Stat label="Trial" value={health?.trial || 0} tone="violet" icon={Sparkles} />
                <Stat label="Jatuh tempo <7 hari" value={health?.expiring_soon || 0} tone="amber" icon={Clock} />
                <Stat label="Kedaluwarsa" value={health?.expired || 0} tone="rose" icon={AlertTriangle} />
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[13px] font-semibold text-foreground mb-3 flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4 text-rose-500" /> Churn (rentang ini)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Langganan lapse" value={churn?.lapsed || 0} tone="rose" icon={TrendingDown} />
                <Stat label="Request ditolak" value={churn?.rejected || 0} tone="muted" icon={AlertTriangle} />
              </div>
              <p className="text-[11.5px] text-muted-foreground mt-3 leading-relaxed">
                Lapse = langganan yang tanggal renewal-nya lewat di rentang ini dan belum diperpanjang. Kejar via Transactions.
              </p>
            </div>
          </div>

          {/* Top orgs */}
          {(data?.top_orgs?.length || 0) > 0 && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <p className="text-[13px] font-semibold text-foreground px-4 py-2.5 border-b border-border">Top klien (pendapatan)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/30 border-b border-border">
                      <th className="px-4 py-2">Klien</th>
                      <th className="px-4 py-2 text-right">Deal</th>
                      <th className="px-4 py-2 text-right">Pendapatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {data!.top_orgs.map((o, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-medium text-foreground truncate max-w-[280px]">{o.org}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{o.deals}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{rp(o.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
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
      <p className="text-[19px] font-extrabold tabular-nums text-foreground leading-none">{value}</p>
      <p className="text-[12px] font-medium text-foreground mt-1">{label}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={cn("w-6 h-6 rounded-md grid place-items-center", TONES[tone])}><Icon className="w-3.5 h-3.5" /></span>
        <span className="text-[22px] font-extrabold tabular-nums text-foreground">{value.toLocaleString("id-ID")}</span>
      </div>
      <p className="text-[12px] text-muted-foreground">{label}</p>
    </div>
  );
}
