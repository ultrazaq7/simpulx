"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

// AI & ML Monitor (super-admin): decision-engine health (lead/closing/NBA scores +
// model versions), AI usage/cost from the llm_usage ledger, an estimated profit
// monitor per client, and per-campaign prompt/AI-style version history.
const fmtIDR = (n: number) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtUSD = (n: number) => "$" + (n || 0).toFixed(2);
const fmtInt = (n: number) => Number(n || 0).toLocaleString("id-ID");

export default function AiMlMonitorPage() {
  const router = useRouter();
  const [ml, setMl] = useState<Awaited<ReturnType<typeof api.mlMonitor>> | null>(null);
  const [camps, setCamps] = useState<Awaited<ReturnType<typeof api.listAllCampaigns>>>([]);
  const [selCamp, setSelCamp] = useState("");
  const [history, setHistory] = useState<Awaited<ReturnType<typeof api.campaignAIHistory>>>([]);

  useEffect(() => {
    api.platformAccess().then((r) => {
      if (!r.super_admin) { router.replace("/settings"); return; }
      api.mlMonitor().then(setMl).catch(() => {});
      api.listAllCampaigns().then(setCamps).catch(() => {});
    }).catch(() => router.replace("/settings"));
  }, [router]);
  useEffect(() => {
    if (!selCamp) { setHistory([]); return; }
    api.campaignAIHistory(selCamp).then(setHistory).catch(() => setHistory([]));
  }, [selCamp]);

  const s = ml?.scores ?? {};
  const u = ml?.usage ?? {};
  const totalProfit = (ml?.profit ?? []).reduce((n, p) => n + (p.profit_idr || 0), 0);
  const CARD = "bg-card rounded-lg border border-border shadow-xs p-4";
  const H = "text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3";

  return (
    <div className="px-6 pt-6 pb-6 w-full h-full overflow-y-auto flex flex-col gap-4">
      {/* Decision engine health */}
      <div className={CARD}>
        <p className={H}>ML Model Monitor</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Lead scored", v: `${s.lead_scored ?? 0} / ${s.total_convs ?? 0}`, sub: `avg ${s.lead_score_avg ?? 0}` },
            { label: "Closing scored", v: `${s.closing_scored ?? 0} / ${s.total_convs ?? 0}`, sub: `avg ${s.closing_avg ?? 0}` },
            { label: "NBA set", v: `${s.nba_set ?? 0}`, sub: "conversations" },
            { label: "Lead hot / mid / low", v: `${s.lead_hot ?? 0} / ${s.lead_mid ?? 0} / ${s.lead_low ?? 0}`, sub: "≥75 / 50-74 / <50" },
          ].map((c) => (
            <div key={c.label} className="rounded-md border border-border p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">{c.label}</p>
              <p className="text-[18px] font-bold text-foreground tabular-nums mt-1">{c.v}</p>
              <p className="text-[11px] text-muted-foreground">{c.sub}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-[11.5px] text-muted-foreground">
          <span className="font-semibold text-foreground">Models:</span>
          {(ml?.versions ?? []).length === 0 ? <span>none scored yet</span>
            : ml!.versions.map((v, i) => <span key={i}>{v.model} <span className="font-mono">{v.version}</span> ({v.n})</span>)}
        </div>
        {(ml?.nba ?? []).length > 0 && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-1 text-[11.5px] text-muted-foreground">
            <span className="font-semibold text-foreground">Next Best Action:</span>
            {ml!.nba.map((a) => <span key={a.action}>{a.action} ({a.n})</span>)}
          </div>
        )}
      </div>

      {/* AI usage */}
      <div className={CARD}>
        <p className={H}>AI Usage (llm_usage ledger)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Cost (all time)", v: fmtUSD(u.cost_usd_all), sub: fmtIDR((u.cost_usd_all || 0) * Number(ml?.usdIdr || 16000)) },
            { label: "Cost (30d)", v: fmtUSD(u.cost_usd_30d), sub: fmtIDR((u.cost_usd_30d || 0) * Number(ml?.usdIdr || 16000)) },
            { label: "AI calls (30d)", v: fmtInt(u.calls_30d), sub: `${fmtInt(u.calls_all)} all time` },
            { label: "Tokens in / out", v: `${fmtInt(u.tokens_in)} / ${fmtInt(u.tokens_out)}`, sub: "all time" },
          ].map((c) => (
            <div key={c.label} className="rounded-md border border-border p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">{c.label}</p>
              <p className="text-[18px] font-bold text-foreground tabular-nums mt-1">{c.v}</p>
              <p className="text-[11px] text-muted-foreground truncate">{c.sub}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">By feature</p>
            <div className="rounded-md border border-border divide-y divide-border/60">
              {(ml?.byFeature ?? []).map((f) => (
                <div key={f.feature} className="flex items-center justify-between px-3 py-1.5 text-[12px]">
                  <span className="text-foreground">{f.feature}</span>
                  <span className="text-muted-foreground tabular-nums">{fmtInt(f.calls)} · {fmtUSD(f.cost_usd)}</span>
                </div>
              ))}
              {(ml?.byFeature ?? []).length === 0 && <p className="px-3 py-2 text-[12px] text-muted-foreground">No usage yet</p>}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">By model</p>
            <div className="rounded-md border border-border divide-y divide-border/60">
              {(ml?.byModel ?? []).map((m) => (
                <div key={m.model} className="flex items-center justify-between px-3 py-1.5 text-[12px]">
                  <span className="text-foreground font-mono">{m.model}</span>
                  <span className="text-muted-foreground tabular-nums">{fmtInt(m.calls)} · {fmtUSD(m.cost_usd)}</span>
                </div>
              ))}
              {(ml?.byModel ?? []).length === 0 && <p className="px-3 py-2 text-[12px] text-muted-foreground">No usage yet</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Profit monitor (estimate) */}
      <div className={CARD}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Profit Monitor (this month, estimate)</p>
          <span className={`text-[13px] font-bold tabular-nums ${totalProfit >= 0 ? "text-success" : "text-red-600"}`}>{fmtIDR(totalProfit)}</span>
        </div>
        <p className="text-[11px] text-muted-foreground mb-2">Revenue = billable AI replies (nurture/reply/followup) x Rp {ml?.creditPriceIdr ?? 200}/credit. Cost = real cost_usd x Rp {Number(ml?.usdIdr ?? 16000).toLocaleString("id-ID")}/USD.</p>
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-[12px]">
            <thead><tr className="bg-muted/40 text-muted-foreground text-[10px] uppercase tracking-wide">
              <th className="text-left px-3 py-1.5 font-bold">Client</th>
              <th className="text-right px-3 py-1.5 font-bold">Credits</th>
              <th className="text-right px-3 py-1.5 font-bold">AI cost</th>
              <th className="text-right px-3 py-1.5 font-bold">Profit (est)</th>
            </tr></thead>
            <tbody>
              {(ml?.profit ?? []).map((p) => (
                <tr key={p.org} className="border-t border-border/60">
                  <td className="px-3 py-1.5 text-foreground">{p.org}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtInt(p.credits)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtUSD(p.cost_usd)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${p.profit_idr >= 0 ? "text-success" : "text-red-600"}`}>{fmtIDR(p.profit_idr)}</td>
                </tr>
              ))}
              {(ml?.profit ?? []).length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-center text-muted-foreground">No billable usage this month</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Prompt / AI style version history */}
      <div className={CARD}>
        <p className={H}>Prompt History</p>
        <div className="min-w-[280px] max-w-[520px]">
          <select value={selCamp} onChange={(e) => setSelCamp(e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-input bg-background text-[13.5px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
            <option value="">Select a campaign...</option>
            {camps.map((c) => <option key={c.id} value={c.id}>{c.org_name} · {c.name} ({c.catalog_rows} catalog)</option>)}
          </select>
        </div>
        {selCamp && (
          <div className="mt-4">
            {history.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">No AI style changes recorded yet. History starts logging on the next save.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border/60 rounded-md border border-border overflow-hidden max-h-[260px] overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="px-3 py-2 text-[12px]">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>{new Date(h.changed_at).toLocaleString("id-ID")}</span>
                      <span className="truncate ml-2">{h.changed_by || "system"}</span>
                    </div>
                    <pre className="mt-1 text-[11px] text-foreground whitespace-pre-wrap break-words font-mono bg-muted/40 rounded p-2 max-h-[120px] overflow-y-auto">{JSON.stringify(h.ai_style, null, 2)}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
