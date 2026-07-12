"use client";
import { useEffect, useState, useMemo, useRef, useCallback, useId } from "react";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, LabelList,
} from "recharts";
import {
  BarChart3, MessageSquare, Inbox, Flame, Timer,
  TrendingDown, TrendingUp, ChevronRight, ChevronsLeft, Zap, Mail, Reply, Trophy, Ban,
  CircleDollarSign, MousePointerClick, Spotlight, Target, Eye, Filter as FilterIcon,
  Image as ImageIcon, MapPin, Percent,
  Download, FileText, FileSpreadsheet, ChevronDown,
  ArrowUpRight, ArrowDownRight, ArrowRight, Users, ShoppingCart,
  Infinity as InfinityIcon, Music2, Globe, Sparkles, Award, AlertTriangle, RefreshCw, Search,
} from "lucide-react";

import { api, getUser, getToken } from "@/lib/api";
import { Select } from "@/components/Select";
import { MultiSelect } from "@/components/ui/multi-select";
import { IndonesiaMap } from "@/components/IndonesiaMap";
import { Tip } from "@/components/ui/tooltip";
import { lostReasonLabel } from "@/app/(app)/inbox/components/LostReasonDialog";
import type { Stats, Analytics, DashboardCards, AdPerformance, AdKeyword, AdBreakdown, Channel, Campaign, Agent, Ga4Report } from "@/lib/types";
import { cn, fmtDuration, stageLabel } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import DateRangeFilter, { presetRange } from "@/components/DateRangeFilter";

type Metric = {
  key: string; label: string; Icon: any; color: string;
  href?: string; fmt?: (v: number) => string;
};

// Accurate, unambiguous: Replied = AGENT replied; Won = disposition won; Avg first
// response = first agent reply after the customer's first message (bot excluded).
const METRICS: Metric[] = [
  { key: "total_leads", label: "Leads", Icon: BarChart3, color: "#6366F1", href: "/inbox" },
  { key: "active", label: "Active", Icon: MessageSquare, color: "#2D8B73", href: "/inbox?status=open" },
  { key: "unassigned", label: "Unassigned", Icon: Inbox, color: "#E67E22", href: "/inbox?assigned=unassigned" },
  // "Handled" = leads the AGENT replied to (distinct from the Overview chart's
  // "Replied", which counts customers who replied back).
  { key: "replied", label: "Handled", Icon: Reply, color: "#0284C7" },
  { key: "won", label: "Purchase", Icon: Trophy, color: "#059669" },
  { key: "avg_rt", label: "Avg response time", Icon: Timer, color: "#7C3AED", fmt: fmtDuration },
];

// Same canonical keys used everywhere else (contacts, exports, logs).
const SOURCE_OPTIONS = [
  { value: "meta_ads", label: "Meta Ads" },
  { value: "tiktok_ads", label: "TikTok Ads" },
  { value: "google_ads", label: "Google Ads" },
  { value: "website", label: "Website" },
  { value: "direct", label: "Direct" },
];

// Real daily series from analytics.daily (no fabrication). Returns [] when absent.
// Pass all=true to plot every day instead of just the last 7.
function buildChartData(analytics: Analytics | null, all = false) {
  const daily = analytics?.daily;
  if (!daily || daily.length === 0) return [];
  return (all ? daily : daily.slice(-7)).map((d) => {
    const dt = new Date(d.day);
    const label = isNaN(dt.getTime())
      ? d.day
      : `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
    return { date: label, leads: d.leads || 0, replied: d.replied || 0 };
  });
}

// Date-range presets -> local YYYY-MM-DD (backend evaluates them in the org tz).
// Date-range presets come from the canonical `presetRange` in DateRangeFilter,
// so the dashboard never drifts out of sync with the picker (a stale local copy
// was silently returning an empty range for "yesterday"/"last 30 days").

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md bg-[#356B5A]/90 backdrop-blur-sm px-3 py-2 shadow-md min-w-[140px]">
      <p className="text-[11px] font-semibold text-white/70 mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5 last:mb-0">
          <span className="w-2 h-2 rounded-full shrink-0 ring-1 ring-white/40" style={{ backgroundColor: p.color }} />
          <span className="text-xs text-white/80">{p.name}</span>
          <span className="text-xs font-bold text-white tabular-nums ml-auto">{Number(p.value ?? 0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// Green pie/donut tooltip, matching the main Tip colour.
function DonutTooltip({ active, payload, total }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const pct = total > 0 ? ((Number(p.value ?? 0) / total) * 100).toFixed(1) : "0";
  return (
    <div className="rounded-md bg-[#356B5A]/90 backdrop-blur-sm px-3 py-1.5 shadow-md">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full shrink-0 ring-1 ring-white/40" style={{ backgroundColor: p.payload?.color || p.color }} />
        <span className="text-xs font-semibold text-white capitalize">{p.name}</span>
        <span className="text-xs font-bold text-white tabular-nums ml-2">{pct}%</span>
      </div>
    </div>
  );
}

function ProgressBar({ value, color, height = 8 }: { value: number; color: string; height?: number }) {
  return (
    <div className="w-full rounded-full bg-foreground/[0.06] overflow-hidden" style={{ height }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }}
      />
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} />;
}

// ── Ads Report: inline mini-charts + trend deltas ─────────────────────────────
// Tiny SVG sparkline (line, optional soft area fill). `stretch` fills the parent
// width (KPI cards); otherwise a fixed size for table cells. viewBox + non-scaling
// stroke keeps the line crisp at any width.
function Spark({ data, color, w = 120, h = 34, fill = true, stretch = false }: {
  data: number[]; color: string; w?: number; h?: number; fill?: boolean; stretch?: boolean;
}) {
  const gid = "sp" + useId().replace(/:/g, ""); // useId() has colons -> invalid in url(#..)
  const pts = data.length ? data : [0, 0];
  const max = Math.max(...pts), min = Math.min(...pts);
  const span = max - min || 1;
  const n = pts.length;
  const x = (i: number) => (n === 1 ? w : (i / (n - 1)) * w);
  const y = (v: number) => h - 2 - ((v - min) / span) * (h - 4);
  const line = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${w.toFixed(1)},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={stretch ? { width: "100%", height: h } : { width: w, height: h }}>
      {fill && (
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} /><stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient></defs>
      )}
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Tiny SVG bar histogram for a table cell (e.g. daily impressions per source).
function MiniBars({ data, color, w = 64, h = 20 }: { data: number[]; color: string; w?: number; h?: number }) {
  const pts = data.length ? data : [0];
  const max = Math.max(...pts, 1);
  const bw = w / pts.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: w, height: h }}>
      {pts.map((v, i) => {
        const bh = Math.max(1, (v / max) * (h - 2));
        return <rect key={i} x={i * bw + bw * 0.15} y={h - bh} width={Math.max(0.6, bw * 0.7)} height={bh} rx={0.4} fill={color} opacity={0.5} />;
      })}
    </svg>
  );
}

// Arrow + % change vs a prior baseline. `higherIsBetter` picks the colour
// (green favourable / red unfavourable); null = neutral (grey) for e.g. spend.
function Delta({ cur, prev, higherIsBetter = true as boolean | null, className }: {
  cur: number; prev: number; higherIsBetter?: boolean | null; className?: string;
}) {
  // No prior baseline (prev = 0 while cur > 0): "100%" would be misleading, so
  // label it as new instead of inventing a growth figure.
  if (prev === 0 && cur !== 0) {
    return <span className={cn("inline-flex items-center text-[11px] font-semibold text-muted-foreground", className)}>New</span>;
  }
  const diff = cur - prev;
  const flat = prev === 0 ? cur === 0 : Math.abs(diff / prev) < 0.0005;
  const pct = prev === 0 ? (cur === 0 ? 0 : 100) : (diff / prev) * 100;
  const up = diff > 0;
  const color = flat || higherIsBetter === null ? "#64748B" : (higherIsBetter === up ? "#059669" : "#DC2626");
  const Arrow = flat ? ArrowRight : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums", className)} style={{ color }}>
      <Arrow className="w-3 h-3 shrink-0" />{flat ? "0%" : `${Math.abs(pct).toFixed(1)}%`}
    </span>
  );
}

// Per-source brand mark (lucide glyphs tinted to each channel).
const SRC_ICONS: Record<string, { Icon: any; color: string }> = {
  meta_ads: { Icon: InfinityIcon, color: "#0866FF" },
  tiktok_ads: { Icon: Music2, color: "#111827" },
  google_ads: { Icon: Search, color: "#EA4335" },
  website: { Icon: Globe, color: "#6366F1" },
  direct: { Icon: Globe, color: "#64748B" },
};
function SourceIcon({ source }: { source: string }) {
  const it = SRC_ICONS[source] || { Icon: Globe, color: "#64748B" };
  return (
    <span className="w-6 h-6 rounded-md grid place-items-center shrink-0" style={{ background: it.color + "14" }}>
      <it.Icon className="w-3.5 h-3.5" style={{ color: it.color }} />
    </span>
  );
}

// Previous window of equal length ending the day before `from` (for "vs last N days").
function prevRange(from: string, to: string): { from: string; to: string } | null {
  if (!from || !to) return null;
  const f = new Date(from + "T00:00:00"), t = new Date(to + "T00:00:00");
  if (isNaN(f.getTime()) || isNaN(t.getTime())) return null;
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  const pt = new Date(f); pt.setDate(pt.getDate() - 1);
  const pf = new Date(pt); pf.setDate(pf.getDate() - (days - 1));
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(pf), to: fmt(pt) };
}

// Modern branded chart tooltip (matches the green CustomTooltip look). `fmt`
// formats each value (e.g. money for spend); defaults to a thousands-grouped int.
function AdsTooltip({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null;
  const f = fmt || ((v: number) => Number(v ?? 0).toLocaleString());
  return (
    <div className="rounded-md bg-[#356B5A]/90 backdrop-blur-sm px-3 py-2 shadow-md min-w-[150px]">
      <p className="text-[11px] font-semibold text-white/70 mb-1.5">{label}</p>
      {payload.filter((p: any) => p.value != null).map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5 last:mb-0">
          <span className="w-2 h-2 rounded-full shrink-0 ring-1 ring-white/40" style={{ backgroundColor: p.color || p.stroke || p.fill }} />
          <span className="text-xs text-white/80">{p.name}</span>
          <span className="text-xs font-bold text-white tabular-nums ml-auto">{f(Number(p.value ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}

// Roll a report up to the totals the KPI cards compare on (delivery from daily
// ad_metrics; leads/sales from the per-campaign rollup, honouring the campaign filter).
function adTotals(perf: AdPerformance | null, campaignFilter: string[]) {
  const camps = perf?.campaigns || [];
  const shown = campaignFilter.length ? camps.filter((c) => campaignFilter.includes(c.campaign_id)) : camps;
  const leads = shown.reduce((a, c) => a + c.leads, 0);
  const sales = shown.reduce((a, c) => a + c.sales, 0);
  const ad = (perf?.daily || []).reduce((a, d) => ({
    impressions: a.impressions + (d.impressions || 0), clicks: a.clicks + (d.clicks || 0), spend: a.spend + (d.spend || 0),
  }), { impressions: 0, clicks: 0, spend: 0 });
  return { leads, sales, ...ad };
}

function Badge({ label, bg, text }: { label: string; bg: string; text: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tabular-nums" style={{ backgroundColor: bg, color: text }}>
      {label}
    </span>
  );
}

// Card shell - crisp, layered, enterprise
function Card({ title, subtitle, icon: Icon, iconColor, children, className }: {
  title?: string; subtitle?: string; icon?: any; iconColor?: string;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("bg-card rounded-lg border border-border shadow-xs overflow-hidden", className)}>
      {title && (
        <div className="px-4 py-3 border-b border-border flex items-center gap-2.5">
          {Icon && <Icon className="w-[18px] h-[18px]" style={{ color: iconColor }} />}
          <div>
            <p className="font-bold text-[14px] text-foreground leading-tight">{title}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

// Shared 7-day area chart (real analytics.daily) with honest empty + single-day states
function OverviewChart({ data }: { data: { date: string; leads: number; replied: number }[] }) {
  if (data.length === 0) return (
    <div className="h-[280px] flex flex-col items-center justify-center text-center">
      <div className="w-12 h-12 rounded-xl bg-muted grid place-items-center mb-3">
        <BarChart3 className="w-6 h-6 text-muted-foreground/50" />
      </div>
      <p className="text-[13px] font-semibold text-foreground">No activity yet</p>
      <p className="text-xs text-muted-foreground">Daily leads and replies will show here</p>
    </div>
  );
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2D8B73" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#2D8B73" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="colorReplied" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0284C7" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#0284C7" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(0,0,0,0.08)" }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
          formatter={(v: string) => <span style={{ color: "#667085", fontWeight: 500 }}>{v}</span>} />
        <Area type="monotone" dataKey="leads" name="Leads" stroke="#2D8B73" strokeWidth={2.5}
          fill="url(#colorLeads)" dot={{ r: 3, fill: "#fff", stroke: "#2D8B73", strokeWidth: 2 }}
          activeDot={{ r: 5, fill: "#2D8B73", stroke: "#fff", strokeWidth: 2 }} />
        <Area type="monotone" dataKey="replied" name="Replied" stroke="#0284C7" strokeWidth={2}
          fill="url(#colorReplied)" dot={{ r: 3, fill: "#fff", stroke: "#0284C7", strokeWidth: 2 }}
          activeDot={{ r: 5, fill: "#0284C7", stroke: "#fff", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Single-axis daily line chart: plots N series on ONE left Y scale (no dual
// axis), so the lines share a scale instead of two confusing axes.
function TimelineChart({ title, subtitle, data, series }: {
  title: string; subtitle: string;
  data: Record<string, number | string>[];
  series: { key: string; name: string; color: string }[];
}) {
  return (
    <Card title={title} subtitle={subtitle}>
      <div className="px-4 py-4">
        {data.length === 0 ? <div className="h-[260px] grid place-items-center text-sm text-muted-foreground">No daily data</div> : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(0,0,0,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} minTickGap={16} padding={{ left: 20, right: 20 }} />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={44} allowDecimals={false} />
              <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(0,0,0,0.08)" }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" iconSize={8} />
              {series.map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5}
                  dot={{ r: 3, fill: s.color, strokeWidth: 0 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

// Interest split rows (clickable deep-link to filtered inbox)
function InterestSplit({ funnel }: { funnel: Analytics["funnel"] | undefined }) {
  if (!funnel) return null;
  const rows = [
    { label: "Hot", value: funnel.hot, color: "#EF4444", href: "/inbox?interest=hot" },
    { label: "Warm", value: funnel.warm, color: "#F59E0B", href: "/inbox?interest=warm" },
    { label: "Cold", value: funnel.cold, color: "#3B82F6", href: "/inbox?interest=cold" },
    { label: "Unclassified", value: funnel.unknown, color: "#9CA3AF", href: "" },
  ];
  return (
    <div className="p-2">
      {rows.map((row) => {
        const inner = (
          <>
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
            <span className="text-sm font-medium flex-1 text-foreground/90">{row.label}</span>
            <div className="flex-[2]"><ProgressBar value={funnel.total > 0 ? (row.value / funnel.total) * 100 : 0} color={row.color} /></div>
            <span className="text-sm font-bold min-w-[28px] text-right tabular-nums" style={{ color: row.color }}>{row.value}</span>
            {row.href && <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover/int:text-muted-foreground" />}
          </>
        );
        return row.href ? (
          <Link key={row.label} href={row.href} className="group/int flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted transition-colors">{inner}</Link>
        ) : (
          <div key={row.label} className="flex items-center gap-3 px-2 py-2">{inner}<span className="w-4 h-4" /></div>
        );
      })}
    </div>
  );
}

// Stage split rows: leads by pipeline stage, colored to match the funnel chips.
// Lost is a terminal outcome (not a pipeline stage) so it sits at the bottom, in red.
function StageSplit({ stages, lost }: { stages?: Analytics["stages"]; lost?: number }) {
  const { t } = useI18n();
  if (!stages || stages.length === 0) {
    return <div className="py-10 text-center text-sm text-muted-foreground">No pipeline data yet</div>;
  }
  // "Lost" is a real stage but a terminal outcome: keep it OUT of the pipeline
  // list and pin it to the bottom in red, shown once (no duplicate row). Its
  // count comes from the stage itself; fall back to the legacy `lost` prop.
  const pipeline = [...stages].filter((s) => !(s.system_key || "").startsWith("lost")).sort((a, b) => a.sort_order - b.sort_order);
  const lostStages = stages.filter((s) => (s.system_key || "").startsWith("lost"));
  const lostCount = lostStages.length > 0 ? lostStages.reduce((sum, s) => sum + (s.count || 0), 0) : lost;
  const total = stages.reduce((s, x) => s + (x.count || 0), 0);
  // The Lost row can aggregate several lost-keyed stages whose display names may
  // not literally be "Lost". Deep-link by the actual stage name(s) so the inbox
  // filter matches exactly the leads counted here (comma-separated, resolved below).
  const lostHref = lostStages.length > 0
    ? `/inbox?stage=${lostStages.map((s) => encodeURIComponent(s.name)).join(",")}`
    : "/inbox?stage=Lost";
  return (
    <div className="p-2">
      {pipeline.map((s, i) => {
        const color = FUNNEL_COLORS[i % FUNNEL_COLORS.length];
        return (
          <Link
            key={s.system_key || s.name}
            href={`/inbox?stage=${encodeURIComponent(s.name)}`}
            className="group/st flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted transition-colors"
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-sm font-medium flex-1 text-foreground/90">{stageLabel(t, s)}</span>
            <div className="flex-[2]"><ProgressBar value={total > 0 ? (s.count / total) * 100 : 0} color={color} /></div>
            <span className="text-sm font-bold min-w-[28px] text-right tabular-nums" style={{ color }}>{s.count}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover/st:text-muted-foreground shrink-0" />
          </Link>
        );
      })}
      {lostCount !== undefined && (
        <Link
          href={lostHref}
          className="group/st flex items-center gap-3 px-2 py-2 mt-1 pt-2.5 border-t border-border/60 rounded-md hover:bg-muted transition-colors"
        >
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#EF4444" }} />
          <span className="text-sm font-medium flex-1 text-foreground/90">{t("dashboard.stageLost")}</span>
          <div className="flex-[2]"><ProgressBar value={total > 0 ? (lostCount / total) * 100 : 0} color="#EF4444" /></div>
          <span className="text-sm font-bold min-w-[28px] text-right tabular-nums" style={{ color: "#EF4444" }}>{lostCount}</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover/st:text-muted-foreground shrink-0" />
        </Link>
      )}
    </div>
  );
}

// Real lead funnel: cumulative "reached this stage or beyond" along the actual sales
// pipeline, with stage-to-stage conversion %. Driven by analytics.funnel_stages.
// Per-stage funnel colors, aligned with the inbox stage chips
// (New Lead -> Contacted -> Qualified -> Appointment -> Negotiation -> Purchase).
// One in-brand green ramp (light -> deep) instead of a rainbow: stays in the
// design system and reads as funnel progression.
const FUNNEL_COLORS = ["#A7DACE", "#7FC9B8", "#57B8A1", "#2D8B73", "#26735F", "#1E5C4C", "#174539"];


// â”€â”€ Agent dashboard: action-center (essentials only, no org analytics, no lead score) â”€â”€
const AGENT_CARDS = [
  { key: "open", label: "My open", sub: "Active conversations", Icon: MessageSquare, color: "#2D8B73", href: "/inbox?status=open" },
  { key: "hot", label: "Hot leads", sub: "High buying intent", Icon: Flame, color: "#EF4444", href: "/inbox?interest=hot" },
  { key: "unreplied", label: "Awaiting reply", sub: "You haven't replied yet", Icon: Zap, color: "#F59E0B", href: "/inbox?unreplied=1" },
  { key: "unread", label: "Unread", sub: "New, not opened", Icon: Mail, color: "#6366F1", href: "/inbox?unread=1" },
  { key: "purchase", label: "Purchased", sub: "Reached purchase", Icon: CircleDollarSign, color: "#059669", href: "" },
  { key: "lost", label: "Lost", sub: "Marked lost", Icon: TrendingDown, color: "#EF4444", href: "" },
] as const;

function AgentDashboard() {
  const [cards, setCards] = useState<DashboardCards | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsDone, setAnalyticsDone] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  // Same filters as the manager Overview: they bound the historical
  // chart/funnel/lost-analysis sections below, not the live action-center
  // cards above (those are current-state counts) - except campaign/source,
  // which DO meaningfully scope the live cards too, so those two also reload
  // getDashboardCards.
  const [fCampaign, setFCampaign] = useState<string[]>([]);
  const [fSource, setFSource] = useState<string[]>([]);
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [dateRange, setDateRange] = useState("all");

  useEffect(() => {
    api.listCampaigns().then((c) => setCampaigns(c || [])).catch(() => {});
  }, []);
  useEffect(() => {
    const campaign_id = fCampaign.length ? fCampaign.join(",") : undefined;
    const source = fSource.length ? fSource.join(",") : undefined;
    // Fall back to zeros (not an endless skeleton) if the endpoint isn't deployed yet.
    api.getDashboardCards({ campaign_id, source }).then(setCards).catch(() => setCards({ open: 0, hot: 0, unreplied: 0, unread: 0 }));
  }, [fCampaign, fSource]);
  useEffect(() => {
    // analyticsDone gates the Purchased/Lost cards: skeleton only WHILE loading,
    // then fall back to 0 on failure so they never spin forever.
    api.getAnalytics({
      campaign_id: fCampaign.length ? fCampaign.join(",") : undefined,
      source: fSource.length ? fSource.join(",") : undefined,
      from: fFrom || undefined, to: fTo || undefined,
    }).then(setAnalytics).catch((e) => console.error('[agent-analytics]', e)).finally(() => setAnalyticsDone(true));
  }, [fCampaign, fSource, fFrom, fTo]);
  const funnel = analytics?.funnel;

  return (
    <div className="p-4">
      {/* Filters - same controls as the manager Overview. */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <FilterIcon className="w-4 h-4 text-muted-foreground" />
        <MultiSelect value={fCampaign} onChange={setFCampaign} placeholder="All campaigns" className="w-[180px]"
          options={campaigns.map((c) => ({ value: c.id, label: c.name }))} />
        <MultiSelect value={fSource} onChange={setFSource} placeholder="All sources" className="w-[160px]"
          options={SOURCE_OPTIONS} />
        <DateRangeFilter value={{ preset: dateRange, from: fFrom, to: fTo }}
          onChange={(v) => { setDateRange(v.preset); setFFrom(v.from); setFTo(v.to); }} />
        {(fCampaign.length || fSource.length || dateRange !== "all") && (
          <button onClick={() => { setFCampaign([]); setFSource([]); setFFrom(""); setFTo(""); setDateRange("all"); }} className="text-[12px] font-semibold text-primary hover:underline outline-none">Clear</button>
        )}
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        {AGENT_CARDS.map((c) => {
          const v = c.key === "purchase" ? (funnel?.won ?? (analyticsDone ? 0 : null))
            : c.key === "lost" ? (analytics?.lost ?? (analyticsDone ? 0 : null))
            : cards ? ((cards as any)[c.key] as number) : null;
          const body = (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg grid place-items-center" style={{ backgroundColor: c.color + "14" }}>
                  <c.Icon className="w-5 h-5" style={{ color: c.color }} />
                </div>
                {c.href && <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />}
              </div>
              {v === null
                ? <div className="skeleton rounded h-7 w-12" />
                : <p className="text-[28px] font-extrabold text-foreground leading-none tabular-nums">{v}</p>}
              <p className="text-[13px] font-bold text-foreground mt-2">{c.label}</p>
              <p className="text-[11px] text-muted-foreground">{c.sub}</p>
            </>
          );
          const cls = "group bg-card rounded-lg border border-border shadow-xs p-4 hover:shadow-md hover:border-primary/30 transition-all";
          return c.href
            ? <Link key={c.key} href={c.href} className={cls}>{body}</Link>
            : <div key={c.key} className={cls}>{body}</div>;
        })}
      </div>

      {/* Personal activity */}
      <Card title="Your activity" subtitle={fFrom || fTo ? `${fFrom || "start"} to ${fTo || "now"}` : "All time"} className="mb-4">
        <div className="px-4 py-4"><OverviewChart data={buildChartData(analytics, true)} /></div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Your stages" subtitle="Leads by pipeline stage">
          <StageSplit stages={analytics?.stages} lost={analytics?.funnel?.lost} />
        </Card>
        <Card title="Interest level" subtitle="Buying intent split">
          <InterestSplit funnel={funnel} />
        </Card>
      </div>

      {/* Lost analysis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Card title="Lost analysis" icon={TrendingDown} iconColor="#EF4444">
          <div className="p-4">
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-4xl font-extrabold text-[#EF4444] leading-none tabular-nums">{analytics?.lost ?? 0}</span>
              <span className="text-sm text-muted-foreground font-medium">total lost leads</span>
              {(analytics?.junk ?? 0) > 0 && (
                <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-semibold tabular-nums">
                  <Ban className="w-3 h-3" />{analytics!.junk} spam
                </span>
              )}
            </div>
            {funnel && (
              <div className="flex gap-3">
                <div className="flex-1 p-3 rounded-lg bg-red-50 text-center">
                  <p className="text-xl font-extrabold text-[#EF4444] tabular-nums">{funnel.total > 0 ? Math.round(((analytics?.lost ?? 0) / funnel.total) * 100) : 0}%</p>
                  <p className="text-xs text-[#991B1B] font-semibold">Loss rate</p>
                </div>
                <div className="flex-1 p-3 rounded-lg bg-green-50 text-center">
                  <p className="text-xl font-extrabold text-[#059669] tabular-nums">{funnel.total > 0 ? Math.round(((funnel.won ?? 0) / funnel.total) * 100) : 0}%</p>
                  <p className="text-xs text-[#065F46] font-semibold">Purchase rate</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card title="Lost reasons">
          <div className="p-4">
            {(analytics?.lost_reasons && analytics.lost_reasons.length > 0) ? (
              analytics.lost_reasons.map((r, i) => {
                const maxCount = Math.max(...analytics.lost_reasons!.map((x) => x.count), 1);
                return (
                  <Link key={r.reason} href={`/inbox?lost_reason=${encodeURIComponent(r.reason)}`}
                    className="block mb-4 last:mb-0 -mx-1.5 px-1.5 py-1 rounded-md hover:bg-muted/50 transition-colors group/lr">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-foreground/80 group-hover/lr:text-foreground">{lostReasonLabel(r.reason)}</span>
                      <span className="text-sm font-bold text-[#EF4444] tabular-nums">{r.count}</span>
                    </div>
                    <ProgressBar value={(r.count / maxCount) * 100} color={i === 0 ? "#EF4444" : i === 1 ? "#F97316" : "#FBBF24"} height={6} />
                  </Link>
                );
              })
            ) : (
              <div className="py-8 text-center"><p className="text-sm text-muted-foreground">No lost reason data available</p></div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const role = getUser()?.role;
  if (role === "agent") return <AgentDashboard />;
  return <ManagerDashboard />;
}

function ManagerDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [tab, setTab] = useState<"overview" | "marketing" | "creatives">("overview");
  // Persist the active view in the URL (?tab=ads|creatives) so a reload stays put.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "ads" || t === "marketing") setTab("marketing");
    else if (t === "creatives") setTab("creatives");
  }, []);
  const selectTab = useCallback((t: "overview" | "marketing" | "creatives") => {
    setTab(t);
    const sp = new URLSearchParams(window.location.search);
    if (t === "marketing") sp.set("tab", "ads");
    else if (t === "creatives") sp.set("tab", "creatives");
    else sp.delete("tab");
    const qs = sp.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, []);
  const [fChannel, setFChannel] = useState<string[]>([]);
  const [fCampaign, setFCampaign] = useState<string[]>([]);
  const [fAgent, setFAgent] = useState<string[]>([]);
  const [fSource, setFSource] = useState<string[]>([]);
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [agentList, setAgentList] = useState<Agent[]>([]);
  const [railCollapsed, setRailCollapsed] = useState(false); // hide/show the reports rail

  useEffect(() => {
    api.listChannels().then((c) => setChannels(c || [])).catch(() => {});
    api.listCampaigns().then((c) => setCampaigns(c || [])).catch(() => {});
    api.listAgents().then((a) => setAgentList(a || [])).catch(() => {});
  }, []);
  // Refs for current filter values (used by the WS debounce handler)
  const filtersRef = useRef({ fChannel, fCampaign, fAgent, fSource, fFrom, fTo });
  filtersRef.current = { fChannel, fCampaign, fAgent, fSource, fFrom, fTo };

  // Carry the active filters into a KPI card's inbox link so the inbox opens
  // matching the card's count. Source/date have no inbox equivalent, so skip them.
  const cardFilterQS = [
    fCampaign.length ? `campaign=${fCampaign.join(",")}` : "",
    fAgent.length ? `agent=${fAgent.join(",")}` : "",
    fChannel.length ? `channel=${fChannel.join(",")}` : "",
    fSource.length ? `source=${fSource.join(",")}` : "",
    fFrom ? `from=${fFrom}` : "",
    fTo ? `to=${fTo}` : "",
  ].filter(Boolean).join("&");
  const metricHref = (h: string) => cardFilterQS ? `${h}${h.includes("?") ? "&" : "?"}${cardFilterQS}` : h;

  const reloadReports = useCallback(() => {
    const { fChannel, fCampaign, fAgent, fSource, fFrom, fTo } = filtersRef.current;
    const f = {
      campaign_id: fCampaign.length ? fCampaign.join(",") : undefined,
      channel_id: fChannel.length ? fChannel.join(",") : undefined,
      agent_id: fAgent.length ? fAgent.join(",") : undefined,
      source: fSource.length ? fSource.join(",") : undefined,
      from: fFrom || undefined, to: fTo || undefined,
    };
    api.getStats(f).then(setStats).catch((e) => console.error('[mgr-stats]', e));
    api.getAnalytics(f).then(setAnalytics).catch((e) => console.error('[mgr-analytics]', e));
  }, []);

  useEffect(() => {
    reloadReports();
  }, [fChannel, fCampaign, fAgent, fSource, fFrom, fTo, reloadReports]);

  // Auto-refresh on WebSocket events (debounced)
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const handler = () => { clearTimeout(timer); timer = setTimeout(reloadReports, 3000); };
    window.addEventListener("ws_message", handler);
    return () => { window.removeEventListener("ws_message", handler); clearTimeout(timer); };
  }, [reloadReports]);

  // Shift+C hides/shows the reports rail (unless typing in a field) — same as Settings.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.shiftKey && (e.key === "C" || e.key === "c") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setRailCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!stats) return (
    <div className="p-4">
      <Skeleton className="h-20 mb-4" />
      <Skeleton className="h-[300px]" />
    </div>
  );

  const funnel = analytics?.funnel;
  const agents = analytics?.agents || [];
  const chartData = buildChartData(analytics, true); // all days; bounded by the date filter when applied

  const reportNav = [{ key: "overview" as const, label: "Overview" }, { key: "marketing" as const, label: "Ads Report" }, { key: "creatives" as const, label: "Creative Insights" }];

  return (
    <div className="relative flex flex-col lg:flex-row h-full min-h-0">
      {/* Report rail (Settings-style, text-only). Width animates so it slides to a
          thin strip when hidden; a floating tab reopens it. */}
      <aside className={cn(
        "max-lg:hidden shrink-0 border-r border-border bg-card overflow-hidden transition-[width] duration-300 ease-in-out",
        railCollapsed ? "w-4" : "w-[210px]",
      )}>
        <div className={cn("w-[210px] h-full flex flex-col transition-opacity duration-200", railCollapsed && "opacity-0")}>
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <p className="px-3 pt-1 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">Reports</p>
            <nav className="flex flex-col gap-1">
              {reportNav.map(({ key, label }) => (
                <button key={key} onClick={() => selectTab(key)}
                  className={cn("block w-full text-left rounded-md px-3 py-2 text-[13px] whitespace-nowrap outline-none transition-colors",
                    tab === key ? "bg-muted text-foreground font-semibold" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
                  {label}
                </button>
              ))}
            </nav>
          </div>
          <div className="shrink-0 border-t border-border p-2 flex justify-end">
            <Tip label="Hide reports (shift + C)" side="top">
              <button onClick={() => setRailCollapsed(true)} aria-label="Collapse reports menu"
                className="p-1.5 rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary hover:scale-110 outline-none transition-all duration-200">
                <ChevronsLeft className="w-[18px] h-[18px]" />
              </button>
            </Tip>
          </div>
        </div>
      </aside>

      {/* Mobile: horizontal chip strip */}
      <div className="lg:hidden shrink-0 border-b border-border bg-card overflow-x-auto">
        <div className="flex items-center gap-1 px-3 py-2 w-max">
          {reportNav.map(({ key, label }) => (
            <button key={key} onClick={() => selectTab(key)}
              className={cn("inline-flex items-center px-3.5 h-9 rounded-full text-[13px] whitespace-nowrap outline-none transition-colors",
                tab === key ? "bg-primary/[0.12] text-primary font-semibold" : "text-muted-foreground hover:bg-muted font-medium")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Floating expand tab attached to the thin strip (layer 2) when collapsed */}
      <div className={cn("max-lg:hidden absolute left-4 bottom-3 z-20 transition-opacity duration-200",
        railCollapsed ? "opacity-100" : "opacity-0 pointer-events-none")}>
        <Tip label="Show reports (shift + C)" side="right">
          <button onClick={() => setRailCollapsed(false)} aria-label="Expand reports menu"
            className="flex items-center justify-center h-9 w-6 hover:w-9 rounded-r-full border border-l-0 border-border bg-card shadow-md text-muted-foreground hover:text-primary transition-all duration-200 outline-none">
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        </Tip>
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto">

      {tab === "marketing" ? <MarketingAnalytics /> : tab === "creatives" ? <CreativeReport /> : (
      <div className="p-4">
        {/* â”€â”€ Filters â”€â”€ */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <FilterIcon className="w-4 h-4 text-muted-foreground" />
          <MultiSelect value={fChannel} onChange={setFChannel} placeholder="All channels" className="w-[160px]"
            options={channels.map((c) => ({ value: c.id, label: c.name }))} />
          <MultiSelect value={fCampaign} onChange={setFCampaign} placeholder="All campaigns" className="w-[180px]"
            options={campaigns.map((c) => ({ value: c.id, label: c.name }))} />
          <MultiSelect value={fAgent} onChange={setFAgent} placeholder="All agents" className="w-[160px]"
            options={agentList.map((a) => ({ value: a.id, label: a.full_name }))} />
          <MultiSelect value={fSource} onChange={setFSource} placeholder="All sources" className="w-[160px]"
            options={SOURCE_OPTIONS} />
          <DateRangeFilter value={{ preset: dateRange, from: fFrom, to: fTo }}
            onChange={(v) => { setDateRange(v.preset); setFFrom(v.from); setFTo(v.to); }} />
          {(fChannel.length || fCampaign.length || fAgent.length || fSource.length || dateRange !== "all") && (
            <button onClick={() => { setFChannel([]); setFCampaign([]); setFAgent([]); setFSource([]); setFFrom(""); setFTo(""); setDateRange("all"); }} className="text-[12px] font-semibold text-primary hover:underline outline-none">Clear</button>
          )}
        </div>

        {/* â”€â”€ Metric Strip â”€â”€ */}
        <div className="flex flex-wrap bg-card rounded-lg border border-border shadow-xs mb-5 overflow-hidden">
          {METRICS.map((m, i) => {
            let val: number;
            if (m.key === "total_leads") val = analytics?.funnel?.total ?? 0;
            else if (m.key === "replied") val = analytics?.funnel?.replied ?? 0;
            else if (m.key === "won") val = analytics?.funnel?.won ?? 0;
            else if (m.key === "avg_rt") val = analytics?.response_time?.avg_min ?? 0;
            else val = (stats as any)[m.key] ?? 0;
            const Icon = m.Icon;

            const inner = (
              <>
                <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0" style={{ backgroundColor: m.color + "14" }}>
                  <Icon className="w-[18px] h-[18px]" style={{ color: m.color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-tight truncate flex items-center gap-1">
                    {m.label}
                    {m.href && <ChevronRight className="w-3 h-3 opacity-0 group-hover/metric:opacity-100 transition-opacity shrink-0" />}
                  </p>
                  <p className="text-[22px] font-extrabold text-foreground leading-none tracking-tight tabular-nums mt-1 whitespace-nowrap">{m.fmt ? m.fmt(val) : val}</p>
                </div>
              </>
            );

            const base = cn(
              "group/metric flex-1 min-w-[150px] flex items-center gap-3 px-4 py-3.5 transition-colors",
              i < METRICS.length - 1 && "border-r border-border",
              m.href ? "hover:bg-primary/[0.04] cursor-pointer" : "",
            );

            return m.href
              ? <Link key={m.key} href={metricHref(m.href)} className={base}>{inner}</Link>
              : <div key={m.key} className={base}>{inner}</div>;
          })}
        </div>

        {/* â”€â”€ Area Chart (real, last 7 days) â”€â”€ */}
        <Card title="Overview" subtitle={fFrom || fTo ? `${fFrom || "start"} to ${fTo || "now"}` : "All time"} className="mb-5">
          <div className="px-4 py-4"><OverviewChart data={chartData} /></div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          {/* Stage breakdown - leads per stage incl. Lost pinned at the bottom */}
          <Card title="Stage breakdown" subtitle="Leads by pipeline stage">
            <StageSplit stages={analytics?.stages} lost={analytics?.funnel?.lost} />
          </Card>

          {/* Interest Level - clickable rows deep-link to filtered inbox */}
          <Card title="Interest level">
            <InterestSplit funnel={funnel} />
          </Card>
        </div>

        {/* Agent performance - activity + pipeline, per agent x branch */}
        <PerfTables label="Agent" showBranch rows={agents.map((a) => ({
          name: a.agent, branch: a.branch, leads: a.leads, total_chat: a.total_chat, replied: a.replied,
          avg_rt_min: a.avg_rt_min, avg_resp_min: a.avg_resp_min, within_5_pct: a.within_5_pct,
          call_attempts: a.call_attempts, call_duration_sec: a.call_duration_sec,
          updated: a.updated, contacted: a.contacted, qualified: a.qualified, appointment: a.appointment, negotiation: a.negotiation, purchase: a.purchase, lost: a.lost,
        }))} />

        {/* Lost Analysis */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          <Card title="Lost analysis" icon={TrendingDown} iconColor="#EF4444">
            <div className="p-4">
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-4xl font-extrabold text-[#EF4444] leading-none tabular-nums">
                  {analytics?.lost ?? stats?.lost ?? 0}
                </span>
                <span className="text-sm text-muted-foreground font-medium">total lost leads</span>
                {(analytics?.junk ?? 0) > 0 && (
                  <span title="Spam / junk leads, counted separately so they never inflate the loss rate" className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-semibold tabular-nums">
                    <Ban className="w-3 h-3" />{analytics!.junk} spam
                  </span>
                )}
              </div>
              {funnel && (
                <div className="flex gap-3">
                  <div className="flex-1 p-3 rounded-lg bg-red-50 text-center">
                    <p className="text-xl font-extrabold text-[#EF4444] tabular-nums">
                      {funnel.total > 0 ? Math.round(((analytics?.lost ?? 0) / funnel.total) * 100) : 0}%
                    </p>
                    <p className="text-xs text-[#991B1B] font-semibold">Loss rate</p>
                  </div>
                  <div className="flex-1 p-3 rounded-lg bg-green-50 text-center">
                    <p className="text-xl font-extrabold text-[#059669] tabular-nums">
                      {funnel.total > 0 ? Math.round(((funnel.won ?? 0) / funnel.total) * 100) : 0}%
                    </p>
                    <p className="text-xs text-[#065F46] font-semibold">Purchase rate</p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card title="Lost reasons">
            <div className="p-4">
              {(analytics?.lost_reasons && analytics.lost_reasons.length > 0) ? (
                analytics.lost_reasons.map((r, i) => {
                  const maxCount = Math.max(...analytics.lost_reasons!.map(x => x.count), 1);
                  return (
                    <Link key={r.reason} href={`/inbox?lost_reason=${encodeURIComponent(r.reason)}`}
                      className="block mb-4 last:mb-0 -mx-1.5 px-1.5 py-1 rounded-md hover:bg-muted/50 transition-colors group/lr">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-foreground/80 group-hover/lr:text-foreground">{lostReasonLabel(r.reason)}</span>
                        <span className="text-sm font-bold text-[#EF4444] tabular-nums">{r.count}</span>
                      </div>
                      <ProgressBar value={(r.count / maxCount) * 100} color={i === 0 ? "#EF4444" : i === 1 ? "#F97316" : "#FBBF24"} height={6} />
                    </Link>
                  );
                })
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">No lost reason data available</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
      )}
      </div>
    </div>
  );
}

// â”€â”€ Shared agent / campaign performance: two tables (activity + pipeline) â”€â”€â”€â”€â”€â”€
type PerfRow = {
  name: string; branch?: string; leads: number; total_chat: number; replied: number;
  avg_rt_min: number; avg_resp_min: number; within_5_pct: number;
  call_attempts: number; call_duration_sec: number;
  updated: number; contacted: number; qualified: number; appointment: number; negotiation: number; purchase: number; lost: number;
};
const TH2 = ({ children, right }: { children: React.ReactNode; right?: boolean }) =>
  <th className={cn("px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap", right ? "text-right" : "text-left")}>{children}</th>;
const pctOf = (n: number, d: number) => d > 0 ? `${Math.round((n / d) * 100)}%` : "-";

function PerfTables({ rows, label, showBranch }: { rows: PerfRow[]; label: string; showBranch?: boolean }) {
  if (rows.length === 0) return <Card title={`${label} performance`}><div className="py-12 text-center text-sm text-muted-foreground">No data yet</div></Card>;
  return (
    <div className="space-y-4">
      <Card title={`${label} activity and SLA`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/40">
              <TH2>{label}</TH2>{showBranch && <TH2>Branch</TH2>}
              <TH2 right>Leads</TH2><TH2 right>Handled</TH2><TH2 right>Avg 1st resp</TH2><TH2 right>Avg resp</TH2><TH2 right>Within 5m</TH2><TH2 right>Total chat</TH2><TH2 right>Call attempts</TH2><TH2 right>Call duration</TH2>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/60 hover:bg-muted/40">
                  <td className="px-3 py-2.5 font-semibold text-foreground whitespace-nowrap">{r.name}</td>
                  {showBranch && <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.branch || "-"}</td>}
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.leads}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.replied}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.avg_rt_min > 0 ? fmtDuration(r.avg_rt_min) : "-"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.avg_resp_min > 0 ? fmtDuration(r.avg_resp_min) : "-"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{Math.round(r.within_5_pct)}%</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.total_chat}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.call_attempts}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtDuration(r.call_duration_sec / 60)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title={`${label} pipeline`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/40">
              <TH2>{label}</TH2>{showBranch && <TH2>Branch</TH2>}
              <TH2 right>Leads</TH2><TH2 right>Updated</TH2><TH2 right>% Updated</TH2><TH2 right>Contacted</TH2><TH2 right>Qualified</TH2><TH2 right>Appointment</TH2><TH2 right>Negotiation</TH2><TH2 right>Purchase</TH2><TH2 right>% Purchase</TH2><TH2 right>Lost</TH2>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/60 hover:bg-muted/40">
                  <td className="px-3 py-2.5 font-semibold text-foreground whitespace-nowrap">{r.name}</td>
                  {showBranch && <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.branch || "-"}</td>}
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.leads}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.updated}</td>
                  <td className="px-3 py-2.5 text-right"><Badge label={pctOf(r.updated, r.leads)} bg="#EEF2FF" text="#4338CA" /></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.contacted}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.qualified}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.appointment}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.negotiation}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-[#16A34A] tabular-nums">{r.purchase}</td>
                  <td className="px-3 py-2.5 text-right"><Badge label={pctOf(r.purchase, r.leads)} bg="#E8F5E9" text="#2E7D32" /></td>
                  <td className={cn("px-3 py-2.5 text-right font-bold tabular-nums", r.lost > 0 ? "text-[#EF4444]" : "text-muted-foreground")}>{r.lost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// â”€â”€ Marketing ROI sub-tab: ad spend tied to leads (chats) -> conversions â”€â”€â”€â”€â”€â”€
const fmtMoney = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtInt = (n: number) => Math.round(n || 0).toLocaleString();

const DONUT_COLORS = ["#6366F1", "#F97316", "#A5B4FC", "#EAE2D6", "#111827", "#C9A98A", "#8B5E34", "#14B8A6"];

// Demographic donut (age / gender), shown by results, falling back to
// impressions when there are no results yet.
function BreakdownDonut({ title, data }: { title: string; data?: AdBreakdown[] }) {
  const rows = (data || []).filter((r) => (r.value || "").toLowerCase() !== "unknown");
  const sum = (k: "reach" | "impressions" | "results") => rows.reduce((a, b) => a + (b[k] || 0), 0);
  // Meta "results" is sparse/unreliable for click-to-WhatsApp, so demographics
  // are shown by reach (unique people) - a real audience distribution - falling
  // back to impressions, then results. One metric drives the whole chart.
  const metric: "reach" | "impressions" | "results" =
    sum("reach") > 0 ? "reach" : sum("impressions") > 0 ? "impressions" : "results";
  const label = metric === "reach" ? "By reach" : metric === "impressions" ? "By impressions" : "By results";
  const total = sum(metric);
  const chart = rows
    .map((b, i) => ({ name: b.value, value: b[metric] || 0, color: DONUT_COLORS[i % DONUT_COLORS.length] }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  return (
    <Card title={title} subtitle={label}>
      {chart.length === 0 ? (
        <div className="h-[220px] grid place-items-center text-sm text-muted-foreground">No demographic data yet</div>
      ) : (
        <div className="p-4 flex items-center gap-4">
          <div className="w-[45%] shrink-0">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={chart} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2} stroke="none">
                  {chart.map((c) => <Cell key={c.name} fill={c.color} />)}
                </Pie>
                <RechartsTooltip content={<DonutTooltip total={total} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
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
    </Card>
  );
}

// Location performance: ranks the regions (provinces) that drove the most leads,
// with a heat bar per row. Meta ad insights only expose geography down to the
// region level (province/state) outside the US, so this is province-granular.
function LocationPerformance({ data, currency }: { data?: AdBreakdown[]; currency: string }) {
  const money = (n: number) => `${currency ? currency + " " : ""}${fmtMoney(n)}`;
  const rows = (data || []).filter((r) => (r.value || "").toLowerCase() !== "unknown");
  const sum = (k: "results" | "spend" | "impressions") => rows.reduce((a, b) => a + (b[k] || 0), 0);
  // Rank + %, bar and trailing number all use ONE metric so the share always
  // matches the value shown. Prefer real leads, then spend, then reach.
  const metric: "results" | "spend" | "impressions" =
    sum("results") > 0 ? "results" : sum("spend") > 0 ? "spend" : "impressions";
  const isMoney = metric === "spend";
  const label = metric === "results" ? "Leads by province" : metric === "spend" ? "Ad spend by province" : "Reach by province";
  const total = sum(metric);
  const ranked = rows
    .map((b) => ({ name: b.value, value: b[metric] || 0 }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
  const max = ranked.length ? ranked[0].value : 0;
  return (
    <Card title="Top locations" subtitle={label} className="mt-5 mb-5">
      {ranked.length === 0 ? (
        <div className="h-[200px] grid place-items-center text-sm text-muted-foreground flex-col gap-2">
          <MapPin className="w-6 h-6 text-muted-foreground/40" />
          No location data yet
        </div>
      ) : (
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <div className="min-w-0">
            <IndonesiaMap points={ranked} isMoney={isMoney} money={money} />
          </div>
          <div className="space-y-2.5">
          {ranked.map((r, i) => {
            const share = total > 0 ? (r.value / total) * 100 : 0;
            const barW = max > 0 ? (r.value / max) * 100 : 0;
            return (
              <div key={r.name} className="flex items-center gap-3">
                <span className={cn("shrink-0 grid place-items-center w-6 h-6 rounded-md text-[11px] font-bold",
                  i === 0 ? "bg-primary text-white" : i < 3 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>{i + 1}</span>
                <div className="flex items-center gap-1.5 w-[150px] shrink-0 min-w-0">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                  <span className="truncate text-[13px] font-medium text-foreground/90 capitalize">{r.name}</span>
                </div>
                <div className="flex-1 h-2.5 rounded-full bg-muted/60 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all" style={{ width: `${barW}%` }} />
                </div>
                <span className="w-12 text-right tabular-nums text-[12px] font-semibold text-foreground shrink-0">{share.toFixed(1)}%</span>
                <span className="w-16 text-right tabular-nums text-[12px] text-muted-foreground shrink-0 hidden sm:inline">{isMoney ? money(r.value) : fmtInt(r.value)}</span>
              </div>
            );
          })}
          </div>
        </div>
      )}
    </Card>
  );
}

function MarketingAnalytics() {
  // Same date filter as the Overview tab (preset keys + custom range).
  const [dateRange, setDateRange] = useState("30d");
  const [fFrom, setFFrom] = useState(() => presetRange("30d").from);
  const [fTo, setFTo] = useState(() => presetRange("30d").to);
  const [campaignFilter, setCampaignFilter] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [accountFilter, setAccountFilter] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name?: string | null }[]>([]);
  const [perf, setPerf] = useState<AdPerformance | null>(null);
  const [prevPerf, setPrevPerf] = useState<AdPerformance | null>(null); // prior equal-length window, for "vs last period" deltas
  const [keywords, setKeywords] = useState<AdKeyword[]>([]);
  const [kwRefreshing, setKwRefreshing] = useState(false);
  const [showImpr, setShowImpr] = useState(true); // Campaign Performance series toggles
  const [showClk, setShowClk] = useState(true);
  const [camps, setCamps] = useState<Campaign[]>([]);
  const [ga4, setGa4] = useState<Ga4Report | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [currency, setCurrency] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [hasAccounts, setHasAccounts] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { from, to } = dateRange === "custom" ? { from: fFrom, to: fTo } : presetRange(dateRange);
    let alive = true;
    // Prior equal-length window (for the "vs last N days" trend deltas). Skipped
    // for the all-time range, where there is no meaningful baseline to compare to.
    const pr = prevRange(from, to);
    const prevReq = pr
      ? api.adPerformance(pr.from, pr.to, campaignFilter.length ? campaignFilter : undefined, sourceFilter.length ? sourceFilter : undefined, accountFilter.length ? accountFilter : undefined).catch(() => null)
      : Promise.resolve(null);
    Promise.all([
      api.adPerformance(from || undefined, to || undefined, campaignFilter.length ? campaignFilter : undefined, sourceFilter.length ? sourceFilter : undefined, accountFilter.length ? accountFilter : undefined).catch(() => null),
      api.listAdAccounts().catch(() => []),
      api.adKeywords(from || undefined, to || undefined).catch(() => []),
      api.listCampaigns().catch(() => []),
      api.getOrgGa4(from || undefined, to || undefined).catch(() => null),
      prevReq,
    ]).then(([p, accts, kws, cps, g, pp]) => {
      if (!alive) return;
      setPerf(p as AdPerformance | null);
      setPrevPerf(pp as AdPerformance | null);
      setKeywords((kws as AdKeyword[]) || []);
      setCamps((cps as Campaign[]) || []);
      setGa4(g as Ga4Report | null);
      const a = (accts as { id: string; name?: string | null; currency?: string | null; platform?: string | null }[]) || [];
      setAccounts(a);
      setHasAccounts(a.length > 0);
      setCurrency(a.find((x) => x.currency)?.currency || "");
      setPlatforms(Array.from(new Set(a.map((x) => (x.platform || "").toLowerCase()).filter(Boolean))));
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // Refetch on filter change; keep the previous view visible during refetch.
  }, [dateRange, fFrom, fTo, campaignFilter, sourceFilter, accountFilter]);

  const PLATFORM_LABELS: Record<string, string> = { meta: "Meta Ads", google: "Google Ads", tiktok: "TikTok Ads" };
  // Source options come from connected platforms AND any ad platform actually
  // present in the report (so the filter shows even with a single account).
  const sourceOptions = useMemo(() => {
    const set = new Map<string, string>();
    platforms.forEach((p) => set.set(p, PLATFORM_LABELS[p] || p));
    (perf?.sources || []).forEach((s) => {
      const p = s.source.replace(/_ads$/, "");
      if (p === "meta" || p === "tiktok" || p === "google") set.set(p, s.label);
    });
    return Array.from(set, ([value, label]) => ({ value, label }));
  }, [platforms, perf]);

  const campaigns = perf?.campaigns || [];
  const campaignOptions = useMemo(() => campaigns.map((c) => ({ value: c.campaign_id, label: c.campaign_name })), [campaigns]);
  const accountOptions = useMemo(() => accounts.map((a) => ({ value: a.id, label: a.name || "Ad account" })), [accounts]);
  const shown = campaignFilter.length ? campaigns.filter((c) => campaignFilter.includes(c.campaign_id)) : campaigns;
  // Leads/sales are attributed via conversations (the per-campaign rollup).
  const t0 = shown.reduce((a, c) => ({
    spend: a.spend + c.spend, leads: a.leads + c.leads, sales: a.sales + c.sales,
    clicks: a.clicks + c.clicks, impressions: a.impressions + c.impressions, results: a.results + c.results,
  }), { spend: 0, leads: 0, sales: 0, clicks: 0, impressions: 0, results: 0 });
  // Ad-delivery metrics (spend/impressions/clicks) come straight from the daily
  // ad_metrics, which are NOT gated on the ad->campaign mapping. So the Ad spend
  // card + funnel show the real numbers (matching the Source table) even before
  // any ad campaign is mapped to one of our campaigns. The daily query is scoped
  // by the same date/campaign/source/account filters, so this stays in sync.
  const adDelivery = (perf?.daily || []).reduce((a, d) => ({
    impressions: a.impressions + (d.impressions || 0), clicks: a.clicks + (d.clicks || 0), spend: a.spend + (d.spend || 0),
  }), { impressions: 0, clicks: 0, spend: 0 });
  const t = { ...t0, impressions: adDelivery.impressions, clicks: adDelivery.clicks, spend: adDelivery.spend };
  // Grand total for the Source table = sum of its own rows (the table always
  // shows every source; it's the cross-filter control, so its footer stays full).
  const srcTotals = (perf?.sources || []).reduce((a, s) => ({
    impressions: a.impressions + s.impressions, clicks: a.clicks + s.clicks, leads: a.leads + s.leads, purchases: a.purchases + s.purchases, spend: a.spend + s.spend,
  }), { impressions: 0, clicks: 0, leads: 0, purchases: 0, spend: 0 });
  const cpl = t.leads > 0 ? t.spend / t.leads : 0;
  const cpa = t.sales > 0 ? t.spend / t.sales : 0;
  const convRate = t.leads > 0 ? (t.sales / t.leads) * 100 : 0;
  const money = (n: number) => `${currency ? currency + " " : ""}${fmtMoney(n)}`;
  const creatives = perf?.creatives || [];
  const hasSpend = hasAccounts && (campaigns.length > 0 || adDelivery.impressions > 0);

  // Empty only when there is neither ad spend data nor any ad-attributed lead
  // for the selected range. Rendered INLINE (below the toolbar) so the date
  // filter stays reachable — picking an empty range must not trap the user.
  const isEmpty = !hasSpend && creatives.length === 0;

  const ctrPct = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;

  const daily = (perf?.daily || []).map((d) => {
    const dt = new Date(d.date);
    return {
      date: isNaN(dt.getTime()) ? d.date : `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`,
      spend: d.spend || 0, impressions: d.impressions || 0, reach: d.reach || 0, clicks: d.clicks || 0, leads: d.leads || 0, sales: d.sales || 0,
    };
  }).reverse(); // chart reads left (oldest) -> right (newest)

  // Clicks vs Impressions per day (log line needs positive values -> null for 0).
  const dailyLog = daily.map((d) => ({ date: d.date, impressions: d.impressions > 0 ? d.impressions : null, clicks: d.clicks > 0 ? d.clicks : null }));

  // ── Trend baselines: the prior equal-length window ("vs last N days"). ──
  const prev = prevPerf ? adTotals(prevPerf, campaignFilter) : null;
  const hasPrev = prev != null;
  const rangeDays = (() => {
    const { from, to } = dateRange === "custom" ? { from: fFrom, to: fTo } : presetRange(dateRange);
    if (!from || !to) return 0;
    const f = new Date(from + "T00:00:00"), tt = new Date(to + "T00:00:00");
    return isNaN(f.getTime()) || isNaN(tt.getTime()) ? 0 : Math.round((tt.getTime() - f.getTime()) / 86400000) + 1;
  })();
  const cmpLabel = rangeDays > 0 ? `vs last ${rangeDays} days` : "vs previous period";

  // KPI sparkline series (daily runs oldest -> newest).
  const sSpend = daily.map((d) => d.spend);
  const sLeads = daily.map((d) => d.leads);
  const sCpl = daily.map((d) => (d.leads > 0 ? d.spend / d.leads : 0));
  const sSales = daily.map((d) => d.sales);
  const sCpa = daily.map((d) => (d.sales > 0 ? d.spend / d.sales : 0));
  const sL2p = daily.map((d) => (d.leads > 0 ? (d.sales / d.leads) * 100 : 0));
  const prevCpl = prev && prev.leads > 0 ? prev.spend / prev.leads : 0;
  const prevCpa = prev && prev.sales > 0 ? prev.spend / prev.sales : 0;
  const prevL2p = prev && prev.leads > 0 ? (prev.sales / prev.leads) * 100 : 0;

  // KPI cards: value + sparkline + delta vs the prior window. `higher` picks the
  // favourable direction (null = neutral, e.g. spend, where up/down is not a verdict).
  const roiCards = [
    { label: "Ad spend", value: money(t.spend), Icon: CircleDollarSign, color: "#F59E0B", series: sSpend, cur: t.spend, prev: prev?.spend ?? 0, higher: null as boolean | null },
    { label: "Leads", value: fmtInt(t.leads), Icon: MessageSquare, color: "#2D8B73", series: sLeads, cur: t.leads, prev: prev?.leads ?? 0, higher: true },
    { label: "Cost / lead", value: money(cpl), Icon: Target, color: "#6366F1", series: sCpl, cur: cpl, prev: prevCpl, higher: false },
    { label: "Conversions", value: fmtInt(t.sales), Icon: Trophy, color: "#059669", series: sSales, cur: t.sales, prev: prev?.sales ?? 0, higher: true },
    { label: "Cost / conversion", value: money(cpa), Icon: CircleDollarSign, color: "#0EA5E9", series: sCpa, cur: cpa, prev: prevCpa, higher: false },
    { label: "Lead to purchase", value: `${convRate.toFixed(1)}%`, Icon: Target, color: "#EF4444", series: sL2p, cur: convRate, prev: prevL2p, higher: true },
  ];

  // Funnel steps Impressions -> Clicks -> CTR -> Leads -> Purchases. Right-side pill
  // = conversion from the previous count step; footer = impression -> purchase.
  const funnelSteps = [
    { label: "Impressions", value: fmtInt(t.impressions), rate: 100, Icon: Eye },
    { label: "Clicks", value: fmtInt(t.clicks), rate: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0, Icon: MousePointerClick },
    { label: "CTR", value: `${ctrPct.toFixed(2)}%`, rate: ctrPct, Icon: Percent },
    { label: "Leads", value: fmtInt(t.leads), rate: t.clicks > 0 ? (t.leads / t.clicks) * 100 : 0, Icon: Users },
    { label: "Purchases", value: fmtInt(t.sales), rate: t.leads > 0 ? (t.sales / t.leads) * 100 : 0, Icon: ShoppingCart },
  ];
  const FUNNEL_W = [1.0, 0.90, 0.80, 0.70, 0.60, 0.50]; // top width fraction per step + final tip (gentle funnel)
  const FUNNEL_RAMP = ["#1E5C4C", "#26735F", "#2D8B73", "#3F9D84", "#5FB89E"];
  const overallConv = t.impressions > 0 ? (t.sales / t.impressions) * 100 : 0;

  // Per-source daily series (from the enriched daily_sources) for the in-cell
  // sparklines, plus prior-window spend per source for the Cost trend arrow.
  const srcSeries: Record<string, { impressions: number[]; ctr: number[]; leads: number[] }> = {};
  for (const r of perf?.daily_sources || []) {
    const s = srcSeries[r.source] || (srcSeries[r.source] = { impressions: [], ctr: [], leads: [] });
    const imp = r.impressions || 0, clk = r.clicks || 0;
    s.impressions.push(imp);
    s.ctr.push(imp > 0 ? (clk / imp) * 100 : 0);
    s.leads.push(r.leads || 0);
  }
  const prevSrcSpend: Record<string, number> = {};
  for (const s of prevPerf?.sources || []) prevSrcSpend[s.source] = s.spend;
  const srcMaxLeads = Math.max(1, ...(perf?.sources || []).map((s) => s.leads));

  // Campaign insights: honest heuristics from the totals above.
  const CTR_BENCH = 2.0;
  const topSrc = [...(perf?.sources || [])].filter((s) => s.leads > 0).sort((a, b) => b.cvr - a.cvr)[0];
  const insights: { Icon: any; color: string; text: string }[] = [];
  if (t.impressions > 0) {
    insights.push(ctrPct >= CTR_BENCH
      ? { Icon: TrendingUp, color: "#059669", text: `CTR ${ctrPct.toFixed(2)}% is above the ${CTR_BENCH.toFixed(2)}% benchmark. Good job!` }
      : { Icon: TrendingDown, color: "#EF4444", text: `CTR ${ctrPct.toFixed(2)}% is below the ${CTR_BENCH.toFixed(2)}% benchmark. Consider refreshing creatives.` });
  }
  if (t.leads > 0) insights.push({ Icon: Target, color: "#6366F1", text: `Average cost per lead is ${money(cpl)}.` });
  if (t.leads > 0 && t.sales === 0) insights.push({ Icon: AlertTriangle, color: "#F59E0B", text: "No conversions yet. Consider optimizing the landing page or follow-up process." });
  if (topSrc) insights.push({ Icon: Award, color: "#0EA5E9", text: `Top performing source: ${topSrc.label} (${topSrc.cvr.toFixed(2)}% CVR).` });

  // Monthly Spending Performance: per-day share (labels) + Total / Avg / Lowest / Highest.
  const totalSpend = daily.reduce((a, d) => a + d.spend, 0);
  const spendDays = daily.filter((d) => d.spend > 0);
  const avgDailySpend = spendDays.length ? totalSpend / spendDays.length : 0;
  const lowestDay = spendDays.length ? spendDays.reduce((a, b) => (b.spend < a.spend ? b : a)) : null;
  const highestDay = spendDays.length ? spendDays.reduce((a, b) => (b.spend > a.spend ? b : a)) : null;

  // Monthly Leads Performance Breakdown: pivot daily_sources into one series per source.
  const SRC_LABELS: Record<string, string> = { meta_ads: "Meta Ads", tiktok_ads: "TikTok Ads", google_ads: "Google Ads", website: "Website", direct: "Direct" };
  const SRC_COLORS: Record<string, string> = { meta_ads: "#2D8B73", tiktok_ads: "#111827", google_ads: "#EA4335", website: "#6366F1", direct: "#94A3B8" };
  const dayLabel = (iso: string) => { const dt = new Date(iso); return isNaN(dt.getTime()) ? iso : `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`; };
  const leadSourceKeys = Array.from(new Set((perf?.daily_sources || []).map((r) => r.source)));
  const leadsBySource = (() => {
    const byDate = new Map<string, Record<string, number>>();
    for (const r of perf?.daily_sources || []) {
      if (!byDate.has(r.date)) byDate.set(r.date, {});
      byDate.get(r.date)![r.source] = (byDate.get(r.date)![r.source] || 0) + r.leads;
    }
    return Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, m]) => ({ date: dayLabel(date), ...m }));
  })();
  const recentLeads = perf?.recent_leads || [];

  // Budget = sum of the (selected) campaigns' monthly budgets vs actual spend.
  const budget = camps.filter((c) => campaignFilter.length === 0 || campaignFilter.includes(c.id)).reduce((a, c) => a + ((c as { monthly_budget?: number | null }).monthly_budget || 0), 0);
  const budgetLeft = budget - t.spend;
  const budgetUtil = budget > 0 ? (t.spend / budget) * 100 : 0;

  // Keyword bars (log-scaled widths) + age bars for the demography row.
  const kw = keywords.slice(0, 10);
  const kwMax = Math.max(1, ...kw.map((k) => k.impressions), ...kw.map((k) => k.clicks));
  const logW = (v: number) => Math.max(2, (Math.log10((v || 0) + 1) / Math.log10(kwMax + 1)) * 100);
  // Age demography as SHARE (%), so impressions and clicks read on one comparable
  // scale (raw counts were on two different scales -> 15 clicks looked as long as
  // 823 impressions). Bars are scaled to the largest share; labels show the %.
  const ageRows = (perf?.age || []).filter((b) => (b.value || "").toLowerCase() !== "unknown");
  const ageTotImp = ageRows.reduce((a, b) => a + b.impressions, 0) || 1;
  const ageTotClk = ageRows.reduce((a, b) => a + b.clicks, 0) || 1;
  const ageImprShare = (b: AdBreakdown) => (b.impressions / ageTotImp) * 100;
  const ageClkShare = (b: AdBreakdown) => (b.clicks / ageTotClk) * 100;
  const ageMaxShare = Math.max(1, ...ageRows.map(ageImprShare), ...ageRows.map(ageClkShare));
  const gt = ga4?.totals;

  // Full raw analytics export (same shape as the old campaign report): summary +
  // per-source + daily timeline + age/gender/region demographics, each a labelled
  // block in one CSV.
  const exportAdsCsv = () => {
    const esc = (v: string | number) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows: (string | number)[][] = [];
    const blank = () => rows.push([]);
    rows.push(["SUMMARY"]);
    rows.push(["Metric", "Value"]);
    rows.push(["Impressions", t.impressions], ["Clicks", t.clicks], ["CTR", ctrPct.toFixed(2) + "%"],
      ["Leads", t.leads], ["Conversions", t.sales], ["Cost", Math.round(t.spend)],
      ["Cost/lead", t.leads > 0 ? Math.round(cpl) : 0], ["Cost/conversion", t.sales > 0 ? Math.round(cpa) : 0],
      ["Lead to purchase", convRate.toFixed(2) + "%"]);
    blank();
    const srcs = perf?.sources || [];
    if (srcs.length) {
      const srcSpend = srcs.reduce((a, s) => a + s.spend, 0);
      rows.push(["SOURCE PERFORMANCE"]);
      rows.push(["Source", "Cost", "Impressions", "Clicks", "CTR", "Leads", "Purchase", "CVR"]);
      srcs.forEach((s) => rows.push([s.label, Math.round(s.spend), s.impressions, s.clicks, s.ctr.toFixed(2) + "%", s.leads, s.purchases, s.cvr.toFixed(2) + "%"]));
      rows.push(["Grand total", Math.round(srcSpend), srcTotals.impressions, srcTotals.clicks,
        (srcTotals.impressions > 0 ? (srcTotals.clicks / srcTotals.impressions) * 100 : 0).toFixed(2) + "%",
        srcTotals.leads, srcTotals.purchases,
        (srcTotals.clicks > 0 ? (srcTotals.leads / srcTotals.clicks) * 100 : 0).toFixed(2) + "%"]);
      blank();
    }
    const dailyRaw = perf?.daily || [];
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
    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `ads-report-${dateRange}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  // Re-pull Google keywords for the current range (the empty-state Refresh button).
  const refreshKeywords = async () => {
    const { from, to } = dateRange === "custom" ? { from: fFrom, to: fTo } : presetRange(dateRange);
    setKwRefreshing(true);
    try {
      const kws = await api.adKeywords(from || undefined, to || undefined);
      setKeywords(kws || []);
    } catch { /* leave the empty state in place */ } finally {
      setKwRefreshing(false);
    }
  };

  // PDF via the dedicated Heroleads template + headless route (not window.print).
  const exportAdsPdf = async () => {
    const { from, to } = dateRange === "custom" ? { from: fFrom, to: fTo } : presetRange(dateRange);
    try {
      // /report/ads/pdf (NOT /api/*): Caddy proxies /api/* to the gateway, so a Next
      // API route under /api is unreachable from the browser. /report/* hits the web app.
      const res = await fetch("/report/ads/pdf", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: getToken(), user: getUser(), preset: dateRange, from, to, campaigns: campaignFilter.join(",") }),
      });
      const blob = await res.blob();
      if (!res.ok || blob.type !== "application/pdf") throw new Error("headless unavailable");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `ads-report-${dateRange}.pdf`; a.click(); URL.revokeObjectURL(url);
    } catch {
      window.print(); // fallback if headless Chromium isn't available
    }
  };

  return (
    <div className="p-4 print-root">
      {/* Toolbar — left-aligned with a filter icon, matching the Overview tab. */}
      <div className="no-print flex items-center gap-2 mb-4 flex-wrap">
        <FilterIcon className="w-4 h-4 text-muted-foreground" />
        {accountOptions.length > 1 && (
          <MultiSelect value={accountFilter} onChange={setAccountFilter} options={accountOptions} placeholder="All accounts" className="w-[180px]" />
        )}
        <MultiSelect value={campaignFilter} onChange={setCampaignFilter} options={campaignOptions} placeholder="All campaigns" className="w-[200px]" />
        {sourceOptions.length > 0 && (
          <MultiSelect value={sourceFilter} onChange={setSourceFilter} options={sourceOptions} placeholder="All sources" className="w-[170px]" />
        )}
        <DateRangeFilter value={{ preset: dateRange, from: fFrom, to: fTo }}
          onChange={(v) => { setDateRange(v.preset); setFFrom(v.from); setFTo(v.to); }} />
        {(accountFilter.length > 0 || campaignFilter.length > 0 || sourceFilter.length > 0 || dateRange !== "all") && (
          <button onClick={() => { setAccountFilter([]); setCampaignFilter([]); setSourceFilter([]); setDateRange("all"); setFFrom(""); setFTo(""); }}
            className="text-[12px] font-semibold text-primary hover:underline outline-none">Clear</button>
        )}
        <div className="flex-1" />
        <div className="relative">
          <button onClick={() => setExportOpen((o) => !o)} disabled={!hasSpend}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-background text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-50 outline-none transition-colors">
            <Download className="w-4 h-4" /> Export <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          {exportOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border rounded-lg shadow-xl z-50 py-1 animate-scale-in origin-top-right">
                <button onClick={() => { setExportOpen(false); exportAdsPdf(); }} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-muted outline-none"><FileText className="w-4 h-4 text-muted-foreground" /> PDF</button>
                <button onClick={() => { setExportOpen(false); exportAdsCsv(); }} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-muted outline-none"><FileSpreadsheet className="w-4 h-4 text-muted-foreground" /> CSV</button>
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-8"><Skeleton className="h-20 mb-4" /><Skeleton className="h-[280px]" /></div>
      ) : (<>
      {hasSpend ? (
      <>
      {/* KPI cards — value + trend vs the prior window + sparkline */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        {roiCards.map((c) => (
          <div key={c.label} className="bg-card rounded-lg border border-border shadow-xs p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-8 h-8 rounded-full grid place-items-center shrink-0" style={{ backgroundColor: c.color + "14" }}><c.Icon className="w-4 h-4" style={{ color: c.color }} /></div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-tight truncate">{c.label}</p>
            </div>
            <p className="text-[22px] font-extrabold text-foreground leading-none tabular-nums truncate">{c.value}</p>
            <div className="mt-1.5 flex items-center gap-1.5 min-h-[16px]">
              {hasPrev && <Delta cur={c.cur} prev={c.prev} higherIsBetter={c.higher} />}
              {hasPrev && <span className="text-[10px] text-muted-foreground truncate">{cmpLabel}</span>}
            </div>
            <div className="mt-2.5"><Spark data={c.series} color={c.color} h={30} stretch /></div>
          </div>
        ))}
      </div>

      {/* Funnel + insights (left column) beside Source performance (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 mb-5 items-start">
      <div className="flex flex-col gap-4">
      {/* Marketing funnel card with info tooltip + 3-dot menu */}
      <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="font-bold text-[14px] text-foreground leading-tight">Marketing funnel</p>
            <Tip label="Shows the conversion progression from ad impressions through to purchases" side="top">
              <span className="text-muted-foreground/50 cursor-help"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></span>
            </Tip>
          </div>
          <button className="p-1 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors outline-none">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
          </button>
        </div>
        <p className="px-4 pt-1.5 text-[11.5px] text-muted-foreground">Impression to purchase conversion</p>
        {/* Connected trapezoid funnel matching the reference design */}
        <div className="p-4 pt-3">
          <div className="flex flex-col">
            {funnelSteps.map((s, i) => {
              const W = [0.96, 0.80, 0.65, 0.52, 0.40, 0.30];
              const top = W[i], bot = W[i + 1] ?? 0.24;
              const clip = `polygon(${((1 - top) / 2 * 100).toFixed(2)}% 0, ${((1 + top) / 2 * 100).toFixed(2)}% 0, ${((1 + bot) / 2 * 100).toFixed(2)}% 100%, ${((1 - bot) / 2 * 100).toFixed(2)}% 100%)`;
              return (
                <div key={s.label} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="relative flex items-center justify-center gap-1.5 text-white"
                      style={{ height: 50, background: FUNNEL_RAMP[i], clipPath: clip, WebkitClipPath: clip, marginTop: i ? -1 : 0 }}>
                      <s.Icon className="w-3.5 h-3.5 opacity-90 shrink-0" />
                      <div className="text-center min-w-0">
                        <span className="text-[14px] font-extrabold tabular-nums leading-none">{s.value}</span>
                        <span className="text-[9px] font-medium opacity-80 block mt-0.5">{s.label}</span>
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-foreground/60 whitespace-nowrap" style={{ width: 52 }}>{s.rate.toFixed(2)}%</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2">
            <span className="text-[10.5px] text-muted-foreground">Overall conversion rate from impression to purchase</span>
            <span className="text-[11.5px] font-bold tabular-nums text-primary shrink-0">{overallConv.toFixed(2)}%</span>
          </div>
        </div>
      </div>

      {insights.length > 0 && (
        <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Sparkles className="w-[18px] h-[18px] text-primary" />
            <p className="font-bold text-[14px] text-foreground leading-tight">Campaign insights</p>
          </div>
          <div className="p-4 flex flex-col gap-3">
            {insights.map((ins, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full grid place-items-center shrink-0 mt-0.5" style={{ backgroundColor: ins.color + "1f" }}>
                  <ins.Icon className="w-3 h-3" style={{ color: ins.color }} />
                </span>
                <p className="text-[12.5px] text-foreground/80 leading-snug">{ins.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>

      {/* Source performance (right of the funnel) */}
      <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="font-bold text-[14px] text-foreground leading-tight">Source performance</p>
            <Tip label="Ad performance broken down by traffic source" side="top">
              <span className="text-muted-foreground/50 cursor-help"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></span>
            </Tip>
          </div>
          <div className="flex items-center gap-1">
            <button className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors outline-none"><BarChart3 className="w-4 h-4" /></button>
            <button className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors outline-none"><TrendingUp className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                {["Source", "Cost", "Impressions", "Clicks", "CTR", "CPC", "Leads", "CPL", "Purchase", "CVR"].map((h, i) => (
                  <th key={h} className={cn("px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap", i === 0 ? "text-left" : "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(perf?.sources || []).length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-10 text-center text-[13px] text-muted-foreground">No source data in this range</td></tr>
              ) : (perf?.sources || []).map((s) => {
                  const cpc = s.clicks > 0 ? s.spend / s.clicks : 0;
                  const cpl = s.leads > 0 ? s.spend / s.leads : 0;
                  const ser = srcSeries[s.source];
                  return (
                    <tr key={s.source} className="border-b border-border/60 align-top">
                      <td className="px-2.5 py-2">
                        <div className="flex items-center gap-1.5"><SourceIcon source={s.source} /><span className="font-semibold text-foreground whitespace-nowrap text-[12px]">{s.label}</span></div>
                      </td>
                      <td className="px-2.5 py-2 text-right">
                        <div className="tabular-nums text-foreground/80 whitespace-nowrap">{money(s.spend)}</div>
                        {hasPrev && s.spend > 0 && <div className="flex justify-end mt-0.5"><Delta cur={s.spend} prev={prevSrcSpend[s.source] ?? 0} higherIsBetter={null} /></div>}
                      </td>
                      <td className="px-2.5 py-2 text-right">
                        <div className="tabular-nums text-foreground/80">{fmtInt(s.impressions)}</div>
                        {ser && ser.impressions.length > 1 && <div className="flex justify-end mt-1"><MiniBars data={ser.impressions} color="#2D8B73" w={56} h={16} /></div>}
                      </td>
                      <td className="px-2.5 py-2 text-right tabular-nums text-foreground/80">{fmtInt(s.clicks)}</td>
                      <td className="px-2.5 py-2 text-right">
                        <div className="tabular-nums text-foreground/80">{s.ctr.toFixed(2)}%</div>
                        {ser && ser.ctr.length > 1 && <div className="flex justify-end mt-1"><Spark data={ser.ctr} color="#6366F1" w={52} h={16} fill={false} /></div>}
                      </td>
                      <td className="px-2.5 py-2 text-right tabular-nums text-foreground/80 whitespace-nowrap">{s.clicks > 0 ? money(cpc) : "-"}</td>
                      <td className="px-2.5 py-2 text-right">
                        <div className="tabular-nums text-foreground/80">{fmtInt(s.leads)}</div>
                        {s.leads > 0 && (
                          <div className="mt-1 ml-auto h-1.5 rounded-full bg-muted overflow-hidden" style={{ width: 40 }}>
                            <div className="h-full rounded-full" style={{ width: `${(s.leads / srcMaxLeads) * 100}%`, background: "#2D8B73" }} />
                          </div>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-right tabular-nums text-foreground/80 whitespace-nowrap">{s.leads > 0 ? money(cpl) : "-"}</td>
                      <td className="px-2.5 py-2 text-right tabular-nums font-semibold text-foreground">{fmtInt(s.purchases)}</td>
                      <td className="px-2.5 py-2 text-right">
                        <span className={cn("inline-flex px-1.5 py-0.5 rounded-md text-[10.5px] font-bold tabular-nums", s.cvr > 0 ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>{s.cvr.toFixed(2)}%</span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-bold text-[12px]">
                <td className="px-2.5 py-2.5">Grand total</td>
                <td className="px-2.5 py-2.5 text-right">
                  <div className="tabular-nums whitespace-nowrap">{money(srcTotals.spend)}</div>
                  {hasPrev && srcTotals.spend > 0 && <div className="flex justify-end mt-0.5"><Delta cur={srcTotals.spend} prev={prev?.spend ?? 0} higherIsBetter={null} /></div>}
                </td>
                <td className="px-2.5 py-2.5 text-right tabular-nums">{fmtInt(srcTotals.impressions)}</td>
                <td className="px-2.5 py-2.5 text-right tabular-nums">{fmtInt(srcTotals.clicks)}</td>
                <td className="px-2.5 py-2.5 text-right tabular-nums">{(srcTotals.impressions > 0 ? (srcTotals.clicks / srcTotals.impressions) * 100 : 0).toFixed(2)}%</td>
                <td className="px-2.5 py-2.5 text-right tabular-nums whitespace-nowrap">{srcTotals.clicks > 0 ? money(srcTotals.spend / srcTotals.clicks) : "-"}</td>
                <td className="px-2.5 py-2.5 text-right tabular-nums">{fmtInt(srcTotals.leads)}</td>
                <td className="px-2.5 py-2.5 text-right tabular-nums whitespace-nowrap">{srcTotals.leads > 0 ? money(srcTotals.spend / srcTotals.leads) : "-"}</td>
                <td className="px-2.5 py-2.5 text-right tabular-nums">{fmtInt(srcTotals.purchases)}</td>
                <td className="px-2.5 py-2.5 text-right">
                  {(() => { const gcvr = srcTotals.clicks > 0 ? (srcTotals.leads / srcTotals.clicks) * 100 : 0; return (
                    <span className={cn("inline-flex px-1.5 py-0.5 rounded-md text-[10.5px] font-bold tabular-nums", gcvr > 0 ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>{gcvr.toFixed(2)}%</span>
                  ); })()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      </div>

      {/* Campaign Performance - impressions vs clicks over the range */}
      <Card className="mb-5">
        <div className="px-4 py-3 border-b border-border">
          <p className="font-bold text-[14px] text-foreground leading-tight">Campaign Performance</p>
          <p className="text-xs text-muted-foreground">Performance over the selected range</p>
        </div>
        <div className="p-4">
          {/* Totals + delta vs the prior window */}
          <div className="flex flex-wrap items-start gap-x-10 gap-y-3 mb-3">
            {[
              { label: "Impressions", color: "#0b1220", total: t.impressions, prev: prev?.impressions ?? 0 },
              { label: "Clicks", color: "#2D8B73", total: t.clicks, prev: prev?.clicks ?? 0 },
            ].map((m) => (
              <div key={m.label}>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                  <span className="text-[11px] font-semibold text-muted-foreground">{m.label}</span>
                </div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-[20px] font-extrabold text-foreground tabular-nums leading-none">{fmtInt(m.total)}</span>
                  {hasPrev && <Delta cur={m.total} prev={m.prev} higherIsBetter={true} />}
                </div>
                {hasPrev && <span className="text-[10px] text-muted-foreground">{cmpLabel}</span>}
              </div>
            ))}
          </div>
          {/* Series toggle chips */}
          <div className="flex items-center gap-2 mb-3">
            {[
              { label: "Impressions", color: "#0b1220", show: showImpr, toggle: () => setShowImpr((v) => !v) },
              { label: "Clicks", color: "#2D8B73", show: showClk, toggle: () => setShowClk((v) => !v) },
            ].map((c) => (
              <button key={c.label} onClick={c.toggle}
                className={cn("inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[12px] font-medium transition-colors outline-none",
                  c.show ? "border-border bg-muted/60 text-foreground" : "border-border/60 text-muted-foreground/50")}>
                <span className="w-2 h-2 rounded-full" style={{ background: c.show ? c.color : "#cbd5e1" }} />{c.label}
              </button>
            ))}
          </div>
          {dailyLog.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No data</div>
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyLog} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cpImpr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0b1220" stopOpacity={0.13} /><stop offset="100%" stopColor="#0b1220" stopOpacity={0.01} /></linearGradient>
                    <linearGradient id="cpClk" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2D8B73" stopOpacity={0.22} /><stop offset="100%" stopColor="#2D8B73" stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis scale="log" domain={[1, "auto"]} allowDataOverflow tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={46}
                    tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                  <RechartsTooltip content={<AdsTooltip />} cursor={{ stroke: "rgba(0,0,0,0.08)" }} />
                  {showImpr && <Area type="monotone" dataKey="impressions" name="Impressions" stroke="#0b1220" strokeWidth={2} fill="url(#cpImpr)" dot={dailyLog.length <= 12 ? { r: 3, fill: "#fff", stroke: "#0b1220", strokeWidth: 2 } : false} connectNulls isAnimationActive={false} />}
                  {showClk && <Area type="monotone" dataKey="clicks" name="Clicks" stroke="#2D8B73" strokeWidth={2} fill="url(#cpClk)" dot={dailyLog.length <= 12 ? { r: 3, fill: "#fff", stroke: "#2D8B73", strokeWidth: 2 } : false} connectNulls isAnimationActive={false} />}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Card>

      {/* Google Top 10 Keywords (left) + Facebook Age Demography (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5 items-stretch">
        <Card title="Google Top 10 Search Keywords" subtitle="Clicks vs impressions">
          <div className="p-4">
            {kw.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full bg-muted grid place-items-center mb-3"><Search className="w-5 h-5 text-muted-foreground/60" /></div>
                <p className="text-[13px] font-semibold text-foreground">No search keywords yet</p>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-[240px]">Google Search Console hasn&apos;t collected enough data.</p>
                <button onClick={refreshKeywords} disabled={kwRefreshing}
                  className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-background text-[12px] font-medium text-foreground hover:bg-muted disabled:opacity-50 outline-none transition-colors">
                  <RefreshCw className={cn("w-3.5 h-3.5", kwRefreshing && "animate-spin")} /> Refresh
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {kw.map((k, i) => (
                  <div key={k.keyword + i} className="grid grid-cols-[130px_1fr] gap-2 items-center">
                    <span className="text-[11px] text-foreground truncate" title={k.keyword}>{k.keyword}</span>
                    <div>
                      <div className="flex items-center gap-2"><div className="h-2 rounded-sm" style={{ width: `${logW(k.clicks)}%`, background: "#2D8B73" }} /><span className="text-[10px] text-muted-foreground tabular-nums">{fmtInt(k.clicks)}</span></div>
                      <div className="flex items-center gap-2 mt-1"><div className="h-2 rounded-sm" style={{ width: `${logW(k.impressions)}%`, background: "#0b1220" }} /><span className="text-[10px] text-muted-foreground tabular-nums">{fmtInt(k.impressions)}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
        <div className="bg-card rounded-lg border border-border shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
            <div>
              <p className="font-bold text-[14px] text-foreground leading-tight">Facebook Age Demography</p>
              <p className="text-xs text-muted-foreground">Impressions vs link clicks</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#0b1220" }} />Impressions</span>
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#2D8B73" }} />Link Clicks</span>
            </div>
          </div>
          <div className="p-4">
            {ageRows.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No data</div>
            ) : (
              <div className="flex flex-col gap-3.5">
                {ageRows.map((b) => (
                  <div key={b.value} className="grid grid-cols-[52px_1fr] gap-3 items-center">
                    <span className="text-[11px] font-medium text-foreground">{b.value}</span>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2"><div className="flex-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(ageImprShare(b) / ageMaxShare) * 100}%`, background: "#0b1220" }} /></div><span className="text-[10px] font-semibold text-foreground/70 tabular-nums w-9 text-right">{ageImprShare(b).toFixed(1)}%</span></div>
                      <div className="flex items-center gap-2"><div className="flex-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(ageClkShare(b) / ageMaxShare) * 100}%`, background: "#2D8B73" }} /></div><span className="text-[10px] font-semibold text-foreground/70 tabular-nums w-9 text-right">{ageClkShare(b).toFixed(1)}%</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Monthly Leads Performance - total + delta beside the by-source area */}
      <Card title="Monthly Leads Performance" subtitle="Leads by source over time" className="mb-5">
        <div className="p-4">
          {leadsBySource.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No data</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[170px_1fr] gap-4 items-center">
              <div className="flex flex-col">
                <p className="text-[34px] font-extrabold text-foreground leading-none tabular-nums">{fmtInt(t.leads)}</p>
                <p className="text-[12px] text-muted-foreground mt-1">Leads</p>
                {hasPrev && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <Delta cur={t.leads} prev={prev?.leads ?? 0} higherIsBetter={true} />
                    <span className="text-[10px] text-muted-foreground">{cmpLabel}</span>
                  </div>
                )}
                <div className="mt-4 flex flex-col gap-1.5">
                  {leadSourceKeys.map((k) => (
                    <span key={k} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SRC_COLORS[k] || "#94a3b8" }} />{SRC_LABELS[k] || k}
                    </span>
                  ))}
                </div>
              </div>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={leadsBySource} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      {leadSourceKeys.map((k) => (
                        <linearGradient key={k} id={`ls-${k}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={SRC_COLORS[k] || "#94a3b8"} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={SRC_COLORS[k] || "#94a3b8"} stopOpacity={0.02} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={34} allowDecimals={false} />
                    <RechartsTooltip content={<AdsTooltip />} cursor={{ stroke: "rgba(0,0,0,0.08)" }} />
                    {leadSourceKeys.map((k) => (
                      <Area key={k} type="monotone" dataKey={k} name={SRC_LABELS[k] || k} stackId="1" stroke={SRC_COLORS[k] || "#94a3b8"} strokeWidth={2} fill={`url(#ls-${k})`}
                        dot={leadsBySource.length <= 12 ? { r: 2.5, fill: "#fff", stroke: SRC_COLORS[k] || "#94a3b8", strokeWidth: 2 } : false} isAnimationActive={false} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Latest Leads - Date | Name | Phone | Channel | Source | Stage */}
      <div className="bg-card rounded-lg border border-border shadow-xs overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
          <p className="font-bold text-[14px] text-foreground leading-tight">Latest Leads</p>
          <Link href="/inbox" className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-border bg-background text-[12px] font-medium text-foreground hover:bg-muted outline-none transition-colors">
            View All Leads <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                {["Date", "Name", "Phone Number", "Channel", "Source", "Stage"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentLeads.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-12">
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-full bg-muted grid place-items-center mb-3"><Inbox className="w-5 h-5 text-muted-foreground/60" /></div>
                    <p className="text-[13px] font-semibold text-foreground">No leads available</p>
                    <p className="text-xs text-muted-foreground mt-0.5">New leads will appear here</p>
                  </div>
                </td></tr>
              ) : recentLeads.map((l, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{l.created_at ? new Date(l.created_at).toLocaleString("en-GB") : "-"}</td>
                  <td className="px-3 py-2 font-semibold text-foreground">{l.contact_name || "Unknown"}</td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{l.contact_phone || "-"}</td>
                  <td className="px-3 py-2 text-muted-foreground capitalize">{l.channel || "-"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{SRC_LABELS[l.source] || l.source || "-"}</td>
                  <td className="px-3 py-2 text-foreground">{l.stage || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Spending Performance - daily spend bars + share labels + summary */}
      <Card title="Monthly Spending Performance" subtitle="Daily ad spend" className="mb-5">
        <div className="p-4">
          {daily.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No data</div>
          ) : (
            <>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} margin={{ top: 20, right: 12, left: 6, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={54}
                      tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                    <RechartsTooltip content={<AdsTooltip fmt={money} />} cursor={{ fill: "rgba(45,139,115,0.06)" }} />
                    <Bar dataKey="spend" name="Cost" fill="#2D8B73" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                      {daily.length <= 14 && <LabelList dataKey="spend" position="top" content={(props: any) => {
                        const { x, y, width, value } = props;
                        if (totalSpend <= 0 || value == null) return null;
                        return <text x={Number(x) + Number(width) / 2} y={Number(y) - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill="#2D8B73">{`${(Number(value) / totalSpend * 100).toFixed(1)}%`}</text>;
                      }} />}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Summary: Total / Avg daily / Lowest / Highest */}
              <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 rounded-lg border border-border bg-muted/30 p-3">
                {[
                  { label: "Total Spend", value: money(totalSpend), sub: "", Icon: CircleDollarSign },
                  { label: "Avg. Daily Spend", value: money(avgDailySpend), sub: "", Icon: TrendingUp },
                  { label: "Lowest Day", value: lowestDay ? lowestDay.date : "-", sub: lowestDay ? money(lowestDay.spend) : "", Icon: ArrowDownRight },
                  { label: "Highest Day", value: highestDay ? highestDay.date : "-", sub: highestDay ? money(highestDay.spend) : "", Icon: ArrowUpRight },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0" style={{ backgroundColor: "#2D8B7314" }}><s.Icon className="w-4 h-4 text-primary" /></span>
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground truncate">{s.label}</p>
                      <p className="text-[16px] font-extrabold text-foreground tabular-nums leading-tight truncate">{s.value}</p>
                      {s.sub && <p className="text-[11px] font-semibold text-primary tabular-nums">{s.sub}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Budget snapshot */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Media Budget", value: money(budget), accent: false, danger: false },
          { label: "Cost", value: money(t.spend), accent: true, danger: false },
          { label: "Budget Left", value: money(budgetLeft), accent: false, danger: budgetLeft < 0 },
          { label: "Budget Utilization", value: `${budgetUtil.toFixed(2)}%`, accent: true, danger: false },
        ].map((b) => (
          <div key={b.label} className={cn("rounded-lg border p-4 shadow-xs", b.accent ? "bg-primary border-transparent text-white" : "bg-card border-border")}>
            <p className={cn("text-[11px]", b.accent ? "text-white/80" : "text-muted-foreground")}>{b.label}</p>
            <p className={cn("text-[20px] font-extrabold tabular-nums mt-1", b.danger ? "text-red-500" : b.accent ? "text-white" : "text-foreground")}>{b.value}</p>
          </div>
        ))}
      </div>

      {/* Landing Page Performance (left) + Top Locations map (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5 items-stretch">
        <Card title="Landing Page Performance" subtitle="GA4 sessions and engagement">
          <div className="p-4">
            {!(ga4?.connected && gt) ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No data{ga4 && !ga4.connected ? " - connect GA4 in Channel & Integrations" : ""}</div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {([["Total users", fmtInt(gt.total_users)], ["Sessions", fmtInt(gt.sessions)], ["Views", fmtInt(gt.views)], ["New users", fmtInt(gt.new_users)], ["Engaged", fmtInt(gt.engaged_sessions)], ["Engagement", `${(gt.engagement_rate * 100).toFixed(1)}%`], ["Avg time", `${Math.floor(gt.avg_engagement_sec / 60)}:${String(Math.round(gt.avg_engagement_sec % 60)).padStart(2, "0")}`], ["Active users", fmtInt(gt.active_users)]] as [string, string][]).map(([l, v]) => (
                    <div key={l} className="rounded-lg border border-border p-2.5">
                      <p className="text-[17px] font-extrabold tabular-nums text-foreground">{v}</p>
                      <p className="text-[10px] text-muted-foreground">{l}</p>
                    </div>
                  ))}
                </div>
                {ga4.rows.length > 0 && (
                  <table className="w-full text-[12px] mt-3">
                    <thead><tr className="text-muted-foreground border-b border-border">{["Landing page", "Views", "Sessions", "Eng."].map((h, i) => (<th key={h} className={cn("py-1.5 px-2 text-[10px] font-bold uppercase", i === 0 ? "text-left" : "text-right")}>{h}</th>))}</tr></thead>
                    <tbody>{ga4.rows.slice(0, 6).map((r, i) => (<tr key={i} className="border-b border-border/60"><td className="py-1.5 px-2 max-w-[220px] truncate text-foreground">{r.landing_page || "(not set)"}</td><td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{fmtInt(r.views)}</td><td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{fmtInt(r.sessions)}</td><td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{(r.engagement_rate * 100).toFixed(0)}%</td></tr>))}</tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </Card>
        <Card title="Top Locations" subtitle="Ad reach by province">
          <div className="p-4">
            {(perf?.region || []).filter((b) => (b.value || "").toLowerCase() !== "unknown").length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No data</div>
            ) : (
              <div className="h-[300px]">
                <IndonesiaMap points={(perf?.region || []).filter((b) => (b.value || "").toLowerCase() !== "unknown").map((b) => ({ name: b.value, value: b.impressions }))} isMoney={false} money={fmtInt} />
              </div>
            )}
          </div>
        </Card>
      </div>

      </>
      ) : hasAccounts === false ? (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-[13px] text-muted-foreground">
          <CircleDollarSign className="w-4 h-4 text-muted-foreground/70 shrink-0" />
          Connect a Meta ad account to add spend, cost per lead and ROI. The lead attribution below works without it.
        </div>
      ) : null}
      </>)}
    </div>
  );
}

// Per-creative report — its own page so creative-level insight has room to grow.
// Which click-to-WhatsApp ad drove leads + conversions, with its own date +
// campaign filters (independent of the Ads Report).
function CreativeReport() {
  const [dateRange, setDateRange] = useState("30d");
  const [fFrom, setFFrom] = useState(() => presetRange("30d").from);
  const [fTo, setFTo] = useState(() => presetRange("30d").to);
  const [campaignFilter, setCampaignFilter] = useState<string[]>([]);
  const [perf, setPerf] = useState<AdPerformance | null>(null);
  const [currency, setCurrency] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { from, to } = dateRange === "custom" ? { from: fFrom, to: fTo } : presetRange(dateRange);
    let alive = true;
    Promise.all([
      api.adPerformance(from || undefined, to || undefined, campaignFilter.length ? campaignFilter : undefined).catch(() => null),
      api.listAdAccounts().catch(() => []),
    ]).then(([p, accts]) => {
      if (!alive) return;
      setPerf(p as AdPerformance | null);
      const a = (accts as { currency?: string | null }[]) || [];
      setCurrency(a.find((x) => x.currency)?.currency || "");
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [dateRange, fFrom, fTo, campaignFilter]);

  const money = (n: number) => `${currency ? currency + " " : ""}${fmtMoney(n)}`;
  const creatives = perf?.creatives || [];
  const campaignOptions = (perf?.campaigns || []).map((c) => ({ value: c.campaign_id, label: c.campaign_name }));

  // Ranked + insight-driving aggregates.
  const ranked = [...creatives].sort((a, b) => b.leads - a.leads || b.spend - a.spend);
  const tot = creatives.reduce((a, c) => ({ spend: a.spend + c.spend, impressions: a.impressions + c.impressions, clicks: a.clicks + c.clicks, leads: a.leads + c.leads, sales: a.sales + c.sales }), { spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0 });
  const avgCpl = tot.leads > 0 ? tot.spend / tot.leads : 0;
  const withLeads = creatives.filter((c) => c.leads > 0 && c.spend > 0);
  const bestCpl = withLeads.length ? withLeads.reduce((b, c) => (c.spend / c.leads < b.spend / b.leads ? c : b)) : null;
  const top = ranked.find((c) => c.leads > 0) || null;
  const wasted = creatives.filter((c) => c.spend > 0 && c.leads === 0);
  const wastedSpend = wasted.reduce((a, c) => a + c.spend, 0);
  const bestCvr = creatives.reduce((m, c) => Math.max(m, c.leads > 0 ? (c.sales / c.leads) * 100 : 0), 0);
  const name = (c: { headline: string | null; source_id: string }) => c.headline || `Ad ${c.source_id}`;

  const kpis = [
    { label: "Ad spend", value: money(tot.spend) },
    { label: "Creatives", value: fmtInt(creatives.length) },
    { label: "Leads", value: fmtInt(tot.leads) },
    { label: "Conversions", value: fmtInt(tot.sales) },
    { label: "Avg cost / lead", value: tot.leads > 0 ? money(avgCpl) : "-" },
    { label: "Best lead to buy", value: bestCvr > 0 ? bestCvr.toFixed(1) + "%" : "-" },
  ];

  const Thumb = ({ c, size }: { c: AdPerformance["creatives"][number]; size: number }) => (
    <div className="relative rounded-lg border border-border bg-muted/60 overflow-hidden grid place-items-center text-muted-foreground/50 shrink-0" style={{ width: size, height: size }}>
      <ImageIcon className="w-5 h-5" />
      {c.image_url && (
        <a href={c.source_url || c.image_url} target="_blank" rel="noreferrer" className="absolute inset-0">
          <img src={c.image_url} alt={c.headline || "Ad creative"} loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} className="w-full h-full object-cover" />
        </a>
      )}
    </div>
  );

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <FilterIcon className="w-4 h-4 text-muted-foreground" />
        <MultiSelect value={campaignFilter} onChange={setCampaignFilter} options={campaignOptions} placeholder="All campaigns" className="w-[200px]" />
        <DateRangeFilter value={{ preset: dateRange, from: fFrom, to: fTo }}
          onChange={(v) => { setDateRange(v.preset); setFFrom(v.from); setFTo(v.to); }} />
      </div>

      {loading ? (
        <div className="py-8"><Skeleton className="h-20 mb-4" /><Skeleton className="h-[280px]" /></div>
      ) : creatives.length === 0 ? (
        <div className="py-20 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted grid place-items-center mx-auto mb-3"><ImageIcon className="w-6 h-6 text-muted-foreground/50" /></div>
          <p className="font-semibold text-foreground mb-0.5">No creative data in range</p>
          <p className="text-sm text-muted-foreground">Connect a Meta ad account with click-to-WhatsApp ads to see per-creative insight.</p>
        </div>
      ) : (
      <>
        {/* KPI summary */}
        <div className="flex flex-wrap bg-card rounded-lg border border-border shadow-xs mb-5 overflow-hidden">
          {kpis.map((k, i) => (
            <div key={k.label} className={cn("flex-1 min-w-[130px] px-4 py-3.5", i < kpis.length - 1 && "border-r border-border")}>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-tight truncate">{k.label}</p>
              <p className="text-[18px] xl:text-[20px] font-extrabold text-foreground leading-none tabular-nums mt-1 truncate">{k.value}</p>
            </div>
          ))}
        </div>

        {/* Insight cards: top performer, cheapest lead, wasted spend */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <Card title="Top creative" subtitle="Most leads in range">
            <div className="p-4">
              {top ? (
                <div className="flex items-center gap-3">
                  <Thumb c={top} size={56} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate">{name(top)}</p>
                    <p className="text-[11.5px] text-muted-foreground truncate">{fmtInt(top.leads)} leads · {top.leads > 0 && top.spend > 0 ? `${money(top.spend / top.leads)}/lead` : "-"}</p>
                  </div>
                </div>
              ) : <p className="text-[13px] text-muted-foreground">No creative drove a lead yet.</p>}
            </div>
          </Card>
          <Card title="Cheapest lead" subtitle="Lowest cost per lead">
            <div className="p-4">
              {bestCpl ? (
                <div className="flex items-center gap-3">
                  <Thumb c={bestCpl} size={56} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate">{name(bestCpl)}</p>
                    <p className="text-[11.5px] text-[#059669] font-semibold">{money(bestCpl.spend / bestCpl.leads)}/lead · {fmtInt(bestCpl.leads)} leads</p>
                  </div>
                </div>
              ) : <p className="text-[13px] text-muted-foreground">No cost-per-lead data yet.</p>}
            </div>
          </Card>
          <Card title="Wasted spend" subtitle="Spend with zero leads">
            <div className="p-4">
              {wasted.length ? (
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg bg-amber-50 grid place-items-center shrink-0"><TrendingDown className="w-6 h-6 text-amber-600" /></div>
                  <div className="min-w-0">
                    <p className="text-[18px] font-extrabold text-amber-600 tabular-nums leading-none">{money(wastedSpend)}</p>
                    <p className="text-[11.5px] text-muted-foreground mt-1">{wasted.length} creative{wasted.length === 1 ? "" : "s"} spent but got no leads</p>
                  </div>
                </div>
              ) : <p className="text-[13px] text-muted-foreground">No wasted spend. Every paid creative got a lead.</p>}
            </div>
          </Card>
        </div>

        {/* Creative cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          {ranked.map((cr, i) => {
            const ctr = cr.impressions > 0 ? (cr.clicks / cr.impressions) * 100 : 0;
            const cpl = cr.leads > 0 ? cr.spend / cr.leads : 0;
            const cvr = cr.leads > 0 ? (cr.sales / cr.leads) * 100 : 0;
            const leadRate = cr.clicks > 0 ? (cr.leads / cr.clicks) * 100 : 0;
            const cells = [
              { l: "Spend", v: cr.spend > 0 ? money(cr.spend) : "-" },
              { l: "Impressions", v: fmtInt(cr.impressions) },
              { l: "Clicks", v: fmtInt(cr.clicks) },
              { l: "CTR", v: `${ctr.toFixed(2)}%` },
              { l: "Leads", v: fmtInt(cr.leads), hi: true },
              { l: "Cost / lead", v: cr.leads > 0 && cr.spend > 0 ? money(cpl) : "-" },
              { l: "Conversions", v: fmtInt(cr.sales) },
              { l: "Lead to buy", v: cr.leads > 0 ? `${cvr.toFixed(1)}%` : "-" },
            ];
            return (
              <div key={cr.source_id} className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
                <div className="flex items-start gap-3 p-3.5 border-b border-border">
                  <Thumb c={cr} size={64} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-primary/[0.12] text-primary text-[11px] font-bold shrink-0">{i + 1}</span>
                      <p className="text-[13.5px] font-semibold text-foreground truncate">{name(cr)}</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{cr.source_id}</p>
                    {cr.body && <p className="text-[11px] text-muted-foreground/80 line-clamp-2 mt-1">{cr.body}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-4 divide-x divide-border">
                  {cells.map((c) => (
                    <div key={c.l} className="px-3 py-2.5">
                      <p className="text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wide truncate">{c.l}</p>
                      <p className={cn("text-[13.5px] font-bold tabular-nums mt-0.5 truncate", c.hi ? "text-primary" : "text-foreground")}>{c.v}</p>
                    </div>
                  ))}
                </div>
                <div className="px-3.5 py-2.5 border-t border-border">
                  <div className="flex items-center justify-between text-[10.5px] text-muted-foreground mb-1">
                    <span>Click to lead</span><span className="tabular-nums font-semibold text-foreground">{leadRate.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, leadRate)}%` }} /></div>
                </div>
              </div>
            );
          })}
        </div>
      </>
      )}
    </div>
  );
}
