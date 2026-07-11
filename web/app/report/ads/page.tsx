"use client";
// Dedicated, print-only Ads Report template (decoupled from the on-theme dashboard).
// The headless PDF route (/report/ads/pdf) seeds the session token into
// localStorage, navigates here with ?preset/from/to/campaigns, waits for
// [data-report-ready], isolates .print-root and prints. Layout matches the
// Heroleads "Campaign Dashboard" reference. See memory ads-report-pdf-template.
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { api } from "@/lib/api";
import { presetRange } from "@/components/DateRangeFilter";
import { IndonesiaMap } from "@/components/IndonesiaMap";
import type { AdPerformance, AdKeyword, Conversation, AdBreakdown, Ga4Report, Campaign } from "@/lib/types";

const num = (n: number) => Math.round(n || 0).toLocaleString("en-US");
const money = (n: number) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const pct = (n: number) => (n || 0).toFixed(2) + "%";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}` : iso; };
const fmtSec = (s: number) => { const m = Math.floor((s || 0) / 60); const sec = Math.round((s || 0) % 60); return `${m}:${String(sec).padStart(2, "0")}`; };

// Heatmap tint for a table cell: 0 (bad) -> red-ish, 1 (good) -> green.
function heat(v: number, min: number, max: number, invert = false) {
  if (max <= min) return undefined;
  let t = (v - min) / (max - min);
  if (invert) t = 1 - t;
  const hue = 8 + t * 122; // red(8) -> green(130)
  return `hsl(${hue} 72% 90%)`;
}

function AdsReportPrint() {
  const sp = useSearchParams();
  const preset = sp.get("preset") || "30d";
  const rng = preset === "custom" ? { from: sp.get("from") || "", to: sp.get("to") || "" } : presetRange(preset);
  const from = rng.from, to = rng.to;
  const campaigns = (sp.get("campaigns") || "").split(",").filter(Boolean);

  const [perf, setPerf] = useState<AdPerformance | null>(null);
  const [keywords, setKeywords] = useState<AdKeyword[]>([]);
  const [leads, setLeads] = useState<Conversation[]>([]);
  const [ga4, setGa4] = useState<Ga4Report | null>(null);
  const [camps, setCamps] = useState<Campaign[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([
      api.adPerformance(from || undefined, to || undefined, campaigns.length ? campaigns : undefined).catch(() => null),
      api.adKeywords(from || undefined, to || undefined).catch(() => []),
      api.listConversations("", from || "", to || "", "", "").catch(() => []),
      api.getOrgGa4(from || undefined, to || undefined).catch(() => null),
      api.listCampaigns().catch(() => []),
    ]).then(([p, k, l, g, c]) => {
      setPerf(p as AdPerformance | null); setKeywords((k as AdKeyword[]) || []); setLeads((l as Conversation[]) || []);
      setGa4(g as Ga4Report | null); setCamps((c as Campaign[]) || []);
      // Two frames so recharts has laid out before the headless snapshot.
      requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sources = useMemo(() => perf?.sources ?? [], [perf]);
  const tot = useMemo(() => sources.reduce((a, s) => ({
    spend: a.spend + s.spend, impressions: a.impressions + s.impressions, clicks: a.clicks + s.clicks, leads: a.leads + s.leads,
  }), { spend: 0, impressions: 0, clicks: 0, leads: 0 }), [sources]);
  const ctr = tot.impressions > 0 ? (tot.clicks / tot.impressions) * 100 : 0;
  const cpc = tot.clicks > 0 ? tot.spend / tot.clicks : 0;
  const cpl = tot.leads > 0 ? tot.spend / tot.leads : 0;
  const rangeLabel = from && to ? `${from} to ${to}` : "All time";

  const dailyPerf = (perf?.daily ?? []).map((d) => ({
    date: fmtDay(d.date), impressions: d.impressions > 0 ? d.impressions : null, clicks: d.clicks > 0 ? d.clicks : null, spend: Math.round(d.spend || 0),
  }));
  const kw = keywords.slice(0, 10);
  const kwMax = Math.max(1, ...kw.map((k) => k.impressions));
  const logW = (v: number) => Math.max(2, (Math.log10((v || 0) + 1) / Math.log10(kwMax + 1)) * 100);

  // Heatmap ranges for the campaign-performance table.
  const leadVals = sources.map((s) => s.leads);
  const lMin = Math.min(0, ...leadVals), lMax = Math.max(1, ...leadVals);

  // Funnel segments as stacked trapezoids (top width tapers to bottom width) so the
  // shape reads as a real funnel, matching the Heroleads reference.
  const funnel = [
    { label: "IMPRESSIONS", value: num(tot.impressions), top: 100, bot: 84, c: "#16233A" },
    { label: "CLICKS", value: num(tot.clicks), top: 84, bot: 66, c: "#FF5A1F" },
    { label: "CTR%", value: pct(ctr), top: 66, bot: 48, c: "#FF2D78" },
    { label: "LEADS", value: num(tot.leads), top: 48, bot: 32, c: "#2D6CFF" },
  ];

  const dem = (arr?: AdBreakdown[]) => (arr || []).filter((b) => (b.value || "").toLowerCase() !== "unknown");
  const age = dem(perf?.age), gender = dem(perf?.gender);
  const demMax = (arr: AdBreakdown[]) => Math.max(1, ...arr.map((b) => b.impressions));

  const dailyLeads = (perf?.daily ?? []).map((d) => ({ date: fmtDay(d.date), leads: d.leads }));
  const region = dem(perf?.region);
  // Heroleads maps "Ad spend by province" -> prefer spend; fall back to reach if a
  // source doesn't split spend regionally.
  const regionBySpend = region.some((b) => b.spend > 0);
  const mapPoints = region.map((b) => ({ name: b.value, value: regionBySpend ? b.spend : b.impressions }));
  // Budget = sum of the (selected) campaigns' monthly budgets vs actual spend.
  const selectedCamps = camps.filter((c) => campaigns.length === 0 || campaigns.includes(c.id));
  const headerSub = selectedCamps.length === 1 ? selectedCamps[0].name : "Ads Performance Report";
  const budget = selectedCamps.reduce((a, c) => a + ((c as { monthly_budget?: number | null }).monthly_budget || 0), 0);
  const budgetLeft = budget - tot.spend;
  const util = budget > 0 ? (tot.spend / budget) * 100 : 0;
  const gt = ga4?.totals;

  return (
    <div className="print-root" data-report-ready={ready ? "1" : "0"}
      style={{ width: 980, margin: "0 auto", background: "#fff", color: "#0f172a", fontFamily: "Inter, Arial, sans-serif", padding: 0 }}>
      {/* Header: logo left, title centered, date range right (Heroleads layout) */}
      <div style={{ background: "#0b0f17", color: "#fff", padding: "14px 22px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", borderRadius: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/simpulx_logo.png" alt="Simpulx" style={{ height: 30, width: "auto", display: "block" }} />
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.3 }}>Simpulx</span>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: 1.5 }}>CAMPAIGN DASHBOARD</div>
          <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.7)", letterSpacing: 0.3 }}>{headerSub}</div>
        </div>
        <div style={{ justifySelf: "end", fontSize: 12, border: "1px solid rgba(255,255,255,.25)", padding: "5px 12px", borderRadius: 6, whiteSpace: "nowrap" }}>{rangeLabel}</div>
      </div>

      {/* Funnel + Campaign performance table */}
      <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", gap: 16, marginTop: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 0 }}>
          {funnel.map((f) => {
            const tl = (100 - f.top) / 2, tr = (100 + f.top) / 2, bl = (100 - f.bot) / 2, br = (100 + f.bot) / 2;
            return (
              <div key={f.label} style={{ width: "100%", height: 82, background: f.c, color: "#fff",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                clipPath: `polygon(${tl}% 0, ${tr}% 0, ${br}% 100%, ${bl}% 100%)` }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.9, letterSpacing: 0.6 }}>{f.label}</div>
                <div style={{ fontSize: 25, fontWeight: 800, lineHeight: 1.05 }}>{f.value}</div>
              </div>
            );
          })}
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "9px 14px", background: "#f8fafc", fontSize: 13, fontWeight: 700, borderBottom: "1px solid #e5e7eb" }}>Campaign Performance</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#DC2626", color: "#fff" }}>
                {["SOURCE", "COST", "IMPRESSIONS", "CLICKS", "CTR", "CPC", "LEADS", "CPL"].map((h, i) => (
                  <th key={h} style={{ padding: "7px 10px", textAlign: i === 0 ? "left" : "right", fontWeight: 700, fontSize: 10.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => {
                const sCtr = s.impressions > 0 ? (s.clicks / s.impressions) * 100 : 0;
                const sCpc = s.clicks > 0 ? s.spend / s.clicks : 0;
                const sCpl = s.leads > 0 ? s.spend / s.leads : 0;
                return (
                  <tr key={s.source} style={{ borderBottom: "1px solid #eef2f7" }}>
                    <td style={{ padding: "7px 10px", fontWeight: 600 }}>{s.label}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}>{money(s.spend)}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}>{num(s.impressions)}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}>{num(s.clicks)}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}>{pct(sCtr)}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}>{s.clicks > 0 ? money(sCpc) : "-"}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700, background: heat(s.leads, lMin, lMax) }}>{num(s.leads)}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", background: s.leads > 0 ? heat(sCpl, 0, Math.max(1, ...sources.map((x) => x.leads > 0 ? x.spend / x.leads : 0)), true) : undefined }}>{s.leads > 0 ? money(sCpl) : "-"}</td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: "2px solid #cbd5e1", fontWeight: 700, background: "#f8fafc" }}>
                <td style={{ padding: "7px 10px" }}>Grand total</td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}>{money(tot.spend)}</td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}>{num(tot.impressions)}</td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}>{num(tot.clicks)}</td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}>{pct(ctr)}</td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}>{tot.clicks > 0 ? money(cpc) : "-"}</td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}>{num(tot.leads)}</td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}>{tot.leads > 0 ? money(cpl) : "-"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Campaign Performance Breakdown (log) */}
      <Section title="Campaign Performance Breakdown" legend={[["#FF5A1F", "Clicks"], ["#0b0f17", "Impressions"]]}>
        <div style={{ height: 210 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyPerf} margin={{ top: 6, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis scale="log" domain={[1, "auto"]} allowDataOverflow tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={44}
                tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
              <Line type="monotone" dataKey="impressions" stroke="#0b0f17" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="clicks" stroke="#FF5A1F" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* Google top keywords + Age demography */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        {kw.length > 0 && (
          <Section title="Google Top 10 Search Keywords" legend={[["#FF5A1F", "Clicks"], ["#0b0f17", "Impressions"]]}>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {kw.map((k, i) => (
                <div key={k.keyword + i} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={k.keyword}>{k.keyword}</span>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ height: 9, borderRadius: 2, background: "#FF5A1F", width: `${logW(k.clicks)}%` }} /><span style={{ fontSize: 9, color: "#64748b" }}>{num(k.clicks)}</span></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}><div style={{ height: 9, borderRadius: 2, background: "#0b0f17", width: `${logW(k.impressions)}%` }} /><span style={{ fontSize: 9, color: "#64748b" }}>{num(k.impressions)}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
        {age.length > 0 && (
          <Section title="Age Demography" legend={[["#0b0f17", "Impressions"], ["#FF5A1F", "Clicks"]]}>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {age.map((b) => (
                <div key={b.value} style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 10 }}>{b.value}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ height: 12, borderRadius: 2, background: "#0b0f17", width: `${(b.impressions / demMax(age)) * 100}%` }} /><span style={{ fontSize: 9, color: "#64748b" }}>{num(b.impressions)}</span></div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* Gender demography + Monthly leads breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: gender.length > 0 ? "300px 1fr" : "1fr", gap: 16, marginTop: 16 }}>
        {gender.length > 0 && (
          <Section title="Gender Demography">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {gender.map((b) => {
                const total = gender.reduce((a, x) => a + x.impressions, 0) || 1;
                return (
                  <div key={b.value}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                      <span style={{ textTransform: "capitalize" }}>{b.value}</span>
                      <span style={{ color: "#64748b" }}>{((b.impressions / total) * 100).toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: "#eef2f7", overflow: "hidden" }}>
                      <div style={{ height: "100%", background: b.value.toLowerCase() === "female" ? "#FF2D78" : "#2D6CFF", width: `${(b.impressions / total) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}
        {dailyLeads.length > 0 && (
          <Section title="Monthly Leads Performance Breakdown">
            <div style={{ height: 190 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyLeads} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2D8B73" stopOpacity={0.3} /><stop offset="100%" stopColor="#2D8B73" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={34} allowDecimals={false} />
                  <Area type="monotone" dataKey="leads" stroke="#2D8B73" strokeWidth={2} fill="url(#lg)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Section>
        )}
      </div>

      {/* Latest leads */}
      {leads.length > 0 && (
        <Section title="Latest Leads">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead>
              <tr style={{ background: "#DC2626", color: "#fff" }}>
                {["DATE", "NAME", "PHONE", "SOURCE", "STATUS"].map((h) => (<th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700 }}>{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {leads.slice(0, 10).map((l) => (
                <tr key={l.id} style={{ borderBottom: "1px solid #eef2f7" }}>
                  <td style={{ padding: "6px 10px", color: "#64748b" }}>{l.last_message_at ? new Date(l.last_message_at).toLocaleString("en-GB") : "-"}</td>
                  <td style={{ padding: "6px 10px", fontWeight: 600 }}>{l.contact_name || "Unknown"}</td>
                  <td style={{ padding: "6px 10px", color: "#64748b" }}>{l.contact_phone || "-"}</td>
                  <td style={{ padding: "6px 10px", color: "#64748b", textTransform: "capitalize" }}>{l.channel || "-"}</td>
                  <td style={{ padding: "6px 10px" }}>{l.stage_name || l.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Monthly spending */}
      {dailyPerf.length > 0 && (
        <Section title="Monthly Spending Performance" legend={[["#FF5A1F", "Cost"]]}>
          <div style={{ height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyPerf} margin={{ top: 6, right: 8, left: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={52}
                  tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                <Bar dataKey="spend" fill="#FF5A1F" radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}

      {/* Budget utilization cards */}
      {budget > 0 && (
        <div className="print-avoid-break" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginTop: 16 }}>
          {[
            { label: "Media Budget", value: money(budget), accent: false },
            { label: "Cost", value: money(tot.spend), accent: true },
            { label: "Budget Left", value: money(budgetLeft), c: budgetLeft < 0 ? "#DC2626" : "#0f172a" },
            { label: "Budget Utilization", value: util.toFixed(2) + "%", accent: true, c: util > 100 ? "#DC2626" : "#fff" },
          ].map((b) => (
            <div key={b.label} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px", background: b.accent ? "#FF5A1F" : "#fff", color: b.accent ? "#fff" : (b.c || "#0f172a") }}>
              <div style={{ fontSize: 11, opacity: b.accent ? 0.9 : 0.7 }}>{b.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: b.accent ? (b.c || "#fff") : (b.c || "#0f172a") }}>{b.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Landing Page Performance (GA4) */}
      {ga4?.connected && gt && (
        <Section title="Landing Page Performance">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 12 }}>
            {([["Total users", num(gt.total_users)], ["Active users", num(gt.active_users)], ["New users", num(gt.new_users)], ["Sessions", num(gt.sessions)],
              ["Engaged sessions", num(gt.engaged_sessions)], ["Engagement rate", (gt.engagement_rate * 100).toFixed(1) + "%"], ["Avg engagement", fmtSec(gt.avg_engagement_sec)], ["Views", num(gt.views)]] as [string, string][]).map(([l, v]) => (
              <div key={l} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{v}</div>
                <div style={{ fontSize: 10, color: "#64748b" }}>{l}</div>
              </div>
            ))}
          </div>
          {ga4.rows.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb", color: "#64748b" }}>
                  {["Landing page", "Views", "Sessions", "New users", "Engagement"].map((h, i) => (<th key={h} style={{ padding: "5px 8px", textAlign: i === 0 ? "left" : "right", fontSize: 9.5, fontWeight: 700 }}>{h}</th>))}
                </tr>
              </thead>
              <tbody>
                {ga4.rows.slice(0, 8).map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "5px 8px", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.landing_page || "(not set)"}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{num(r.views)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{num(r.sessions)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{num(r.new_users)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{(r.engagement_rate * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}

      {/* Top locations (province reach) */}
      {mapPoints.length > 0 && (
        <Section title="Top Locations (reach)">
          <div style={{ height: 300 }}>
            <IndonesiaMap points={mapPoints} isMoney={false} money={num} />
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, legend, children }: { title: string; legend?: [string, string][]; children: React.ReactNode }) {
  return (
    <div className="print-avoid-break" style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
        {legend && (
          <div style={{ display: "flex", gap: 12 }}>
            {legend.map(([c, l]) => (<span key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#64748b" }}><span style={{ width: 10, height: 10, borderRadius: 2, background: c }} />{l}</span>))}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export default function AdsReportPrintPage() {
  return <Suspense fallback={null}><AdsReportPrint /></Suspense>;
}
