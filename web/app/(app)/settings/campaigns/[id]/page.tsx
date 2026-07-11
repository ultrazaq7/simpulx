"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Coins, Sparkles, BarChart3, Database, Upload, Trash2, Download, ChevronDown, FileText, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { api, getToken, getUser } from "@/lib/api";
import { Select } from "@/components/Select";
import DateRangeFilter, { presetRange } from "@/components/DateRangeFilter";
import { IndonesiaMap } from "@/components/IndonesiaMap";
import { cn, fmtDuration } from "@/lib/utils";
import type { CampaignDetail, CampaignAnalyticsRow, CatalogItem, AdPerformance, AdBreakdown, Ga4Report } from "@/lib/types";
import { useToast, PageBody, FieldLabel, INPUT_CLASS } from "../../_shared";
import { useConfirm } from "@/components/ConfirmDialog";
import UnsavedBar from "@/components/UnsavedBar";

const SEGMENTS = ["Automotive", "Property / Real Estate", "Finance", "Insurance", "Retail / FMCG", "Education", "Healthcare", "Travel & Hospitality", "Food & Beverage", "Services", "Other"];
type Tab = "overview" | "credits" | "ai" | "catalog";

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notify, confirm, ToastHost } = useToast();
  // Persist the active tab in the URL so a refresh keeps you on the same tab
  // instead of snapping back to Overview.
  const TAB_KEYS: Tab[] = ["overview", "credits", "ai", "catalog"];
  const urlTab = searchParams.get("tab") as Tab | null;
  const [tab, setTabState] = useState<Tab>(urlTab && TAB_KEYS.includes(urlTab) ? urlTab : "overview");
  const setTab = (t: Tab) => {
    setTabState(t);
    router.replace(`/settings/campaigns/${id}?tab=${t}`, { scroll: false });
  };
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCampaign(id).then(setCampaign).catch((e) => notify(String(e), "error")).finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: { key: Tab; label: string; Icon: typeof Coins }[] = [
    { key: "overview", label: "Overview", Icon: BarChart3 },
    { key: "credits", label: "Credits & Usage", Icon: Coins },
    { key: "ai", label: "AI Assistant", Icon: Sparkles },
    { key: "catalog", label: "Catalog & Pricing", Icon: Database },
  ];

  return (
    <PageBody wide>
      {ToastHost}
      <div className="max-w-[1040px]">
        <button onClick={() => router.push("/settings/campaigns")} className="no-print inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground mb-3 outline-none">
          <ArrowLeft className="w-4 h-4" /> Campaigns
        </button>
        {loading ? (
          <div className="grid place-items-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : !campaign ? (
          <p className="text-muted-foreground">Campaign not found.</p>
        ) : (
          <div className="print-root bg-card border border-border rounded-xl shadow-xs p-6 sm:p-8">
            <h1 className="text-xl font-bold text-foreground">{campaign.name}</h1>
            {campaign.dealer_name && <p className="text-[13px] text-muted-foreground">{campaign.dealer_name}</p>}
            <div className="no-print flex gap-1 mt-5 border-b border-border overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tabs.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={cn("inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors outline-none shrink-0 whitespace-nowrap",
                    tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  <t.Icon className="w-4 h-4 shrink-0" /> {t.label}
                </button>
              ))}
            </div>
            <div className="mt-6">
              {tab === "overview" && <OverviewTab id={id} name={campaign.name} budget={campaign.monthly_budget ?? null} onBudget={(v) => setCampaign((c) => (c ? { ...c, monthly_budget: v } : c))} notify={notify} />}
              {tab === "credits" && <CreditsTab id={id} notify={notify} />}
              {tab === "ai" && <AITab campaign={campaign} onSaved={(c) => { setCampaign(c); notify("AI settings saved"); }} onError={(m) => notify(m, "error")} />}
              {tab === "catalog" && <CatalogTab id={id} segment={campaign.segment ?? undefined} notify={notify} />}
            </div>
          </div>
        )}
      </div>
    </PageBody>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className={cn("text-2xl font-bold tabular-nums", accent ?? "text-foreground")}>{value}</p>
      <p className="text-[12px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

const money = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");
const num = (n: number) => Math.round(n).toLocaleString("id-ID");
const pctFmt = (n: number) => n.toFixed(2) + "%";

function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((c) => {
    const s = String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}
function downloadCsv(name: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

const DONUT_COLORS = ["#2D8B73", "#6366F1", "#F97316", "#A5B4FC", "#8B5E34", "#14B8A6", "#EAB308", "#EC4899"];

type BreakdownMetric = "reach" | "impressions" | "results";

// Age / gender donut from Meta demographic breakdowns. One metric (reach, else
// impressions, else results) drives the whole chart so shares always match.
function Donut({ title, data }: { title: string; data?: AdBreakdown[] }) {
  const rows = (data || []).filter((r) => (r.value || "").toLowerCase() !== "unknown");
  const sum = (k: BreakdownMetric) => rows.reduce((a, b) => a + (b[k] || 0), 0);
  const metric: BreakdownMetric = sum("reach") > 0 ? "reach" : sum("impressions") > 0 ? "impressions" : "results";
  const total = sum(metric);
  const chart = rows
    .map((b, i) => ({ name: b.value, value: b[metric] || 0, color: DONUT_COLORS[i % DONUT_COLORS.length] }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-[13px] font-semibold text-foreground mb-2">{title}</p>
      {chart.length === 0 ? (
        <div className="h-[160px] grid place-items-center text-[13px] text-muted-foreground">No demographic data yet</div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-[42%] shrink-0 h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chart} dataKey="value" nameKey="name" innerRadius={42} outerRadius={66} paddingAngle={2} stroke="none">
                  {chart.map((c) => <Cell key={c.name} fill={c.color} />)}
                </Pie>
                <RTooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-1 min-w-0">
            {chart.map((c) => (
              <div key={c.name} className="flex items-center gap-2 text-[12px]">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                <span className="flex-1 truncate text-foreground/90 capitalize">{c.name}</span>
                <span className="tabular-nums font-semibold text-foreground">{total > 0 ? ((c.value / total) * 100).toFixed(1) : 0}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Province-level location performance on the Indonesia choropleth.
function LocationPanel({ data }: { data?: AdBreakdown[] }) {
  const rows = (data || []).filter((r) => (r.value || "").toLowerCase() !== "unknown");
  const sumResults = rows.reduce((a, b) => a + (b.results || 0), 0);
  const sumImpr = rows.reduce((a, b) => a + (b.impressions || 0), 0);
  const metric: "results" | "impressions" = sumResults > 0 ? "results" : "impressions";
  const ranked = rows
    .map((b) => ({ name: b.value, value: b[metric] || 0 }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
  if (ranked.length === 0 || sumImpr === 0) return null;
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-[13px] font-semibold text-foreground mb-3">Top locations {metric === "results" ? "(leads)" : "(reach)"}</p>
      <IndonesiaMap points={ranked} />
    </div>
  );
}

const pct01 = (n: number) => (n * 100).toFixed(2) + "%";
const fmtSec = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

// GA4 landing-page performance. Fetches the campaign's GA4 report; if no property
// is connected it shows an inline connect form (property id + OAuth refresh token
// with the analytics.readonly scope), mapping the property to this campaign.
function Ga4Panel({ campaignId, from, to }: { campaignId: string; from: string; to: string }) {
  const [report, setReport] = useState<Ga4Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    setLoading(true);
    let alive = true;
    api.getCampaignGa4(campaignId, from || undefined, to || undefined)
      .then((r) => { if (alive) setReport(r); })
      .catch(() => { if (alive) setReport(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [campaignId, from, to, nonce]);

  async function connect() {
    if (!propertyId.trim() || !refreshToken.trim()) return;
    setBusy(true);
    try {
      await api.createGa4Connection({ property_id: propertyId.trim(), refresh_token: refreshToken.trim(), campaign_id: campaignId });
      setShowForm(false); setPropertyId(""); setRefreshToken(""); setNonce((n) => n + 1);
    } catch { /* surfaced via reload */ }
    finally { setBusy(false); }
  }

  const t = report?.totals;
  const tiles = t ? [
    { label: "Total users", value: num(t.total_users) },
    { label: "Active users", value: num(t.active_users) },
    { label: "New users", value: num(t.new_users) },
    { label: "Sessions", value: num(t.sessions) },
    { label: "Engaged sessions", value: num(t.engaged_sessions) },
    { label: "Engagement rate", value: pct01(t.engagement_rate) },
    { label: "Avg engagement", value: fmtSec(t.avg_engagement_sec) },
    { label: "Views", value: num(t.views) },
  ] : [];

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-semibold text-foreground">Landing page performance <span className="text-muted-foreground font-normal">· GA4</span></p>
        {report?.connected && !showForm && (
          <button onClick={() => setShowForm(true)} className="text-[12px] font-semibold text-primary hover:underline outline-none">Reconnect</button>
        )}
      </div>

      {loading ? (
        <div className="h-24 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (!report?.connected || showForm) ? (
        <div className="rounded-lg border border-dashed border-border p-5 text-center">
          <p className="text-[13px] font-semibold text-foreground">Connect Google Analytics 4</p>
          <p className="text-[12px] text-muted-foreground mt-1 mb-3">Show landing-page sessions, engagement and users for this campaign.</p>
          {showForm || !report?.connected ? (
            <div className="max-w-[420px] mx-auto flex flex-col gap-2 text-left">
              <input value={propertyId} onChange={(e) => setPropertyId(e.target.value)} placeholder="GA4 property ID (e.g. 123456789)" className={INPUT_CLASS} />
              <input value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} placeholder="OAuth refresh token (analytics.readonly)" className={INPUT_CLASS} />
              <div className="flex justify-end gap-2 mt-1">
                {showForm && <button onClick={() => setShowForm(false)} className="px-3.5 h-9 rounded-md border border-border text-[13px] font-medium hover:bg-muted outline-none">Cancel</button>}
                <button onClick={connect} disabled={busy || !propertyId.trim() || !refreshToken.trim()} className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary-dark disabled:opacity-50 outline-none">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />} Connect
                </button>
              </div>
              {report?.error && <p className="text-[12px] text-destructive">{report.error}</p>}
            </div>
          ) : null}
        </div>
      ) : report.error ? (
        <p className="text-[13px] text-destructive">{report.error}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {tiles.map((x) => (
              <div key={x.label} className="rounded-lg border border-border bg-card p-3">
                <p className="text-lg font-bold tabular-nums text-foreground">{x.value}</p>
                <p className="text-[11.5px] text-muted-foreground mt-0.5">{x.label}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] whitespace-nowrap">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-[11px] uppercase tracking-wider">
                  {["Landing page", "Views", "Sessions", "New users", "Engagement"].map((h, i) => (
                    <th key={h} className={cn("px-3 py-2 font-bold", i === 0 ? "text-left" : "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No landing-page data in this range</td></tr>
                ) : report.rows.map((r, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td className="px-3 py-2 max-w-[280px] truncate text-foreground" title={r.landing_page}>{r.landing_page || "(not set)"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(r.views)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(r.sessions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(r.new_users)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pct01(r.engagement_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// Budget utilization: a user-set monthly ad budget vs actual spend (Cost) for the
// range → Media budget / Cost / Budget left / Utilization %, with a bar.
function BudgetPanel({ id, budget, spend, onBudget, notify }: {
  id: string; budget: number | null; spend: number;
  onBudget: (v: number | null) => void; notify: (m: string, s?: "success" | "error") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(budget != null ? String(budget) : "");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setVal(budget != null ? String(budget) : ""); }, [budget]);

  async function save() {
    const n = val.trim() === "" ? null : Number(val);
    if (n != null && (isNaN(n) || n < 0)) { notify("Enter a valid budget", "error"); return; }
    setSaving(true);
    try {
      await api.updateCampaign(id, { monthly_budget: n });
      onBudget(n); setEditing(false); notify("Budget saved");
    } catch (e) { notify(String(e), "error"); }
    finally { setSaving(false); }
  }

  const left = budget != null ? budget - spend : 0;
  const util = budget && budget > 0 ? (spend / budget) * 100 : 0;

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-semibold text-foreground">Budget utilization</p>
        {!editing && <button onClick={() => setEditing(true)} className="text-[12px] font-semibold text-primary hover:underline outline-none">{budget != null ? "Edit budget" : "Set budget"}</button>}
      </div>
      {editing ? (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">Rp</span>
            <input value={val} onChange={(e) => setVal(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Monthly budget" inputMode="numeric"
              className="h-9 pl-9 pr-3 rounded-md border border-input bg-background text-[13px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 w-[200px]" />
          </div>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary-dark disabled:opacity-50 outline-none">{saving && <Loader2 className="w-4 h-4 animate-spin" />}Save</button>
          <button onClick={() => { setEditing(false); setVal(budget != null ? String(budget) : ""); }} className="px-3.5 h-9 rounded-md border border-border text-[13px] font-medium hover:bg-muted outline-none">Cancel</button>
        </div>
      ) : budget == null ? (
        <p className="text-[13px] text-muted-foreground">No budget set. Set a monthly budget to track utilization against spend.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Media budget", value: money(budget), accent: "text-foreground" },
              { label: "Cost", value: money(spend), accent: "text-foreground" },
              { label: "Budget left", value: money(left), accent: left < 0 ? "text-destructive" : "text-foreground" },
              { label: "Utilization", value: util.toFixed(1) + "%", accent: util > 100 ? "text-destructive" : "text-foreground" },
            ].map((x) => (
              <div key={x.label} className="rounded-lg border border-border bg-card p-3">
                <p className={cn("text-lg font-bold tabular-nums", x.accent)}>{x.value}</p>
                <p className="text-[11.5px] text-muted-foreground mt-0.5">{x.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full rounded-full transition-all", util > 100 ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, util)}%` }} />
          </div>
        </>
      )}
    </div>
  );
}

// Per-campaign report: reuses the lead analytics + ad-performance scoped to this
// campaign to render the Heroleads-style campaign report (ad funnel, source
// performance table, and leads over time).
function OverviewTab({ id, name, budget, onBudget, notify }: { id: string; name: string; budget: number | null; onBudget: (v: number | null) => void; notify: (m: string, s?: "success" | "error") => void }) {
  const [row, setRow] = useState<CampaignAnalyticsRow | null>(null);
  const [perf, setPerf] = useState<AdPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  // Seed the range from the URL when present (the headless PDF route navigates
  // with ?preset/from/to so the exported report matches the on-screen range).
  const sp = useSearchParams();
  const [dateRange, setDateRange] = useState(() => sp.get("preset") || "30d");
  const [fFrom, setFFrom] = useState(() => sp.get("from") || presetRange(sp.get("preset") || "30d").from);
  const [fTo, setFTo] = useState(() => sp.get("to") || presetRange(sp.get("preset") || "30d").to);

  useEffect(() => {
    api.getCampaignAnalytics().then((rows) => setRow(rows.find((r) => r.id === id) ?? null)).catch(() => {});
  }, [id]);
  useEffect(() => {
    setLoading(true);
    const { from, to } = dateRange === "custom" ? { from: fFrom, to: fTo } : presetRange(dateRange);
    api.adPerformance(from || undefined, to || undefined, [id])
      .then((p) => setPerf(p as AdPerformance)).catch(() => setPerf(null)).finally(() => setLoading(false));
  }, [id, dateRange, fFrom, fTo]);

  const sources = useMemo(() => perf?.sources ?? [], [perf]);
  const tot = useMemo(() => sources.reduce((a, s) => ({
    spend: a.spend + s.spend, impressions: a.impressions + s.impressions,
    clicks: a.clicks + s.clicks, leads: a.leads + s.leads,
  }), { spend: 0, impressions: 0, clicks: 0, leads: 0 }), [sources]);
  const ctr = tot.impressions > 0 ? (tot.clicks / tot.impressions) * 100 : 0;
  const cpc = tot.clicks > 0 ? tot.spend / tot.clicks : 0;
  const cpl = tot.leads > 0 ? tot.spend / tot.leads : 0;
  const daily = useMemo(() => (perf?.daily ?? []).map((d) => ({ date: (d.date ?? "").slice(5), leads: d.leads })), [perf]);

  // Full raw analytics export: summary + per-source + daily timeline + age/gender/
  // region demographics, each as its own labelled block in one CSV.
  const exportCsv = () => {
    const rows: (string | number)[][] = [];
    const blank = () => rows.push([]);
    rows.push(["SUMMARY"]);
    rows.push(["Metric", "Value"]);
    rows.push(["Impressions", tot.impressions], ["Clicks", tot.clicks], ["CTR", ctr.toFixed(2) + "%"],
      ["Leads", tot.leads], ["Cost", Math.round(tot.spend)], ["CPC", tot.clicks > 0 ? Math.round(cpc) : 0],
      ["CPL", tot.leads > 0 ? Math.round(cpl) : 0]);
    blank();
    rows.push(["SOURCE PERFORMANCE"]);
    rows.push(["Source", "Cost", "Impressions", "Clicks", "CTR", "CPC", "Leads", "CPL"]);
    sources.forEach((s) => {
      const sCtr = s.impressions > 0 ? (s.clicks / s.impressions) * 100 : 0;
      const sCpc = s.clicks > 0 ? s.spend / s.clicks : 0;
      const sCpl = s.leads > 0 ? s.spend / s.leads : 0;
      rows.push([s.label, Math.round(s.spend), s.impressions, s.clicks, sCtr.toFixed(2) + "%", s.clicks > 0 ? Math.round(sCpc) : 0, s.leads, s.leads > 0 ? Math.round(sCpl) : 0]);
    });
    rows.push(["Grand total", Math.round(tot.spend), tot.impressions, tot.clicks, ctr.toFixed(2) + "%", tot.clicks > 0 ? Math.round(cpc) : 0, tot.leads, tot.leads > 0 ? Math.round(cpl) : 0]);
    blank();
    const dailyRaw = perf?.daily ?? [];
    if (dailyRaw.length) {
      rows.push(["DAILY PERFORMANCE"]);
      rows.push(["Date", "Impressions", "Reach", "Clicks", "Results", "Leads", "Spend"]);
      dailyRaw.forEach((d) => rows.push([d.date, d.impressions, d.reach, d.clicks, d.results, d.leads, Math.round(d.spend || 0)]));
      blank();
    }
    const dem = (title: string, arr?: AdBreakdown[]) => {
      if (!arr?.length) return;
      rows.push([title]);
      rows.push(["Value", "Impressions", "Reach", "Clicks", "Results", "Spend"]);
      arr.forEach((b) => rows.push([b.value, b.impressions, b.reach, b.clicks, b.results, Math.round(b.spend || 0)]));
      blank();
    };
    dem("AGE BREAKDOWN", perf?.age);
    dem("GENDER BREAKDOWN", perf?.gender);
    dem("REGION BREAKDOWN", perf?.region);
    downloadCsv(`campaign-report-${dateRange}.csv`, toCsv(rows));
  };
  // One-click PDF via the server-side headless-Chromium route, which renders the
  // real report page (same @media print CSS) for a pixel-exact document. Falls
  // back to the browser print dialog if the headless route is unavailable.
  const exportPdf = async () => {
    const { from, to } = dateRange === "custom" ? { from: fFrom, to: fTo } : presetRange(dateRange);
    try {
      const res = await fetch(`/api/campaigns/${id}/report-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: getToken(), user: getUser(), tab: "overview", preset: dateRange, from, to }),
      });
      const blob = await res.blob();
      if (!res.ok || blob.type !== "application/pdf") throw new Error("headless unavailable");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `campaign-report-${dateRange}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.print(); // print CSS renders the same report-only layout
    }
  };

  const rng = dateRange === "custom" ? { from: fFrom, to: fTo } : presetRange(dateRange);
  const rangeLabel = rng.from && rng.to ? `${rng.from} to ${rng.to}` : "All time";

  return (
    <div className="flex flex-col gap-5">
      <div className="no-print flex items-center justify-between flex-wrap gap-2">
        <p className="text-[13px] font-semibold text-foreground">Campaign report</p>
        <div className="flex items-center gap-2">
          <div className="no-print relative">
            <button onClick={() => setExportOpen((o) => !o)} disabled={sources.length === 0}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-background text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-50 outline-none transition-colors">
              <Download className="w-4 h-4" /> Export <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border rounded-lg shadow-xl z-50 py-1 animate-scale-in origin-top-right">
                  <button onClick={() => { setExportOpen(false); exportPdf(); }} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-muted outline-none"><FileText className="w-4 h-4 text-muted-foreground" /> PDF</button>
                  <button onClick={() => { setExportOpen(false); exportCsv(); }} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-muted outline-none"><FileSpreadsheet className="w-4 h-4 text-muted-foreground" /> CSV</button>
                </div>
              </>
            )}
          </div>
          <DateRangeFilter value={{ preset: dateRange, from: fFrom, to: fTo }} align="right"
            onChange={(v) => { setDateRange(v.preset); setFFrom(v.from); setFTo(v.to); }} />
        </div>
      </div>

      {/* Heroleads-style report banner (this drives the PDF header) */}
      <div className="rounded-xl bg-neutral-900 text-white px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[16px] font-extrabold tracking-wide uppercase leading-tight">Campaign Dashboard</p>
          <p className="text-[12.5px] text-white/70 truncate">{name}</p>
        </div>
        <p className="text-[11px] text-white/70 whitespace-nowrap">{rangeLabel}</p>
      </div>

      {/* Conversion funnel (left) + campaign performance table (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[210px_1fr] gap-4 items-start">
        <div className="print-avoid-break rounded-xl border border-border bg-card p-4 flex flex-col items-center gap-1.5">
          {[
            { label: "Impressions", value: num(tot.impressions), w: 100, c: "#F97316" },
            { label: "Clicks", value: num(tot.clicks), w: 80, c: "#F97316" },
            { label: "CTR %", value: pctFmt(ctr), w: 60, c: "#EA580C" },
            { label: "Leads", value: num(tot.leads), w: 44, c: "#DC2626" },
          ].map((f) => (
            <div key={f.label} style={{ width: `${f.w}%`, backgroundColor: f.c }}
              className="rounded-md py-2.5 px-2 text-center text-white shadow-sm">
              <p className="text-[9.5px] font-semibold uppercase tracking-wide opacity-90">{f.label}</p>
              <p className="text-[17px] font-extrabold tabular-nums leading-tight">{f.value}</p>
            </div>
          ))}
        </div>

        <div className="print-avoid-break rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/40"><p className="text-[13px] font-semibold text-foreground">Campaign performance</p></div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] whitespace-nowrap">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-muted-foreground text-[11px] uppercase tracking-wider">
                {["Source", "Cost", "Impressions", "Clicks", "CTR", "CPC", "Leads", "CPL"].map((h, i) => (
                  <th key={h} className={cn("px-3 py-2 font-bold", i === 0 ? "text-left" : "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
              ) : sources.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No ad data in this range</td></tr>
              ) : sources.map((s) => {
                const sCtr = s.impressions > 0 ? (s.clicks / s.impressions) * 100 : 0;
                const sCpc = s.clicks > 0 ? s.spend / s.clicks : 0;
                const sCpl = s.leads > 0 ? s.spend / s.leads : 0;
                return (
                  <tr key={s.source} className="border-b border-border/60">
                    <td className="px-3 py-2 font-medium text-foreground">{s.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(s.spend)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(s.impressions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(s.clicks)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pctFmt(sCtr)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.clicks > 0 ? money(sCpc) : "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary">{num(s.leads)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.leads > 0 ? money(sCpl) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
            {!loading && sources.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border font-bold bg-muted/40">
                  <td className="px-3 py-2">Grand total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(tot.spend)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(tot.impressions)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(tot.clicks)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pctFmt(ctr)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{tot.clicks > 0 ? money(cpc) : "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-primary">{num(tot.leads)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{tot.leads > 0 ? money(cpl) : "-"}</td>
                </tr>
              </tfoot>
            )}
          </table>
          </div>
        </div>
      </div>

      {/* Lead KPIs */}
      {row && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Replied" value={row.replied} />
          <Stat label="Avg 1st response" value={row.avg_rt_min > 0 ? fmtDuration(row.avg_rt_min) : "-"} />
          <Stat label="Within 5 min" value={`${Math.round(row.within_5_pct)}%`} />
          <Stat label="Qualified" value={row.qualified} />
        </div>
      )}

      {/* Budget utilization */}
      <BudgetPanel id={id} budget={budget} spend={tot.spend} onBudget={onBudget} notify={notify} />

      {/* Leads over time (single series — keep one axis) */}
      {daily.length > 0 && (
        <div className="rounded-xl border border-border p-4">
          <p className="text-[13px] font-semibold text-foreground mb-3">Leads over time</p>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="leadFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2D8B73" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#2D8B73" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                <RTooltip />
                <Area type="monotone" dataKey="leads" stroke="#2D8B73" strokeWidth={2} fill="url(#leadFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Demographics */}
      {((perf?.age?.length ?? 0) > 0 || (perf?.gender?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Donut title="Age" data={perf?.age} />
          <Donut title="Gender" data={perf?.gender} />
        </div>
      )}

      {/* Location */}
      <LocationPanel data={perf?.region} />

      {/* GA4 landing-page performance */}
      <Ga4Panel campaignId={id}
        from={dateRange === "custom" ? fFrom : presetRange(dateRange).from}
        to={dateRange === "custom" ? fTo : presetRange(dateRange).to} />
    </div>
  );
}

function CreditsTab({ id, notify }: { id: string; notify: (m: string, s?: "success" | "error") => void }) {
  const [credits, setCredits] = useState<{ allocated_credits: number; used_credits: number; remaining_credits: number; low_balance_threshold: number } | null>(null);
  const [usage, setUsage] = useState<{ day: string; credits: number }[]>([]);
  const [alloc, setAlloc] = useState("");
  const [threshold, setThreshold] = useState("");
  const [saving, setSaving] = useState(false);
  function load() {
    api.getCampaignCredits(id).then((c) => { setCredits(c); setAlloc(String(c.allocated_credits)); setThreshold(String(c.low_balance_threshold)); }).catch(() => {});
    api.getCampaignUsage(id).then(setUsage).catch(() => {});
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    setSaving(true);
    try {
      await api.allocateCampaignCredits(id, { allocated_credits: Number(alloc) || 0, low_balance_threshold: Number(threshold) || 0 });
      notify("Credits updated"); load();
    } catch (e) { notify(String(e), "error"); } finally { setSaving(false); }
  }
  if (!credits) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
  const allocChangedCount = (Number(alloc) !== credits.allocated_credits ? 1 : 0) + (Number(threshold) !== credits.low_balance_threshold ? 1 : 0);
  const resetAlloc = () => { setAlloc(String(credits.allocated_credits)); setThreshold(String(credits.low_balance_threshold)); };
  const low = credits.allocated_credits > 0 && credits.remaining_credits <= credits.low_balance_threshold;
  const maxUsage = Math.max(1, ...usage.map((u) => u.credits));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Allocated" value={credits.allocated_credits} />
        <Stat label="Used" value={credits.used_credits} />
        <Stat label="Remaining" value={credits.remaining_credits} accent={low ? "text-amber-600" : undefined} />
      </div>
      {low && <p className="text-[13px] text-amber-600 font-medium">Low balance. Top up before the AI stands down on this campaign.</p>}
      {credits.allocated_credits === 0 && <p className="text-[13px] text-muted-foreground">No allocation set: AI replies aren&apos;t capped. Set a cap below to meter this campaign.</p>}

      <div className="rounded-lg border border-border p-4 space-y-3">
        <p className="text-[13px] font-semibold text-foreground">Allocation</p>
        <div className="grid grid-cols-2 gap-3">
          <div><FieldLabel>Allocated credits</FieldLabel><input type="number" min={0} value={alloc} onChange={(e) => setAlloc(e.target.value)} className={INPUT_CLASS} /></div>
          <div><FieldLabel>Low-balance alert at</FieldLabel><input type="number" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} className={INPUT_CLASS} /></div>
        </div>
      </div>
      <UnsavedBar count={allocChangedCount} saving={saving} onSave={save} onCancel={resetAlloc} saveLabel="Save allocation" />

      <div className="rounded-lg border border-border p-4">
        <p className="text-[13px] font-semibold text-foreground mb-3">Usage (last 30 days)</p>
        {usage.length === 0 ? <p className="text-[13px] text-muted-foreground">No AI replies yet.</p> : (
          <div className="flex items-end gap-1 h-24">
            {usage.map((u) => (
              <div key={u.day} className="flex-1 min-w-[3px] rounded-t bg-primary/70" style={{ height: `${Math.max(4, (u.credits / maxUsage) * 100)}%` }} title={`${u.day}: ${u.credits}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      className={cn("relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors outline-none", on ? "bg-primary" : "bg-muted")}>
      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5", on ? "translate-x-[18px] ml-0.5" : "translate-x-0.5")} />
    </button>
  );
}

function AITab({ campaign, onSaved, onError }: { campaign: CampaignDetail; onSaved: (c: CampaignDetail) => void; onError: (m: string) => void }) {
  const init = {
    segment: campaign.segment ?? "", brand: campaign.brand ?? "",
    autoReply: campaign.ai_auto_reply ?? false, lang: campaign.ai_language ?? "id",
    dynLang: campaign.ai_dynamic_language ?? true, smartSummary: campaign.ai_smart_summary ?? true,
  };
  const [segment, setSegment] = useState(init.segment);
  const [brand, setBrand] = useState(init.brand);
  const [autoReply, setAutoReply] = useState(init.autoReply);
  const [lang, setLang] = useState(init.lang);
  const [dynLang, setDynLang] = useState(init.dynLang);
  const [smartSummary, setSmartSummary] = useState(init.smartSummary);
  const [saving, setSaving] = useState(false);

  const changedCount = [segment !== init.segment, brand.trim() !== init.brand, autoReply !== init.autoReply, lang !== init.lang, dynLang !== init.dynLang, smartSummary !== init.smartSummary].filter(Boolean).length;
  function reset() { setSegment(init.segment); setBrand(init.brand); setAutoReply(init.autoReply); setLang(init.lang); setDynLang(init.dynLang); setSmartSummary(init.smartSummary); }

  async function save() {
    setSaving(true);
    try {
      await api.updateCampaign(campaign.id, { segment, brand: brand.trim(), ai_auto_reply: autoReply, ai_language: lang, ai_dynamic_language: dynLang, ai_smart_summary: smartSummary });
      onSaved({ ...campaign, segment, brand: brand.trim(), ai_auto_reply: autoReply, ai_language: lang, ai_dynamic_language: dynLang, ai_smart_summary: smartSummary });
    } catch (e) { onError(String(e)); } finally { setSaving(false); }
  }
  return (
    <div className="space-y-4 max-w-[560px]">
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <p className="text-[13.5px] font-semibold text-foreground">Auto-reply</p>
        <Toggle on={autoReply} onToggle={() => setAutoReply((v) => !v)} />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <p className="text-[13.5px] font-semibold text-foreground">Smart Summary</p>
        <Toggle on={smartSummary} onToggle={() => setSmartSummary((v) => !v)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel>Segment</FieldLabel>
          <Select value={segment} onChange={setSegment} placeholder="Not set" searchable
            options={[{ value: "", label: "Not set" }, ...SEGMENTS.map((s) => ({ value: s, label: s }))]} /></div>
        <div><FieldLabel>Brand</FieldLabel><input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Mitsubishi XFORCE" className={INPUT_CLASS} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel>Reply language</FieldLabel>
          <Select value={lang} onChange={setLang} searchable={false} options={[{ value: "id", label: "Indonesian" }, { value: "en", label: "English" }]} /></div>
        <div className="flex items-end">
          <div className="flex items-center justify-between gap-3 w-full rounded-lg border border-border p-3">
            <p className="text-[13px] font-medium text-foreground">Match contact&apos;s language</p>
            <Toggle on={dynLang} onToggle={() => setDynLang((v) => !v)} />
          </div>
        </div>
      </div>
      <UnsavedBar count={changedCount} saving={saving} onSave={save} onCancel={reset} saveLabel="Save AI settings" />
    </div>
  );
}

// ── Catalog & Pricing (WS-A) ────────────────────────────────────────────────
// Per-campaign pricelist the Simpuler bot grounds pricing answers on. Upload a
// CSV; recognized columns map to the spine (item/variant/location/price), the
// rest land in each row's attributes. A new upload replaces the campaign's rows.
type CatalogRowInput = { item_name: string; variant_name?: string; location_name?: string; category_type?: string; headline_price?: number | null; attributes?: Record<string, unknown> };

function CatalogTab({ id, segment, notify }: { id: string; segment?: string; notify: (m: string, s?: "success" | "error") => void }) {
  const [rows, setRows] = useState<CatalogItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirm, ConfirmHost } = useConfirm();

  function load() { api.getCampaignCatalog(id).then(setRows).catch(() => setRows([])); }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const lower = file.name.toLowerCase();
      const isPdf = file.type === "application/pdf" || lower.endsWith(".pdf");
      const isExcel = lower.endsWith(".xlsx") || lower.endsWith(".xls") || file.type.includes("spreadsheet") || file.type.includes("excel");
      let parsed: CatalogRowInput[];
      if (isPdf) {
        notify("Extracting from PDF, this can take up to a minute...", "success");
        const res = await api.extractCatalogPdf(id, { pdf_base64: fileToBase64(await file.arrayBuffer()), segment });
        if (res.error) { notify(`Extraction failed: ${res.error}`, "error"); return; }
        if (res.warning === "scanned") { notify("This looks like a scanned PDF (no readable text). Use a text PDF, or upload a CSV/Excel.", "error"); return; }
        if (res.warning === "no_llm") { notify("PDF extraction is not enabled on the server. Upload a CSV or Excel file instead.", "error"); return; }
        if (res.warning === "parse_failed") { notify("Could not read this PDF automatically. Try a cleaner text PDF, or upload a CSV/Excel.", "error"); return; }
        parsed = res.rows || [];
        if (parsed.length === 0) { notify("No pricing rows were found in this PDF. Try a CSV/Excel export instead.", "error"); return; }
      } else if (isExcel) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        parsed = parseCatalogRows(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as (string | number | null)[][]);
      } else {
        parsed = parseCatalogCsv(await file.text());
      }
      if (parsed.length === 0) { notify("No rows found. Make sure the first row is a header (e.g. item_name, price).", "error"); return; }
      const month = new Date().toISOString().slice(0, 7);
      const res = await api.uploadCampaignCatalog(id, { replace: true, segment, source_ref: file.name, effective_month: month, rows: parsed });
      notify(`Imported ${res.inserted} item${res.inserted === 1 ? "" : "s"}${isPdf ? " from PDF" : ""}`);
      load();
    } catch (err) { notify(String(err), "error"); } finally { setBusy(false); }
  }

  async function clearAll() {
    if (!(await confirm({ title: "Clear catalog?", message: "Remove all catalog rows for this campaign? The bot will fall back to the shared pricing table.", danger: true, confirmLabel: "Clear" }))) return;
    setBusy(true);
    try { await api.clearCampaignCatalog(id); notify("Catalog cleared"); load(); }
    catch (e) { notify(String(e), "error"); } finally { setBusy(false); }
  }

  if (rows === null) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
  const fmtPrice = (v: number | null) => v == null ? "" : "Rp " + Math.round(v).toLocaleString("id-ID");

  return (
    <div className="space-y-5">
      {ConfirmHost}
      <div className="rounded-lg border border-dashed border-border p-5 text-center">
        <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary grid place-items-center mx-auto mb-3"><Upload className="w-5 h-5" /></div>
        <p className="text-[13.5px] font-semibold text-foreground mb-3">Upload a pricelist (CSV, Excel, or PDF)</p>
        <input ref={fileRef} type="file" accept=".csv,text/csv,.pdf,application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={onFile} />
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          className="inline-flex items-center gap-2 px-3.5 h-9 mt-3 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm transition-all outline-none disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Choose file
        </button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground"><span className="font-semibold text-foreground tabular-nums">{rows.length}</span> item{rows.length === 1 ? "" : "s"} in this campaign&apos;s catalog</p>
        {rows.length > 0 && (
          <button onClick={clearAll} disabled={busy} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-red-500 hover:text-red-600 outline-none disabled:opacity-50">
            <Trash2 className="w-4 h-4" />Clear all
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm min-w-[640px] whitespace-nowrap">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr className="border-b border-border">
                  {["Item", "Variant", "Location", "Price", "Attributes"].map((h) => (
                    <th key={h} className={cn("px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground", h === "Price" ? "text-right" : "text-left")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="px-3 py-2 text-[13px] font-medium text-foreground">{r.item_name}</td>
                    <td className="px-3 py-2 text-[12.5px] text-muted-foreground">{r.variant_name || ""}</td>
                    <td className="px-3 py-2 text-[12.5px] text-muted-foreground">{r.location_name || ""}</td>
                    <td className="px-3 py-2 text-[12.5px] text-foreground text-right tabular-nums">{fmtPrice(r.headline_price)}</td>
                    <td className="px-3 py-2 text-[11.5px] text-muted-foreground max-w-[280px] truncate">{Object.entries(r.attributes || {}).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join("  •  ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 200 && <p className="px-3 py-2 text-[11.5px] text-muted-foreground border-t border-border">Showing first 200 of {rows.length}.</p>}
        </div>
      )}
    </div>
  );
}

// ArrayBuffer -> base64, chunked to avoid call-stack limits on large PDFs.
function fileToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Minimal CSV -> rows (handles quoted fields, escaped quotes, CRLF).
function csvToRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c === "\r") { /* skip */ }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// Map a header+rows grid to catalog rows: known headers -> spine, the rest ->
// attributes. Shared by CSV and Excel (both feed a string[][] with a header row).
function parseCatalogRows(grid: (string | number | null | undefined)[][]): CatalogRowInput[] {
  const raw = grid.filter((r) => r.some((c) => c != null && String(c).trim()));
  if (raw.length < 2) return [];
  const header = raw[0].map((h) => String(h ?? "").trim().toLowerCase());
  const idx = (names: string[]) => { for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; } return -1; };
  const iItem = idx(["item_name", "name", "product", "product_name"]);
  const iBrand = idx(["brand_name", "brand", "merk"]);
  const iModel = idx(["model_name", "model", "type", "tipe"]);
  const iVariant = idx(["variant_name", "variant", "varian", "trim"]);
  const iLoc = idx(["location_name", "city_name", "city", "kota", "location", "area"]);
  const iCat = idx(["category_type", "category", "kategori"]);
  const iPrice = idx(["headline_price", "otr_price", "price", "harga", "list_price"]);
  const known = new Set([iItem, iBrand, iModel, iVariant, iLoc, iCat, iPrice].filter((i) => i >= 0));
  const out: CatalogRowInput[] = [];
  for (let r = 1; r < raw.length; r++) {
    const cells = raw[r];
    const get = (i: number) => (i >= 0 ? String(cells[i] ?? "").trim() : "");
    let item = get(iItem);
    if (!item) item = [get(iBrand), get(iModel)].filter(Boolean).join(" ");
    if (!item) continue;
    const priceDigits = get(iPrice).replace(/\D/g, "");
    const attributes: Record<string, unknown> = {};
    header.forEach((h, i) => { if (h && !known.has(i)) { const v = get(i); if (v) attributes[h] = v; } });
    out.push({
      item_name: item,
      variant_name: get(iVariant) || undefined,
      location_name: get(iLoc) || undefined,
      category_type: get(iCat) || undefined,
      headline_price: priceDigits ? Number(priceDigits) : null,
      attributes,
    });
  }
  return out;
}

function parseCatalogCsv(text: string): CatalogRowInput[] { return parseCatalogRows(csvToRows(text)); }
