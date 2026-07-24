"use client";
import { useI18n } from "@/lib/i18n";
// Shared Heroleads-style Ads Report layout, rendered identically by BOTH the headless
// PDF page (/report/ads) and the dashboard Ads Report tab, so what you see on screen is
// exactly what you export. Purely presentational: it takes already-fetched data as props.
//
// Heroleads LAYOUT with the Simpulx brand: light-gray canvas, white soft-shadow panels,
// GREEN (#2D8B73) accent for table headers / bars / budget, a green stacked funnel,
// heatmap table (Leads green, CPL yellow), dense charts.
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { Eye, MousePointerClick, Percent, Users, ShoppingCart } from "lucide-react";
import { IndonesiaMap } from "@/components/IndonesiaMap";
import type { AdPerformance, AdPerfSource, AdKeyword, AdBreakdown, Ga4Report, Campaign } from "@/lib/types";

const num = (n: number) => Math.round(n || 0).toLocaleString("en-US");
const money = (n: number) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const pct = (n: number) => (n || 0).toFixed(2) + "%";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : iso; };
const fmtSec = (s: number) => { const m = Math.floor((s || 0) / 60); const sec = Math.round((s || 0) % 60); return `${m}:${String(sec).padStart(2, "0")}`; };

// Heroleads layout, Simpulx brand palette (green accent, not orange).
const GREEN = "#2D8B73";        // brand accent: table headers, bars, budget
const GREEN_DK = "#1E5C4C";     // deep green: chart "clicks" line/bars
const NAVY = "#0b1220";          // header / chart "impressions" line
const MAGENTA = "#FF1E6F";       // gender: female
const BLUE = "#1565D8";          // gender: male
// On-brand green funnel ramp (dark -> light as it narrows) · same ramp as the
// dashboard Marketing funnel; the last (mint) step takes dark text.
const FUNNEL = ["#1E5C4C", "#26735F", "#2D8B73", "#4DA184", "#CBE7DB"];
const CANVAS = "#eceff3";
const PANEL = "0 1px 3px rgba(15,23,42,.10), 0 1px 2px rgba(15,23,42,.06)";
// Classified lead source -> label (kept in sync with the dashboard Latest Leads).
const SRC_LABELS: Record<string, string> = { meta_ads: "Meta Ads", tiktok_ads: "TikTok Ads", google_ads: "Google Ads", website: "Website", direct: "Direct" };
const clamp = (t: number) => Math.max(0, Math.min(1, t || 0));
// Heatmap tints matching the reference cells.
const tintGreen = (t: number) => `rgba(34,197,94,${(0.08 + clamp(t) * 0.42).toFixed(3)})`;
const tintYellow = (t: number) => `rgba(245,196,0,${(0.08 + clamp(t) * 0.5).toFixed(3)})`;
const tintOrange = (t: number) => `rgba(255,87,34,${(0.06 + clamp(t) * 0.34).toFixed(3)})`;

export function AdsReportView({ perf, keywords, ga4, camps, campaigns, rangeLabel, width = 980 }: {
  perf: AdPerformance | null;
  keywords: AdKeyword[];
  ga4: Ga4Report | null;
  camps: Campaign[];
  campaigns: string[];
  rangeLabel: string;
  width?: number;
}) {
  const { t } = useI18n();
  const sources = perf?.sources ?? [];
  const tot = sources.reduce((a, s) => ({
    spend: a.spend + s.spend, impressions: a.impressions + s.impressions, clicks: a.clicks + s.clicks, leads: a.leads + s.leads,
  }), { spend: 0, impressions: 0, clicks: 0, leads: 0 });
  // Purchases = campaign-rollup sales (stage-based), the same figure the
  // dashboard funnel shows · sources.purchases counts dispositions instead
  // and diverges (0 vs 1) when a won lead has no disposition set.
  const purchases = (perf?.campaigns ?? [])
    .filter((c) => campaigns.length === 0 || campaigns.includes(c.campaign_id))
    .reduce((a, c) => a + (c.sales || 0), 0);
  const ctr = tot.impressions > 0 ? (tot.clicks / tot.impressions) * 100 : 0;
  const cpc = tot.clicks > 0 ? tot.spend / tot.clicks : 0;
  const cpl = tot.leads > 0 ? tot.spend / tot.leads : 0;
  const overallConv = tot.impressions > 0 ? (purchases / tot.impressions) * 100 : 0;

  // Skip all-zero days so the axes only span dates that actually have activity,
  // and sort ascending · the API returns newest-first, charts read left->right.
  const activeDaily = (perf?.daily ?? [])
    .filter((d) => (d.impressions || 0) + (d.clicks || 0) + (d.spend || 0) + (d.leads || 0) > 0)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const dailyPerf = activeDaily.map((d) => ({
    date: fmtDay(d.date), impressions: d.impressions > 0 ? d.impressions : null, clicks: d.clicks > 0 ? d.clicks : null, spend: Math.round(d.spend || 0),
  }));
  // Log-axis ticks at powers of 10 only (one gridline per decade).
  const perfMax = Math.max(1, ...dailyPerf.map((d) => Math.max(d.impressions || 0, d.clicks || 0)));
  const logTicks: number[] = [];
  for (let p = 1; p <= perfMax * 10 && logTicks.length < 8; p *= 10) logTicks.push(p);
  const sparse = dailyPerf.length <= 12; // show dots when there are few points so the line reads
  const kw = keywords.slice(0, 10);
  const kwMax = Math.max(1, ...kw.map((k) => k.impressions));
  const logW = (v: number) => Math.max(2, (Math.log10((v || 0) + 1) / Math.log10(kwMax + 1)) * 100);

  // Heatmap ranges for the campaign-performance table.
  const srcCtr = (s: AdPerfSource) => (s.impressions > 0 ? (s.clicks / s.impressions) * 100 : 0);
  const srcCpl = (s: AdPerfSource) => (s.leads > 0 ? s.spend / s.leads : 0);
  const maxLeads = Math.max(1, ...sources.map((s) => s.leads));
  const maxCtr = Math.max(0.0001, ...sources.map(srcCtr));
  const cplVals = sources.filter((s) => s.leads > 0).map(srcCpl);
  const maxCpl = Math.max(1, ...cplVals), minCpl = Math.min(...(cplVals.length ? cplVals : [0]));

  // Same 5-step funnel as the dashboard Marketing funnel: pointy rounded
  // trapezoids + conversion pills + overall footer.
  const funnelSteps = [
    { label: "Impressions", value: num(tot.impressions), rate: "100%", Icon: Eye },
    { label: "Clicks", value: num(tot.clicks), rate: pct(tot.impressions > 0 ? (tot.clicks / tot.impressions) * 100 : 0), Icon: MousePointerClick },
    { label: "CTR", value: pct(ctr), rate: pct(ctr), Icon: Percent },
    { label: "Leads", value: num(tot.leads), rate: pct(tot.clicks > 0 ? (tot.leads / tot.clicks) * 100 : 0), Icon: Users },
    { label: "Purchases", value: num(purchases), rate: pct(tot.leads > 0 ? (purchases / tot.leads) * 100 : 0), Icon: ShoppingCart },
  ];

  const dem = (arr?: AdBreakdown[]) => (arr || []).filter((b) => (b.value || "").toLowerCase() !== "unknown");
  const age = dem(perf?.age), gender = dem(perf?.gender);

  const dailyLeads = activeDaily.map((d) => ({ date: fmtDay(d.date), leads: d.leads }));
  const region = dem(perf?.region);
  const regionBySpend = region.some((b) => b.spend > 0);
  const mapPoints = region.map((b) => ({ name: b.value, value: regionBySpend ? b.spend : b.impressions }));
  const selectedCamps = camps.filter((c) => campaigns.length === 0 || campaigns.includes(c.id));
  const headerSub = selectedCamps.length === 1 ? selectedCamps[0].name : "Ads Performance Report";
  const budget = selectedCamps.reduce((a, c) => a + ((c as { monthly_budget?: number | null }).monthly_budget || 0), 0);
  const budgetLeft = budget - tot.spend;
  const util = budget > 0 ? (tot.spend / budget) * 100 : 0;
  const gt = ga4?.totals;
  // Sembunyikan section Google keywords & GA4 di PDF kalau tidak ada data
  // (bukan cetak kartu kosong), sama seperti dashboard.
  const hasKw = kw.length > 0;
  const hasGa4 = !!(ga4?.connected && gt);

  const td = { padding: "8px 10px", textAlign: "right" as const };
  const tdL = { padding: "8px 10px", textAlign: "left" as const };

  return (
    <div style={{ width, maxWidth: "100%", margin: "0 auto", background: CANVAS, color: "#0f172a", fontFamily: "Inter, Arial, sans-serif", padding: 14, borderRadius: 12 }}>
      {/* Header · deep brand green (matches the funnel top / app theme) */}
      <div style={{ background: GREEN_DK, color: "#fff", padding: "16px 22px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", borderRadius: 10, boxShadow: PANEL }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/simpulx_logo.png" alt={t("auth.simpulx")} style={{ height: 30, width: "auto", display: "block" }} />
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.3 }}>{t("auth.simpulx")}</span>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1.5 }}>{t("report.campaignDashboard")}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.72)", letterSpacing: 0.3 }}>{headerSub}</div>
        </div>
        <div style={{ justifySelf: "end", fontSize: 12, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", padding: "6px 12px", borderRadius: 6, whiteSpace: "nowrap" }}>{rangeLabel}</div>
      </div>

      {/* KPI summary · mirrors the dashboard Ads Report KPI row */}
      <div className="print-avoid-break" style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12, paddingTop: 14 }}>
        {([["Ad spend", money(tot.spend)], ["Impressions", num(tot.impressions)], ["Clicks", num(tot.clicks)],
          ["Leads", num(tot.leads)], ["Cost / lead", tot.leads > 0 ? money(cpl) : "-"], ["Purchases", num(purchases)]] as [string, string][]).map(([l, v]) => (
          <div key={l} style={{ background: "#fff", borderRadius: 10, boxShadow: PANEL, padding: "11px 13px" }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, whiteSpace: "nowrap" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Funnel + Campaign performance table */}
      <div className="print-avoid-break" style={{ display: "grid", gridTemplateColumns: "390px 1fr", gap: 14, paddingTop: 14, alignItems: "start" }}>
        <Panel>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{t("report.marketingFunnel")}</div>
          <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 2, marginBottom: 12 }}>{t("dashboard.impressionToPurchaseConversion")}</div>
          <PdfFunnel steps={funnelSteps} width={362} />
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "#f8fafc", border: "1px solid #eef2f6", borderRadius: 8, padding: "8px 12px" }}>
            <span style={{ fontSize: 10, color: "#64748b" }}>{t("dashboard.overallConversionRateFromImpression")}</span>
            <span style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>{pct(overallConv)}</span>
          </div>
        </Panel>

        <Panel pad={false}>
          <div style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700 }}>{t("components.campaignPerformance")}</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: GREEN, color: "#fff" }}>
                {["SOURCE", "COST", "IMPRESSIONS", "CLICKS", "CTR", "CPC", "LEADS", "CPL"].map((h, i) => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: i === 0 ? "left" : "right", fontWeight: 700, fontSize: 10.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => {
                const sCtr = srcCtr(s), sCpc = s.clicks > 0 ? s.spend / s.clicks : 0, sCpl = srcCpl(s);
                return (
                  <tr key={s.source} style={{ borderBottom: "1px solid #eef2f7" }}>
                    <td style={{ ...tdL, fontWeight: 600 }}>{t(s.label)}</td>
                    <td style={td}>{money(s.spend)}</td>
                    <td style={td}>{num(s.impressions)}</td>
                    <td style={td}>{num(s.clicks)}</td>
                    <td style={{ ...td, background: tintOrange(sCtr / maxCtr) }}>{pct(sCtr)}</td>
                    <td style={td}>{s.clicks > 0 ? money(sCpc) : "-"}</td>
                    <td style={{ ...td, fontWeight: 700, background: tintGreen(s.leads / maxLeads) }}>{num(s.leads)}</td>
                    <td style={{ ...td, background: s.leads > 0 ? tintYellow(maxCpl > minCpl ? 1 - (sCpl - minCpl) / (maxCpl - minCpl) : 0.5) : undefined }}>{s.leads > 0 ? money(sCpl) : "-"}</td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: "2px solid #cbd5e1", fontWeight: 700, background: "#f8fafc" }}>
                <td style={tdL}>{t("dashboard.grandTotal")}</td>
                <td style={td}>{money(tot.spend)}</td>
                <td style={td}>{num(tot.impressions)}</td>
                <td style={td}>{num(tot.clicks)}</td>
                <td style={td}>{pct(ctr)}</td>
                <td style={td}>{tot.clicks > 0 ? money(cpc) : "-"}</td>
                <td style={td}>{num(tot.leads)}</td>
                <td style={td}>{tot.leads > 0 ? money(cpl) : "-"}</td>
              </tr>
            </tbody>
          </table>
        </Panel>
      </div>

      {/* Campaign Performance Breakdown (log) */}
      <Section mt title={t("dashboard.campaignPerformanceBreakdown")} legend={[[GREEN_DK, "Clicks"], [NAVY, "Impressions"]]}>
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyPerf} margin={{ top: 6, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis scale="log" domain={[1, logTicks[logTicks.length - 1] ?? 10]} ticks={logTicks} allowDataOverflow tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44}
                tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
              <Line type="monotone" dataKey="impressions" stroke={NAVY} strokeWidth={2} dot={sparse ? { r: 2.5, fill: NAVY } : false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="clicks" stroke={GREEN_DK} strokeWidth={2} dot={sparse ? { r: 2.5, fill: GREEN_DK } : false} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* Google top keywords + Age demography */}
      <div className="print-avoid-break" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 14, paddingTop: 12, alignItems: "start" }}>
        <Section title={t("dashboard.ageDemography")} legend={[[NAVY, "Impressions"], [GREEN_DK, "Clicks"]]}>
          {age.length === 0 ? <EmptyNote text={t("report.noAgeBreakdownInThis")} /> : (() => {
            // Shares (%) on one comparable scale, matching the dashboard: raw
            // impressions vs clicks are on two different magnitudes.
            const totImp = age.reduce((a, b) => a + b.impressions, 0) || 1;
            const totClk = age.reduce((a, b) => a + b.clicks, 0) || 1;
            const iShare = (b: AdBreakdown) => (b.impressions / totImp) * 100;
            const cShare = (b: AdBreakdown) => (b.clicks / totClk) * 100;
            const maxShare = Math.max(1, ...age.map(iShare), ...age.map(cShare));
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {age.map((b) => (
                  <div key={b.value} style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 10 }}>{b.value}</span>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ height: 9, borderRadius: 2, background: NAVY, width: `${(iShare(b) / maxShare) * 100}%` }} /><span style={{ fontSize: 9, color: "#64748b" }}>{iShare(b).toFixed(1)}%</span></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}><div style={{ height: 9, borderRadius: 2, background: GREEN_DK, width: `${(cShare(b) / maxShare) * 100}%` }} /><span style={{ fontSize: 9, color: "#64748b" }}>{cShare(b).toFixed(1)}%</span></div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </Section>
        <Section title={t("dashboard.genderDemography")}>
          {gender.length === 0 ? <EmptyNote text={t("report.noGenderBreakdownInThis")} /> : (
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
                      <div style={{ height: "100%", background: b.value.toLowerCase() === "female" ? MAGENTA : BLUE, width: `${(b.impressions / total) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>

      {/* Google Top 10 Keywords (if present) + Monthly leads breakdown */}
      <div className="print-avoid-break" style={{ display: "grid", gridTemplateColumns: hasKw ? "380px 1fr" : "1fr", gap: 14, paddingTop: 12, alignItems: "start" }}>
        {hasKw && (
        <Section title={t("dashboard.googleTop10SearchKeywords")} legend={[[GREEN_DK, "Clicks"], [NAVY, "Impressions"]]}>
          {(
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {kw.map((k, i) => (
                <div key={k.keyword + i} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={k.keyword}>{k.keyword}</span>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ height: 9, borderRadius: 2, background: GREEN_DK, width: `${logW(k.clicks)}%` }} /><span style={{ fontSize: 9, color: "#64748b" }}>{num(k.clicks)}</span></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}><div style={{ height: 9, borderRadius: 2, background: NAVY, width: `${logW(k.impressions)}%` }} /><span style={{ fontSize: 9, color: "#64748b" }}>{num(k.impressions)}</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
        )}
        <Section title={t("report.monthlyLeadsPerformanceBreakdown")}>
          {dailyLeads.length === 0 ? <EmptyNote text={t("report.noLeadDataInThis")} /> : (
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyLeads} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={GREEN} stopOpacity={0.35} /><stop offset="100%" stopColor={GREEN} stopOpacity={0.02} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={34} allowDecimals={false} />
                  <Area type="monotone" dataKey="leads" stroke={GREEN} strokeWidth={2} fill="url(#lg)" dot={sparse ? { r: 2.5, fill: GREEN } : false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
      </div>

      {/* Latest leads. Uses perf.recent_leads (same source as the dashboard) so the
          Channel and classified Source columns are present and match on-screen. */}
      <Section mt title={t("dashboard.latestLeads")}>
        {(perf?.recent_leads?.length ?? 0) === 0 ? <EmptyNote text={t("report.noLeadsInThisRange")} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead>
              <tr style={{ background: GREEN, color: "#fff" }}>
                {["DATE", "NAME", "PHONE", "EMAIL", "CHANNEL", "SOURCE", "STATUS", "INTEREST"].map((h) => (<th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10, fontWeight: 700 }}>{t(h)}</th>))}
              </tr>
            </thead>
            <tbody>
              {(perf?.recent_leads ?? []).slice(0, 10).map((l, i) => {
                const lv = (l.interest_level || "").toLowerCase();
                const lvColor = lv === "hot" ? "#EF4444" : lv === "warm" ? "#F59E0B" : lv === "cold" ? "#3B82F6" : null;
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #eef2f7" }}>
                    <td style={{ padding: "7px 10px", color: "#64748b", whiteSpace: "nowrap" }}>{l.created_at ? new Date(l.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }) : "-"}</td>
                    <td style={{ padding: "7px 10px", fontWeight: 600 }}>{l.contact_name || t("broadcasts.unknown")}</td>
                    <td style={{ padding: "7px 10px", color: "#64748b" }}>{l.contact_phone || "-"}</td>
                    <td style={{ padding: "7px 10px", color: "#64748b" }}>{l.contact_email || "-"}</td>
                    <td style={{ padding: "7px 10px", color: "#64748b", textTransform: "capitalize" }}>{l.channel || "-"}</td>
                    <td style={{ padding: "7px 10px", color: "#64748b" }}>{SRC_LABELS[l.source] || l.source || "-"}</td>
                    <td style={{ padding: "7px 10px" }}>{l.stage || "-"}</td>
                    <td style={{ padding: "7px 10px" }}>
                      {lvColor ? (
                        <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: "capitalize", color: lvColor, background: lvColor + "1a" }}>{lv}</span>
                      ) : <span style={{ color: "#94a3b8" }}>-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* Monthly spending */}
      <Section mt title={t("dashboard.monthlySpendingPerformance")} legend={[[GREEN, "Cost"]]}>
        {dailyPerf.length === 0 ? <EmptyNote text={t("report.noSpendDataInThis")} /> : (
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyPerf} margin={{ top: 6, right: 8, left: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={52}
                  tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                <Bar dataKey="spend" fill={GREEN} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* Budget utilization cards */}
      {budget > 0 && (
        <div className="print-avoid-break" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, paddingTop: 12 }}>
          {[
            { label: "Media Budget", value: money(budget), accent: false },
            { label: "Cost", value: money(tot.spend), accent: true },
            { label: "Budget Left", value: money(budgetLeft), accent: false, c: budgetLeft < 0 ? "#DC2626" : "#0f172a" },
            { label: "Budget Utilization", value: util.toFixed(2) + "%", accent: true },
          ].map((b) => (
            <div key={b.label} style={{ borderRadius: 10, padding: "13px 15px", background: b.accent ? GREEN : "#fff", color: b.accent ? "#fff" : (b.c || "#0f172a"), boxShadow: PANEL }}>
              <div style={{ fontSize: 11, opacity: b.accent ? 0.92 : 0.6 }}>{t(b.label)}</div>
              <div style={{ fontSize: 19, fontWeight: 800, marginTop: 3 }}>{b.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Landing Page Performance (GA4, left) + Top locations (right) in one row.
          Both always present so the report structure stays consistent. */}
      <div className="print-avoid-break" style={{ display: "grid", gridTemplateColumns: hasGa4 ? "1fr 1fr" : "1fr", gap: 14, paddingTop: 12, alignItems: "start" }}>
      {hasGa4 && gt && (
      <Section title={t("dashboard.landingPagePerformance")}>
        {(<>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 12 }}>
            {([["Total users", num(gt.total_users)], ["Active users", num(gt.active_users)], ["New users", num(gt.new_users)], ["Sessions", num(gt.sessions)],
              ["Engaged sessions", num(gt.engaged_sessions)], ["Engagement rate", (gt.engagement_rate * 100).toFixed(1) + "%"], ["Avg engagement", fmtSec(gt.avg_engagement_sec)], ["Views", num(gt.views)]] as [string, string][]).map(([l, v]) => (
              <div key={l} style={{ background: "#f8fafc", borderRadius: 8, padding: "9px 11px" }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{v}</div>
                <div style={{ fontSize: 10, color: "#64748b" }}>{l}</div>
              </div>
            ))}
          </div>
          {ga4.rows.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb", color: "#64748b" }}>
                  {["Landing page", "Views", "Sessions", "New users", "Engagement"].map((h, i) => (<th key={h} style={{ padding: "5px 8px", textAlign: i === 0 ? "left" : "right", fontSize: 9.5, fontWeight: 700 }}>{t(h)}</th>))}
                </tr>
              </thead>
              <tbody>
                {ga4.rows.slice(0, 8).map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "5px 8px", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.landing_page || t("dashboard.notSet")}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{num(r.views)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{num(r.sessions)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{num(r.new_users)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{(r.engagement_rate * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>)}
      </Section>
      )}
      {/* Top locations (province) */}
      <Section title={regionBySpend ? t("report.topLocationsAdSpendBy") : t("report.topLocationsReach")}>
        {mapPoints.length === 0 ? <EmptyNote text={t("report.noLocationDataInThis")} /> : (
          <div style={{ height: 300 }}>
            <IndonesiaMap points={mapPoints} isMoney={regionBySpend} money={regionBySpend ? money : num} />
          </div>
        )}
      </Section>
      </div>
    </div>
  );
}

// Dashboard-identical marketing funnel at a FIXED pixel width (the PDF page has a
// deterministic layout, so no measuring): one continuous cone silhouette
// (100% -> 20%) sliced per stage with the gaps cut out, each stage an SVG
// trapezoid with rounded corners, dotted leaders out to bordered rate pills.
function PdfFunnel({ steps, width }: {
  steps: { label: string; value: string; rate: string; Icon: any }[];
  width: number;
}) {
  const { t } = useI18n();
  const H = 52, G = 4, END = 20, R = 6;
  const pillW = 54, gap = 8, aw = width - pillW - gap;
  const total = steps.length * H + (steps.length - 1) * G;
  const wAt = (y: number) => 100 - (100 - END) * (y / total);
  const trapPath = (wt: number, wb: number) => {
    const xtl = (aw - wt) / 2, xtr = (aw + wt) / 2, xbl = (aw - wb) / 2, xbr = (aw + wb) / 2;
    const rdx = xbr - xtr, rlen = Math.hypot(rdx, H), rux = rdx / rlen, ruy = H / rlen;
    const ldx = xtl - xbl, llen = Math.hypot(ldx, H), lux = ldx / llen, luy = -H / llen;
    return `M ${xtl + R} 0 L ${xtr - R} 0 Q ${xtr} 0 ${xtr + rux * R} ${ruy * R}` +
      ` L ${xbr - rux * R} ${H - ruy * R} Q ${xbr} ${H} ${xbr - R} ${H} L ${xbl + R} ${H}` +
      ` Q ${xbl} ${H} ${xbl + lux * R} ${H + luy * R} L ${xtl - lux * R} ${-luy * R} Q ${xtl} 0 ${xtl + R} 0 Z`;
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: G }}>
      {steps.map((s, i) => {
        const top = (wAt(i * (H + G)) / 100) * aw, bot = (wAt(i * (H + G) + H) / 100) * aw;
        const last = i === steps.length - 1;
        const color = last ? FUNNEL[0] : "#fff";
        return (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap }}>
            <div style={{ position: "relative", width: aw, height: H }}>
              <div style={{ position: "absolute", top: "50%", right: 0, left: aw / 2 + (top + bot) / 4 + 5, borderTop: "1px dotted #cbd5e1" }} />
              <svg width={aw} height={H} style={{ position: "absolute", inset: 0, display: "block" }} aria-hidden="true">
                <path d={trapPath(top, bot)} fill={FUNNEL[i]} />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color }}>
                <s.Icon style={{ width: 15, height: 15, opacity: 0.9, flexShrink: 0 }} />
                <div style={{ textAlign: "center", minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 9.5, fontWeight: 500, opacity: 0.85, marginTop: 2 }}>{t(s.label)}</div>
                </div>
              </div>
            </div>
            <span style={{ flexShrink: 0, width: pillW, height: 28, display: "grid", placeItems: "center", border: "1px solid #e2e8f0", background: "#fff", borderRadius: 8, fontSize: 11, fontWeight: 700, color: "#1e293b" }}>{s.rate}</span>
          </div>
        );
      })}
    </div>
  );
}

// Consistent placeholder so empty sections still hold their place in the report.
function EmptyNote({ text }: { text: string }) {
  return <div style={{ padding: "24px 0", textAlign: "center", fontSize: 11, color: "#94a3b8" }}>{text}</div>;
}

// White panel with a soft shadow on the gray canvas (the Heroleads card look).
function Panel({ children, pad = true }: { children: React.ReactNode; pad?: boolean }) {
  return <div className="print-avoid-break" style={{ background: "#fff", borderRadius: 10, boxShadow: PANEL, overflow: "hidden", padding: pad ? 14 : 0 }}>{children}</div>;
}

function Section({ title, legend, mt = false, children }: { title: string; legend?: [string, string][]; mt?: boolean; children: React.ReactNode }) {
  const panel = (
    <Panel>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
        {legend && (
          <div style={{ display: "flex", gap: 12 }}>
            {legend.map(([c, l]) => (<span key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#64748b" }}><span style={{ width: 10, height: 10, borderRadius: 2, background: c }} />{l}</span>))}
          </div>
        )}
      </div>
      {children}
    </Panel>
  );
  // paddingTop (NOT marginTop): margins are truncated at page breaks, so a
  // section pushed to a new page would sit flush against the page top. Padding
  // is part of the avoid-break box and travels with it across the break.
  return mt ? <div className="print-avoid-break" style={{ paddingTop: 12 }}>{panel}</div> : panel;
}
