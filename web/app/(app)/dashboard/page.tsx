"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, ComposedChart, Bar, Line, PieChart, Pie, Cell,
} from "recharts";
import {
  BarChart3, MessageSquare, Inbox, Flame, Timer,
  TrendingDown, ChevronRight, Zap, Mail, Reply, Trophy,
  Clock, ArrowRight, CheckCircle2, Activity, Users, Radio,
  CircleDollarSign, MousePointerClick, Megaphone, Target, Eye, Filter as FilterIcon,
  Image as ImageIcon, MapPin,
} from "lucide-react";

import { api, getUser } from "@/lib/api";
import { Select } from "@/components/Select";
import { MultiSelect } from "@/components/ui/multi-select";
import { IndonesiaMap } from "@/components/IndonesiaMap";
import { lostReasonLabel } from "@/app/(app)/inbox/components/LostReasonDialog";
import type { Stats, Analytics, DashboardCards, Conversation, AdPerformance, AdBreakdown, Channel, Campaign, Agent } from "@/lib/types";
import { cn, initials, fmtDuration } from "@/lib/utils";

type Metric = {
  key: string; label: string; Icon: any; color: string;
  href?: string; fmt?: (v: number) => string;
};

// Accurate, unambiguous: Replied = AGENT replied; Won = disposition won; Avg first
// response = first agent reply after the customer's first message (bot excluded).
const METRICS: Metric[] = [
  { key: "total_leads", label: "Leads", Icon: BarChart3, color: "#6366F1", href: "/inbox" },
  { key: "active", label: "Active", Icon: MessageSquare, color: "#2D8B73", href: "/inbox?status=open" },
  { key: "unassigned", label: "Unassigned", Icon: Inbox, color: "#E67E22", href: "/inbox" },
  { key: "replied", label: "Replied", Icon: Reply, color: "#0284C7" },
  { key: "won", label: "Purchase", Icon: Trophy, color: "#059669" },
  { key: "avg_rt", label: "Avg first response", Icon: Timer, color: "#7C3AED", fmt: fmtDuration },
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
function fmtLocalDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function presetRange(key: string): { from: string; to: string } {
  const today = new Date();
  const t = fmtLocalDate(today);
  const back = (n: number) => { const d = new Date(today); d.setDate(today.getDate() - n); return fmtLocalDate(d); };
  switch (key) {
    case "today": return { from: t, to: t };
    case "7d": return { from: back(6), to: t };
    case "30d": return { from: back(29), to: t };
    case "90d": return { from: back(89), to: t };
    case "month": return { from: fmtLocalDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: t };
    case "lastmonth": return { from: fmtLocalDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: fmtLocalDate(new Date(today.getFullYear(), today.getMonth(), 0)) };
    default: return { from: "", to: "" };
  }
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card/95 backdrop-blur-sm px-3 py-2 shadow-lg min-w-[140px]">
      <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5 last:mb-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-xs text-foreground/75">{p.name}</span>
          <span className="text-xs font-bold text-foreground tabular-nums ml-auto">{Number(p.value ?? 0).toLocaleString()}</span>
        </div>
      ))}
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
  if (!stages || stages.length === 0) {
    return <div className="py-10 text-center text-sm text-muted-foreground">No pipeline data yet</div>;
  }
  // "Lost" is a real stage but a terminal outcome: keep it OUT of the pipeline
  // list and pin it to the bottom in red, shown once (no duplicate row). Its
  // count comes from the stage itself; fall back to the legacy `lost` prop.
  const pipeline = [...stages].filter((s) => s.system_key !== "lost").sort((a, b) => a.sort_order - b.sort_order);
  const lostStage = stages.find((s) => s.system_key === "lost");
  const lostCount = lostStage ? lostStage.count : lost;
  const total = stages.reduce((s, x) => s + (x.count || 0), 0);
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
            <span className="text-sm font-medium flex-1 text-foreground/90">{s.name}</span>
            <div className="flex-[2]"><ProgressBar value={total > 0 ? (s.count / total) * 100 : 0} color={color} /></div>
            <span className="text-sm font-bold min-w-[28px] text-right tabular-nums" style={{ color }}>{s.count}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover/st:text-muted-foreground shrink-0" />
          </Link>
        );
      })}
      {lostCount !== undefined && (
        <Link
          href="/inbox?stage=Lost"
          className="group/st flex items-center gap-3 px-2 py-2 mt-1 pt-2.5 border-t border-border/60 rounded-md hover:bg-muted transition-colors"
        >
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#EF4444" }} />
          <span className="text-sm font-medium flex-1 text-foreground/90">Lost</span>
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
function LeadFunnel({ stages }: { stages?: Analytics["funnel_stages"] }) {
  if (!stages || stages.length === 0) {
    return <div className="py-10 text-center text-sm text-muted-foreground">No pipeline data yet</div>;
  }
  const top = Math.max(stages[0]?.reached ?? 0, 1);
  return (
    <div className="p-4 space-y-2.5">
      {stages.map((s, i) => {
        const pct = (s.reached / top) * 100;
        const conv = i === 0 ? null : (stages[i - 1].reached > 0 ? (s.reached / stages[i - 1].reached) * 100 : 0);
        return (
          <div key={s.system_key || s.name}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[13px] font-medium text-foreground/90">{s.name}</span>
              <div className="flex items-center gap-2">
                {conv !== null && (
                  <span className={cn("text-[11px] tabular-nums", conv >= 50 ? "text-success" : conv >= 25 ? "text-amber-600" : "text-muted-foreground")}>
                    {Math.round(conv)}%
                  </span>
                )}
                <span className="text-[13px] font-bold tabular-nums text-foreground min-w-[2rem] text-right">{s.reached}</span>
              </div>
            </div>
            <div className="h-6 rounded-md bg-muted/50 overflow-hidden">
              <div className="h-full rounded-md transition-all duration-500" style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// â”€â”€ Agent dashboard: action-center (essentials only, no org analytics, no lead score) â”€â”€
const AGENT_CARDS = [
  { key: "open", label: "My open", sub: "Active conversations", Icon: MessageSquare, color: "#2D8B73", href: "/inbox" },
  { key: "hot", label: "Hot leads", sub: "High buying intent", Icon: Flame, color: "#EF4444", href: "/inbox?interest=hot" },
  { key: "follow_up", label: "Follow up now", sub: "Hot/warm and unread", Icon: Zap, color: "#F59E0B", href: "/inbox?followup=1" },
  { key: "unread", label: "Unread", sub: "Waiting on you", Icon: Mail, color: "#6366F1", href: "/inbox?unread=1" },
  { key: "purchase", label: "Purchased", sub: "Reached purchase", Icon: CircleDollarSign, color: "#059669", href: "" },
  { key: "lost", label: "Lost", sub: "Marked lost", Icon: TrendingDown, color: "#EF4444", href: "" },
] as const;

function AgentDashboard() {
  const [cards, setCards] = useState<DashboardCards | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  useEffect(() => {
    // Fall back to zeros (not an endless skeleton) if the endpoint isn't deployed yet.
    api.getDashboardCards().then(setCards).catch(() => setCards({ open: 0, hot: 0, follow_up: 0, need_call: 0, unread: 0 }));
    api.getAnalytics().then(setAnalytics).catch(() => {});
  }, []);
  const funnel = analytics?.funnel;

  return (
    <div className="p-4">
      {/* Action cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        {AGENT_CARDS.map((c) => {
          const v = c.key === "purchase" ? (funnel?.won ?? null)
            : c.key === "lost" ? (analytics?.lost ?? null)
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Your activity" subtitle="Daily leads and replies" className="lg:col-span-2">
          <div className="px-4 py-4"><OverviewChart data={buildChartData(analytics, true)} /></div>
        </Card>
        <Card title="Your stages" subtitle="Leads by pipeline stage">
          <StageSplit stages={analytics?.stages} lost={analytics?.funnel?.lost} />
        </Card>
      </div>

      {/* Lost analysis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Card title="Lost analysis" icon={TrendingDown} iconColor="#EF4444">
          <div className="p-4">
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-4xl font-extrabold text-[#EF4444] leading-none tabular-nums">{analytics?.lost ?? 0}</span>
              <span className="text-sm text-muted-foreground font-medium">total lost leads</span>
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
                  <div key={r.reason} className="mb-4 last:mb-0">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium text-foreground/80">{lostReasonLabel(r.reason)}</span>
                      <span className="text-sm font-bold text-[#EF4444] tabular-nums">{r.count}</span>
                    </div>
                    <ProgressBar value={(r.count / maxCount) * 100} color={i === 0 ? "#EF4444" : i === 1 ? "#F97316" : "#FBBF24"} height={6} />
                  </div>
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
  return <ManagerHome />;
}

// â”€â”€ Manager home: Live ops (Control Tower) âŸ· Reports (deep analytics) â”€â”€
function ManagerHome() {
  const [view, setView] = useState<"live" | "reports">("live");
  return (
    <div>
      <div className="px-4 pt-4">
        <div className="inline-flex p-0.5 rounded-md bg-muted border border-border">
          {(["live", "reports"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 h-7 rounded text-[12.5px] font-semibold transition-colors outline-none",
                view === v ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "live" ? <><Radio className="w-3.5 h-3.5" /> Live ops</> : <><BarChart3 className="w-3.5 h-3.5" /> Reports</>}
            </button>
          ))}
        </div>
      </div>
      {view === "live" ? <ManagerControlTower /> : <ManagerDashboard />}
    </div>
  );
}

const SLA_BREACH_MIN = 15;

function StatusCell({ label, value, tone, hint }: {
  label: string; value: React.ReactNode; tone: "good" | "warn" | "bad" | "idle"; hint?: string;
}) {
  const dot = tone === "bad" ? "bg-red-500" : tone === "warn" ? "bg-amber-500" : tone === "good" ? "bg-success" : "bg-muted-foreground/40";
  const txt = tone === "bad" ? "text-red-500" : tone === "warn" ? "text-amber-600" : "text-foreground";
  return (
    <div className="flex-1 min-w-[140px] px-4 py-3.5 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className={cn("w-1.5 h-1.5 rounded-full", dot, tone === "bad" && "animate-pulse")} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">{label}</span>
      </div>
      <span className={cn("text-[24px] font-extrabold leading-none tabular-nums", txt)}>{value}</span>
      <span className="text-[11px] text-muted-foreground h-3.5">{hint || ""}</span>
    </div>
  );
}

function AlertRow({ tone, icon: Icon, text, sub, href }: {
  tone: "red" | "amber" | "blue"; icon: any; text: string; sub?: string; href?: string;
}) {
  const tones: Record<string, string> = { red: "bg-red-50 text-red-600", amber: "bg-amber-50 text-amber-700", blue: "bg-blue-50 text-blue-700" };
  const inner = (
    <>
      <div className={cn("w-8 h-8 rounded-md grid place-items-center shrink-0", tones[tone])}><Icon className="w-4 h-4" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-foreground">{text}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
      {href && <ArrowRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />}
    </>
  );
  return href
    ? <Link href={href} className="group flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/60 transition-colors">{inner}</Link>
    : <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0">{inner}</div>;
}

function ManagerControlTower() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  useEffect(() => {
    api.getAnalytics().then(setAnalytics).catch(() => {});
    api.listConversations().then((c) => setConvs(c || [])).catch(() => setConvs([]));
  }, []);

  const list = convs || [];
  const waitMin = (c: Conversation) => c.last_message_at ? (Date.now() - new Date(c.last_message_at).getTime()) / 60000 : 0;
  const isWaiting = (c: Conversation) => c.status !== "closed" && (c.unread_count > 0 || c.last_message_direction === "contact");

  const open = list.filter((c) => c.status !== "closed");
  const waiting = open.filter(isWaiting);
  const unassigned = open.filter((c) => !c.assigned_agent_id);
  const hotWaiting = waiting.filter((c) => c.interest_level === "hot");
  const unassignedHot = unassigned.filter((c) => c.interest_level === "hot");
  const breaching = waiting.filter((c) => waitMin(c) > SLA_BREACH_MIN);
  const longest = waiting.reduce((mx, c) => Math.max(mx, waitMin(c)), 0);
  const hotOldest = unassignedHot.reduce((mx, c) => Math.max(mx, waitMin(c)), 0);

  const agents = analytics?.agents || [];
  // live load per agent (by name) from open conversations
  const load = new Map<string, { open: number; waiting: number; oldest: number }>();
  for (const c of open) {
    const name = c.agent_name;
    if (!name) continue;
    const e = load.get(name) || { open: 0, waiting: 0, oldest: 0 };
    e.open++;
    if (isWaiting(c)) { e.waiting++; e.oldest = Math.max(e.oldest, waitMin(c)); }
    load.set(name, e);
  }
  const maxOpen = Math.max(1, ...Array.from(load.values()).map((v) => v.open));
  const agentsActive = agents.filter((a) => a.leads > 0).length || load.size;

  // Build the attention stream (problems first, with one-tap intervention)
  const alerts: { key: string; tone: "red" | "amber" | "blue"; icon: any; text: string; sub?: string; href?: string }[] = [];
  if (unassignedHot.length) alerts.push({ key: "uh", tone: "red", icon: Flame, text: `${unassignedHot.length} hot lead${unassignedHot.length === 1 ? "" : "s"} unassigned`, sub: `oldest ${fmtDuration(hotOldest)} - assign now`, href: "/inbox?interest=hot" });
  if (breaching.length) alerts.push({ key: "br", tone: "amber", icon: Clock, text: `${breaching.length} lead${breaching.length === 1 ? "" : "s"} past the ${SLA_BREACH_MIN}m SLA`, sub: `longest wait ${fmtDuration(longest)}`, href: "/inbox?unread=1" });
  if (unassigned.length) alerts.push({ key: "un", tone: "blue", icon: Inbox, text: `${unassigned.length} unassigned in the queue`, sub: "needs an owner", href: "/inbox" });
  for (const [name, v] of Array.from(load.entries()).sort((a, b) => b[1].waiting - a[1].waiting)) {
    if (v.waiting >= 3) alerts.push({ key: "ag" + name, tone: "amber", icon: Activity, text: `${name} is stacking up`, sub: `${v.waiting} waiting, ${v.open} open, oldest ${fmtDuration(v.oldest)}` });
  }

  const loading = convs === null;

  return (
    <div className="p-4 space-y-4">
      {/* â”€â”€ Status band (mission control) â”€â”€ */}
      <div className="flex flex-wrap bg-card rounded-lg border border-border shadow-xs overflow-hidden divide-x divide-border">
        <StatusCell label="Open queue" tone="idle" value={loading ? "-" : open.length} hint={`${waiting.length} awaiting reply`} />
        <StatusCell label="Unassigned" tone={unassigned.length ? "warn" : "good"} value={loading ? "-" : unassigned.length} hint={unassigned.length ? "needs owner" : "all owned"} />
        <StatusCell label="Longest wait" tone={longest > SLA_BREACH_MIN ? "bad" : longest > 0 ? "warn" : "good"} value={loading ? "-" : fmtDuration(longest)} hint={`SLA ${SLA_BREACH_MIN}m`} />
        <StatusCell label="SLA breaching" tone={breaching.length ? "bad" : "good"} value={loading ? "-" : breaching.length} hint={breaching.length ? "act now" : "on track"} />
        <StatusCell label="Hot waiting" tone={hotWaiting.length ? "bad" : "good"} value={loading ? "-" : hotWaiting.length} hint="high intent" />
        <StatusCell label="Agents active" tone={agentsActive ? "good" : "idle"} value={loading ? "-" : agentsActive} hint="on the floor" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* â”€â”€ Needs attention (the spine) â”€â”€ */}
        <Card title="Needs attention" subtitle="Act on these first" icon={Radio} iconColor="hsl(var(--primary))" className="lg:col-span-3">
          {loading ? (
            <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 rounded-md" />)}</div>
          ) : alerts.length === 0 ? (
            <div className="flex items-center gap-2.5 px-4 py-3">
              <span className="w-7 h-7 rounded-lg bg-success/10 grid place-items-center shrink-0"><CheckCircle2 className="w-4 h-4 text-success" /></span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground leading-tight">All lanes clear</p>
                <p className="text-[11px] text-muted-foreground">No unassigned, breaching, or stacked queues</p>
              </div>
            </div>
          ) : (
            <div>{alerts.map((a) => <AlertRow key={a.key} tone={a.tone} icon={a.icon} text={a.text} sub={a.sub} href={a.href} />)}</div>
          )}
        </Card>

        {/* â”€â”€ Floor: live agent load â”€â”€ */}
        <Card title="Floor" subtitle="Live agent load" icon={Users} iconColor="hsl(var(--primary))" className="lg:col-span-2">
          {agents.length === 0 && load.size === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No active agents</div>
          ) : (
            <div className="py-1">
              {(agents.length ? Array.from(agents.reduce((m, a) => { const e = m.get(a.agent) || { name: a.agent, won: 0, within5: 0 }; e.won += a.won; e.within5 = Math.max(e.within5, a.within_5_pct); return m.set(a.agent, e); }, new Map<string, { name: string; won: number; within5: number }>()).values()) : Array.from(load.keys()).map((name) => ({ name, won: 0, within5: 0 })))
                .map((a) => {
                  const lv = load.get(a.name) || { open: 0, waiting: 0, oldest: 0 };
                  const pct5 = a.within5 <= 1 ? Math.round(a.within5 * 100) : Math.round(a.within5);
                  const barColor = lv.waiting >= 3 ? "#EF4444" : lv.waiting > 0 ? "#F59E0B" : "#2D8B73";
                  return (
                    <div key={a.name} className="flex items-center gap-2.5 px-4 py-2 border-b border-border/40 last:border-0">
                      <div className="w-7 h-7 rounded-full bg-brand-gradient text-white grid place-items-center text-[10px] font-bold shrink-0">{initials(a.name)}</div>
                      <span className="w-24 truncate text-[12.5px] font-semibold text-foreground">{a.name}</span>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1"><ProgressBar value={(lv.open / maxOpen) * 100} color={barColor} height={6} /></div>
                        <span className="text-[12px] font-bold tabular-nums w-5 text-right text-foreground">{lv.open}</span>
                      </div>
                      {lv.waiting > 0
                        ? <span className="text-[10px] font-bold text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 tabular-nums shrink-0">{lv.waiting}{"·"}{fmtDuration(lv.oldest)}</span>
                        : <span className="text-[10px] font-semibold text-muted-foreground w-12 text-center shrink-0">clear</span>}
                    </div>
                  );
                })}
            </div>
          )}
        </Card>
      </div>

      {/* â”€â”€ Pulse (secondary): funnel + 7-day â”€â”€ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Lead funnel" subtitle="Reached each stage" className="lg:col-span-1"><LeadFunnel stages={analytics?.funnel_stages} /></Card>
        <Card title="Activity" subtitle="Daily leads and replies" className="lg:col-span-2">
          <div className="px-4 py-4"><OverviewChart data={buildChartData(analytics, true)} /></div>
        </Card>
      </div>
    </div>
  );
}

function ManagerDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [tab, setTab] = useState<"overview" | "marketing">("overview");
  const [fChannel, setFChannel] = useState<string[]>([]);
  const [fCampaign, setFCampaign] = useState<string[]>([]);
  const [fAgent, setFAgent] = useState<string[]>([]);
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [agentList, setAgentList] = useState<Agent[]>([]);

  useEffect(() => {
    api.listChannels().then((c) => setChannels(c || [])).catch(() => {});
    api.listCampaigns().then((c) => setCampaigns(c || [])).catch(() => {});
    api.listAgents().then((a) => setAgentList(a || [])).catch(() => {});
  }, []);
  useEffect(() => {
    const f = {
      campaign_id: fCampaign.length ? fCampaign.join(",") : undefined,
      channel_id: fChannel.length ? fChannel.join(",") : undefined,
      agent_id: fAgent.length ? fAgent.join(",") : undefined,
      from: fFrom || undefined, to: fTo || undefined,
    };
    api.getStats(f).then(setStats).catch(() => {});
    api.getAnalytics(f).then(setAnalytics).catch(() => {});
  }, [fChannel, fCampaign, fAgent, fFrom, fTo]);

  if (!stats) return (
    <div className="p-4">
      <Skeleton className="h-20 mb-4" />
      <Skeleton className="h-[300px]" />
    </div>
  );

  const funnel = analytics?.funnel;
  const agents = analytics?.agents || [];
  const funnelMax = funnel ? Math.max(funnel.total, 1) : 1;
  const chartData = buildChartData(analytics, true); // all days; bounded by the date filter when applied

  return (
    <>
      {/* Tabs */}
      <div className="px-4 pt-4">
        <div className="flex border-b border-border">
          {(["overview", "marketing"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 text-[13.5px] font-semibold border-b-2 -mb-px transition-colors outline-none capitalize",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "marketing" ? "Ads" : t}
            </button>
          ))}
        </div>
      </div>

      {tab === "marketing" ? <MarketingAnalytics /> : (
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
          <Select value={dateRange} searchable={false} className="w-[150px]"
            onChange={(v) => { setDateRange(v); if (v !== "custom") { const r = presetRange(v); setFFrom(r.from); setFTo(r.to); } }}
            options={[
              { value: "all", label: "All time" },
              { value: "today", label: "Today" },
              { value: "7d", label: "Last 7 days" },
              { value: "30d", label: "Last 30 days" },
              { value: "90d", label: "Last 90 days" },
              { value: "month", label: "This month" },
              { value: "lastmonth", label: "Last month" },
              { value: "custom", label: "Custom range" },
            ]} />
          {dateRange === "custom" && (
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <input type="date" value={fFrom} max={fTo || undefined} onChange={(e) => setFFrom(e.target.value)}
                className="h-9 px-2 rounded-md border border-input bg-background text-[13px] text-foreground outline-none focus:border-primary" />
              <span>to</span>
              <input type="date" value={fTo} min={fFrom || undefined} onChange={(e) => setFTo(e.target.value)}
                className="h-9 px-2 rounded-md border border-input bg-background text-[13px] text-foreground outline-none focus:border-primary" />
            </div>
          )}
          {(fChannel.length || fCampaign.length || fAgent.length || dateRange !== "all") && (
            <button onClick={() => { setFChannel([]); setFCampaign([]); setFAgent([]); setFFrom(""); setFTo(""); setDateRange("all"); }} className="text-[12px] font-semibold text-primary hover:underline outline-none">Clear</button>
          )}
        </div>

        {/* â”€â”€ Metric Strip â”€â”€ */}
        <div className="flex flex-wrap bg-card rounded-lg border border-border shadow-xs mb-5 overflow-hidden">
          {METRICS.map((m, i) => {
            let val: number;
            if (m.key === "total_leads") val = analytics?.funnel?.total ?? 0;
            else if (m.key === "replied") val = analytics?.funnel?.replied ?? 0;
            else if (m.key === "won") val = analytics?.funnel?.won ?? 0;
            else if (m.key === "avg_rt") val = analytics?.response_time?.median_min ?? 0;
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
              ? <Link key={m.key} href={m.href} className={base}>{inner}</Link>
              : <div key={m.key} className={base}>{inner}</div>;
          })}
        </div>

        {/* â”€â”€ Area Chart (real, last 7 days) â”€â”€ */}
        <Card title="Overview" subtitle={fFrom || fTo ? `${fFrom || "start"} to ${fTo || "now"}` : "All time"} className="mb-5">
          <div className="px-4 py-4"><OverviewChart data={chartData} /></div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
          {/* Real lead funnel - pipeline conversion */}
          <Card title="Lead funnel" subtitle="Reached each stage and beyond">
            <LeadFunnel stages={analytics?.funnel_stages} />
          </Card>

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
          updated: a.updated, contacted: a.contacted, qualified: a.qualified, appointment: a.appointment, negotiation: a.negotiation, purchase: a.purchase,
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
                    <div key={r.reason} className="mb-4 last:mb-0">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-foreground/80">{lostReasonLabel(r.reason)}</span>
                        <span className="text-sm font-bold text-[#EF4444] tabular-nums">{r.count}</span>
                      </div>
                      <ProgressBar value={(r.count / maxCount) * 100} color={i === 0 ? "#EF4444" : i === 1 ? "#F97316" : "#FBBF24"} height={6} />
                    </div>
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
    </>
  );
}

// â”€â”€ Shared agent / campaign performance: two tables (activity + pipeline) â”€â”€â”€â”€â”€â”€
type PerfRow = {
  name: string; branch?: string; leads: number; total_chat: number; replied: number;
  avg_rt_min: number; avg_resp_min: number; within_5_pct: number;
  call_attempts: number; call_duration_sec: number;
  updated: number; contacted: number; qualified: number; appointment: number; negotiation: number; purchase: number;
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
              <TH2 right>Leads</TH2><TH2 right>Replied</TH2><TH2 right>Avg 1st resp</TH2><TH2 right>Avg resp</TH2><TH2 right>Within 5m</TH2><TH2 right>Total chat</TH2><TH2 right>Call attempts</TH2><TH2 right>Call duration</TH2>
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
              <TH2 right>Leads</TH2><TH2 right>Updated</TH2><TH2 right>% Updated</TH2><TH2 right>Contacted</TH2><TH2 right>Qualified</TH2><TH2 right>Appointment</TH2><TH2 right>Negotiation</TH2><TH2 right>Purchase</TH2><TH2 right>% Purchase</TH2>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/60 hover:bg-muted/40">
                  <td className="px-3 py-2.5 font-semibold text-foreground whitespace-nowrap">{r.name}</td>
                  {showBranch && <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.branch || "-"}</td>}
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.leads}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.updated}</td>
                  <td className="px-3 py-2.5 text-right"><Badge label={pctOf(r.updated, r.total_chat)} bg="#EEF2FF" text="#4338CA" /></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.contacted}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.qualified}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.appointment}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.negotiation}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-[#16A34A] tabular-nums">{r.purchase}</td>
                  <td className="px-3 py-2.5 text-right"><Badge label={pctOf(r.purchase, r.total_chat)} bg="#E8F5E9" text="#2E7D32" /></td>
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
  const rows = data || [];
  let total = rows.reduce((a, b) => a + (b.results || 0), 0);
  const useImpr = total === 0;
  if (useImpr) total = rows.reduce((a, b) => a + (b.impressions || 0), 0);
  const chart = rows
    .map((b, i) => ({ name: b.value, value: useImpr ? (b.impressions || 0) : (b.results || 0), color: DONUT_COLORS[i % DONUT_COLORS.length] }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  return (
    <Card title={title} subtitle={useImpr ? "By impressions" : "By results"}>
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
                <RechartsTooltip formatter={(v: any, n: any) => [`${total > 0 ? ((Number(v) / total) * 100).toFixed(1) : 0}%`, n]} />
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
    <Card title="Top locations" subtitle={label} className="mt-5">
      {ranked.length === 0 ? (
        <div className="h-[200px] grid place-items-center text-sm text-muted-foreground flex-col gap-2">
          <MapPin className="w-6 h-6 text-muted-foreground/40" />
          No location data yet
        </div>
      ) : (
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-5 items-center">
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
  const [perf, setPerf] = useState<AdPerformance | null>(null);
  const [currency, setCurrency] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [hasAccounts, setHasAccounts] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { from, to } = dateRange === "custom" ? { from: fFrom, to: fTo } : presetRange(dateRange);
    let alive = true;
    Promise.all([
      api.adPerformance(from || undefined, to || undefined, campaignFilter.length ? campaignFilter : undefined, sourceFilter.length ? sourceFilter : undefined).catch(() => null),
      api.listAdAccounts().catch(() => []),
    ]).then(([p, accts]) => {
      if (!alive) return;
      setPerf(p as AdPerformance | null);
      const a = (accts as { currency?: string | null; platform?: string | null }[]) || [];
      setHasAccounts(a.length > 0);
      setCurrency(a.find((x) => x.currency)?.currency || "");
      setPlatforms(Array.from(new Set(a.map((x) => (x.platform || "").toLowerCase()).filter(Boolean))));
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // Refetch on filter change; keep the previous view visible during refetch.
  }, [dateRange, fFrom, fTo, campaignFilter, sourceFilter]);

  const PLATFORM_LABELS: Record<string, string> = { meta: "Meta Ads", google: "Google Ads", tiktok: "TikTok Ads" };
  const sourceOptions = useMemo(() => platforms.map((p) => ({ value: p, label: PLATFORM_LABELS[p] || p })), [platforms]);

  const campaigns = perf?.campaigns || [];
  const campaignOptions = useMemo(() => campaigns.map((c) => ({ value: c.campaign_id, label: c.campaign_name })), [campaigns]);
  const shown = campaignFilter.length ? campaigns.filter((c) => campaignFilter.includes(c.campaign_id)) : campaigns;
  const t = shown.reduce((a, c) => ({
    spend: a.spend + c.spend, leads: a.leads + c.leads, sales: a.sales + c.sales,
    clicks: a.clicks + c.clicks, impressions: a.impressions + c.impressions, results: a.results + c.results,
  }), { spend: 0, leads: 0, sales: 0, clicks: 0, impressions: 0, results: 0 });
  const cpl = t.leads > 0 ? t.spend / t.leads : 0;
  const cpa = t.sales > 0 ? t.spend / t.sales : 0;
  const convRate = t.leads > 0 ? (t.sales / t.leads) * 100 : 0;
  const money = (n: number) => `${currency ? currency + " " : ""}${fmtMoney(n)}`;
  const creatives = perf?.creatives || [];
  const hasSpend = hasAccounts && campaigns.length > 0;

  // Empty only when there is neither ad spend data nor any ad-attributed lead
  // for the selected range. Rendered INLINE (below the toolbar) so the date
  // filter stays reachable — picking an empty range must not trap the user.
  const isEmpty = !hasSpend && creatives.length === 0;

  const roiCards = [
    { label: "Ad spend", value: money(t.spend), Icon: CircleDollarSign, color: "#F59E0B" },
    { label: "Leads (chats)", value: fmtInt(t.leads), Icon: MessageSquare, color: "#2D8B73" },
    { label: "Cost / lead", value: money(cpl), Icon: Target, color: "#6366F1" },
    { label: "Conversions", value: fmtInt(t.sales), Icon: Trophy, color: "#059669" },
    { label: "Cost / conversion", value: money(cpa), Icon: CircleDollarSign, color: "#0EA5E9" },
    { label: "Lead to purchase", value: `${convRate.toFixed(1)}%`, Icon: Target, color: "#EF4444" },
  ];

  const funnel = [
    { label: "Impressions", value: t.impressions, color: "#94A3B8", Icon: Eye },
    { label: "Clicks", value: t.clicks, color: "#0EA5E9", Icon: MousePointerClick },
    { label: "Leads (chats)", value: t.leads, color: "#2D8B73", Icon: MessageSquare },
    { label: "Conversions", value: t.sales, color: "#059669", Icon: Trophy },
  ];
  const fTop = Math.max(funnel[0].value, 1);

  const daily = (perf?.daily || []).map((d) => {
    const dt = new Date(d.date);
    return {
      date: isNaN(dt.getTime()) ? d.date : `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`,
      spend: d.spend || 0, impressions: d.impressions || 0, reach: d.reach || 0, clicks: d.clicks || 0, leads: d.leads || 0,
    };
  }).reverse(); // chart reads left (oldest) -> right (newest)

  return (
    <div className="p-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex-1" />
        {sourceOptions.length > 1 && (
          <MultiSelect value={sourceFilter} onChange={setSourceFilter} options={sourceOptions} placeholder="All sources" className="w-[170px]" />
        )}
        <MultiSelect value={campaignFilter} onChange={setCampaignFilter} options={campaignOptions} placeholder="All campaigns" className="w-[200px]" />
        <Select value={dateRange} searchable={false} className="w-[150px]"
          onChange={(v) => { setDateRange(v); if (v !== "custom") { const r = presetRange(v); setFFrom(r.from); setFTo(r.to); } }}
          options={[
            { value: "all", label: "All time" },
            { value: "today", label: "Today" },
            { value: "7d", label: "Last 7 days" },
            { value: "30d", label: "Last 30 days" },
            { value: "90d", label: "Last 90 days" },
            { value: "month", label: "This month" },
            { value: "lastmonth", label: "Last month" },
            { value: "custom", label: "Custom range" },
          ]} />
        {dateRange === "custom" && (
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <input type="date" value={fFrom} max={fTo || undefined} onChange={(e) => setFFrom(e.target.value)}
              className="h-9 px-2 rounded-md border border-input bg-background text-[13px] text-foreground outline-none focus:border-primary" />
            <span>to</span>
            <input type="date" value={fTo} min={fFrom || undefined} onChange={(e) => setFTo(e.target.value)}
              className="h-9 px-2 rounded-md border border-input bg-background text-[13px] text-foreground outline-none focus:border-primary" />
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-8"><Skeleton className="h-20 mb-4" /><Skeleton className="h-[280px]" /></div>
      ) : (<>
      {hasSpend ? (
      <>
      {/* ROI cards */}
      <div className="flex flex-wrap bg-card rounded-lg border border-border shadow-xs mb-5 overflow-hidden">
        {roiCards.map((c, i) => (
          <div key={c.label} className={cn("flex-1 min-w-[150px] flex items-center gap-3 px-4 py-3.5", i < roiCards.length - 1 && "border-r border-border")}>
            <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0" style={{ backgroundColor: c.color + "14" }}><c.Icon className="w-[18px] h-[18px]" style={{ color: c.color }} /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-tight truncate">{c.label}</p>
              <p className="text-[20px] font-extrabold text-foreground leading-none tabular-nums mt-1 whitespace-nowrap">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-5">
        {/* Marketing funnel */}
        <Card title="Marketing funnel" subtitle="Impression to click to chat to conversion" className="lg:col-span-2">
          <div className="p-4 space-y-2.5">
            {funnel.map((s, i) => {
              const pct = (s.value / fTop) * 100;
              const rate = i === 0 ? null : (funnel[i - 1].value > 0 ? (s.value / funnel[i - 1].value) * 100 : 0);
              return (
                <div key={s.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground/90"><s.Icon className="w-3.5 h-3.5" style={{ color: s.color }} />{s.label}</span>
                    <div className="flex items-center gap-2">
                      {rate !== null && <span className="text-[11px] tabular-nums text-muted-foreground">{rate.toFixed(1)}%</span>}
                      <span className="text-[13px] font-bold tabular-nums text-foreground min-w-[3rem] text-right">{fmtInt(s.value)}</span>
                    </div>
                  </div>
                  <div className="h-6 rounded-md bg-muted/50 overflow-hidden"><div className="h-full rounded-md transition-all duration-500" style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: s.color }} /></div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Timeline: impressions/reach (lines) + link clicks/results (bars) */}
        <Card title="Timeline" subtitle="Daily impressions, reach, clicks and leads" className="lg:col-span-3">
          <div className="px-4 py-4">
            {daily.length === 0 ? <div className="h-[260px] grid place-items-center text-sm text-muted-foreground">No daily data</div> : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={daily} margin={{ top: 12, right: 8, left: -12, bottom: 0 }} barGap={4}>
                  <defs>
                    <linearGradient id="tlImp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563EB" stopOpacity={0.18} /><stop offset="100%" stopColor="#2563EB" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(0,0,0,0.05)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} minTickGap={16} padding={{ left: 20, right: 20 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={44} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.035)" }} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" iconSize={8} />
                  <Bar yAxisId="right" dataKey="clicks" name="Link clicks" fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Bar yAxisId="right" dataKey="leads" name="Leads (chats)" fill="#2D8B73" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Area yAxisId="left" type="monotone" dataKey="impressions" name="Impressions" stroke="#2563EB" strokeWidth={2.5} fill="url(#tlImp)" dot={{ r: 3, fill: "#2563EB", strokeWidth: 0 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
                  <Line yAxisId="left" type="monotone" dataKey="reach" name="Reach" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3, fill: "#10B981", strokeWidth: 0 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Demographic performance donuts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <BreakdownDonut title="Age performance" data={perf?.age} />
        <BreakdownDonut title="Gender performance" data={perf?.gender} />
      </div>

      {/* Location performance (province-level) */}
      <LocationPerformance data={perf?.region} currency={currency} />

      {/* Per-campaign ROI table */}
      <Card title="Campaign ROI" subtitle="Spend to leads to conversions, per campaign">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Campaign", "Spend", "Impressions", "Clicks", "Leads", "Cost / lead", "Conversions", "Cost / conv", "Lead to purchase"].map((h, idx) => (
                  <th key={h} className={cn("px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground", idx === 0 ? "text-left" : "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No campaigns in range</td></tr>
              ) : shown.slice().sort((a, b) => b.spend - a.spend).map((c) => {
                const ccpl = c.leads > 0 ? c.spend / c.leads : 0;
                const ccpa = c.sales > 0 ? c.spend / c.sales : 0;
                const cr = c.leads > 0 ? (c.sales / c.leads) * 100 : 0;
                return (
                  <tr key={c.campaign_id} className="border-b border-border/60 hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2.5 font-semibold text-foreground">{c.campaign_name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(c.spend)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmtInt(c.impressions)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmtInt(c.clicks)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-primary">{fmtInt(c.leads)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.leads > 0 ? money(ccpl) : "-"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[#059669]">{fmtInt(c.sales)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.sales > 0 ? money(ccpa) : "-"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Badge label={c.leads > 0 ? `${cr.toFixed(1)}%` : "-"} bg={cr >= 20 ? "#E8F5E9" : cr > 0 ? "#FFF3E0" : "#F1F5F9"} text={cr >= 20 ? "#2E7D32" : cr > 0 ? "#E65100" : "#64748B"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      </>
      ) : (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-[13px] text-muted-foreground">
          <CircleDollarSign className="w-4 h-4 text-muted-foreground/70 shrink-0" />
          Connect a Meta ad account to add spend, cost per lead and ROI. The lead attribution below works without it.
        </div>
      )}

      {/* Per ad / creative: which click-to-WhatsApp ad drove leads + conversions */}
      <Card title="Per ad / creative" subtitle="Leads to conversions by click-to-WhatsApp ad" className="mt-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Creative", "Ad / source id", "Spend", "Impressions", "Clicks", "Leads", "Cost / lead", "Conversions", "Cost / conv", "Lead to purchase", "Link"].map((h, idx) => (
                  <th key={h} className={cn("px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground", idx <= 1 ? "text-left" : "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(perf?.creatives || []).length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-muted-foreground">No ad-attributed leads in range</td></tr>
              ) : (perf?.creatives || []).map((cr) => {
                const rate = cr.leads > 0 ? (cr.sales / cr.leads) * 100 : 0;
                const ccpl = cr.leads > 0 ? cr.spend / cr.leads : 0;
                const ccpa = cr.sales > 0 ? cr.spend / cr.sales : 0;
                return (
                  <tr key={cr.source_id} className="border-b border-border/60 hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2 w-14">
                      <div className="relative w-11 h-11 rounded-md border border-border bg-muted/60 overflow-hidden grid place-items-center text-muted-foreground/50">
                        <ImageIcon className="w-4 h-4" />
                        {cr.image_url && (
                          <a href={cr.source_url || cr.image_url} target="_blank" rel="noreferrer" title={cr.headline || ""} className="absolute inset-0">
                            <img src={cr.image_url} alt={cr.headline || "Ad creative"} loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} className="w-full h-full object-cover" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-[12px] text-foreground">{cr.source_id}</div>
                      {cr.headline && <div className="text-[11px] text-muted-foreground max-w-[220px] truncate">{cr.headline}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{cr.spend > 0 ? money(cr.spend) : "-"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{cr.impressions > 0 ? fmtInt(cr.impressions) : "-"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{cr.clicks > 0 ? fmtInt(cr.clicks) : "-"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-primary">{fmtInt(cr.leads)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{cr.leads > 0 && cr.spend > 0 ? money(ccpl) : "-"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[#059669]">{fmtInt(cr.sales)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{cr.sales > 0 && cr.spend > 0 ? money(ccpa) : "-"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Badge label={cr.leads > 0 ? `${rate.toFixed(1)}%` : "-"} bg={rate >= 20 ? "#E8F5E9" : rate > 0 ? "#FFF3E0" : "#F1F5F9"} text={rate >= 20 ? "#2E7D32" : rate > 0 ? "#E65100" : "#64748B"} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {cr.source_url ? <a href={cr.source_url} target="_blank" rel="noreferrer" className="text-[12px] text-primary hover:underline">View ad</a> : <span className="text-muted-foreground">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      </>)}
    </div>
  );
}
