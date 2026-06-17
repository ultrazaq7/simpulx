"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import {
  BarChart3, MessageSquare, Inbox, Flame, Timer,
  TrendingDown, ChevronRight, Zap, Phone, Mail, Reply, Trophy,
  Clock, ArrowRight, CheckCircle2, Activity, Users, Radio,
} from "lucide-react";

import { api, getUser } from "@/lib/api";
import type { Stats, Analytics, CampaignAnalyticsRow, DashboardCards, Conversation } from "@/lib/types";
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
  { key: "won", label: "Won", Icon: Trophy, color: "#059669" },
  { key: "avg_rt", label: "Avg first response", Icon: Timer, color: "#7C3AED", fmt: fmtDuration },
];

// Real 7-day series from analytics.daily (no fabrication). Returns [] when absent.
function buildChartData(analytics: Analytics | null) {
  const daily = analytics?.daily;
  if (!daily || daily.length === 0) return [];
  return daily.slice(-7).map((d) => {
    const dt = new Date(d.day);
    const label = isNaN(dt.getTime())
      ? d.day
      : `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
    return { date: label, leads: d.leads || 0, replied: d.replied || 0 };
  });
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-foreground rounded-lg px-3 py-2 shadow-xl">
      <p className="text-[11px] text-white/60 mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-xs text-white font-medium tabular-nums">{p.name}: <b>{p.value}</b></span>
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

// Card shell — crisp, layered, enterprise
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

// Real lead funnel: cumulative "reached this stage or beyond" along the actual sales
// pipeline, with stage-to-stage conversion %. Driven by analytics.funnel_stages.
const FUNNEL_COLORS = ["#2D8B73", "#10B981", "#0EA5E9", "#6366F1", "#8B5CF6", "#F59E0B", "#059669"];
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

// ── Agent dashboard: action-center (essentials only, no org analytics, no lead score) ──
const AGENT_CARDS = [
  { key: "open", label: "My open", sub: "Active conversations", Icon: MessageSquare, color: "#2D8B73", href: "/inbox" },
  { key: "hot", label: "Hot leads", sub: "High buying intent", Icon: Flame, color: "#EF4444", href: "/inbox?interest=hot" },
  { key: "follow_up", label: "Follow up now", sub: "Hot/warm and unread", Icon: Zap, color: "#F59E0B", href: "/inbox?followup=1" },
  { key: "need_call", label: "Need to call", sub: "Hot, not called yet", Icon: Phone, color: "#0284C7", href: "/inbox?interest=hot" },
  { key: "unread", label: "Unread", sub: "Waiting on you", Icon: Mail, color: "#6366F1", href: "/inbox?unread=1" },
] as const;

function AgentDashboard() {
  const [cards, setCards] = useState<DashboardCards | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  useEffect(() => {
    // Fall back to zeros (not an endless skeleton) if the endpoint isn't deployed yet.
    api.getDashboardCards().then(setCards).catch(() => setCards({ open: 0, hot: 0, follow_up: 0, need_call: 0, unread: 0 }));
    api.getAnalytics().then(setAnalytics).catch(() => {});
  }, []);
  const chartData = buildChartData(analytics);

  return (
    <div className="p-4">
      {/* Action cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        {AGENT_CARDS.map((c) => {
          const v = cards ? (cards as any)[c.key] as number : null;
          return (
            <Link key={c.key} href={c.href} className="group bg-card rounded-lg border border-border shadow-xs p-4 hover:shadow-md hover:border-primary/30 transition-all">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-lg grid place-items-center" style={{ backgroundColor: c.color + "14" }}>
                  <c.Icon className="w-5 h-5" style={{ color: c.color }} />
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </div>
              {v === null
                ? <div className="skeleton rounded h-7 w-12" />
                : <p className="text-[28px] font-extrabold text-foreground leading-none tabular-nums">{v}</p>}
              <p className="text-[13px] font-bold text-foreground mt-2">{c.label}</p>
              <p className="text-[11px] text-muted-foreground">{c.sub}</p>
            </Link>
          );
        })}
      </div>

      {/* Personal activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Your last 7 days" subtitle="Leads and replies" className="lg:col-span-2">
          <div className="px-4 py-4"><OverviewChart data={chartData} /></div>
        </Card>
        <Card title="Your interest split">
          <InterestSplit funnel={analytics?.funnel} />
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

// ── Manager home: Live ops (Control Tower) ⟷ Reports (deep analytics) ──
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
      {/* ── Status band (mission control) ── */}
      <div className="flex flex-wrap bg-card rounded-lg border border-border shadow-xs overflow-hidden divide-x divide-border">
        <StatusCell label="Open queue" tone="idle" value={loading ? "—" : open.length} hint={`${waiting.length} awaiting reply`} />
        <StatusCell label="Unassigned" tone={unassigned.length ? "warn" : "good"} value={loading ? "—" : unassigned.length} hint={unassigned.length ? "needs owner" : "all owned"} />
        <StatusCell label="Longest wait" tone={longest > SLA_BREACH_MIN ? "bad" : longest > 0 ? "warn" : "good"} value={loading ? "—" : fmtDuration(longest)} hint={`SLA ${SLA_BREACH_MIN}m`} />
        <StatusCell label="SLA breaching" tone={breaching.length ? "bad" : "good"} value={loading ? "—" : breaching.length} hint={breaching.length ? "act now" : "on track"} />
        <StatusCell label="Hot waiting" tone={hotWaiting.length ? "bad" : "good"} value={loading ? "—" : hotWaiting.length} hint="high intent" />
        <StatusCell label="Agents active" tone={agentsActive ? "good" : "idle"} value={loading ? "—" : agentsActive} hint="on the floor" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* ── Needs attention (the spine) ── */}
        <Card title="Needs attention" subtitle="Act on these first" icon={Radio} iconColor="hsl(var(--primary))" className="lg:col-span-3">
          {loading ? (
            <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 rounded-md" />)}</div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-xl bg-success/10 grid place-items-center mb-3"><CheckCircle2 className="w-6 h-6 text-success" /></div>
              <p className="text-[13px] font-semibold text-foreground">All lanes clear</p>
              <p className="text-xs text-muted-foreground">No unassigned, breaching, or stacked queues</p>
            </div>
          ) : (
            <div>{alerts.map((a) => <AlertRow key={a.key} tone={a.tone} icon={a.icon} text={a.text} sub={a.sub} href={a.href} />)}</div>
          )}
        </Card>

        {/* ── Floor: live agent load ── */}
        <Card title="Floor" subtitle="Live agent load" icon={Users} iconColor="hsl(var(--primary))" className="lg:col-span-2">
          {agents.length === 0 && load.size === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No active agents</div>
          ) : (
            <div className="py-1">
              {(agents.length ? agents.map((a) => ({ name: a.agent, won: a.won, within5: a.within_5_pct })) : Array.from(load.keys()).map((name) => ({ name, won: 0, within5: 0 })))
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
                        ? <span className="text-[10px] font-bold text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 tabular-nums shrink-0">{lv.waiting}·{fmtDuration(lv.oldest)}</span>
                        : <span className="text-[10px] font-semibold text-muted-foreground/60 w-12 text-center shrink-0">clear</span>}
                    </div>
                  );
                })}
            </div>
          )}
        </Card>
      </div>

      {/* ── Pulse (secondary): interest + 7-day ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Interest mix" className="lg:col-span-1"><InterestSplit funnel={analytics?.funnel} /></Card>
        <Card title="Activity" subtitle="Last 7 days" className="lg:col-span-2">
          <div className="px-4 py-4"><OverviewChart data={buildChartData(analytics)} /></div>
        </Card>
      </div>
    </div>
  );
}

function ManagerDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [tab, setTab] = useState<"overview" | "campaigns">("overview");

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {});
    api.getAnalytics().then(setAnalytics).catch(() => {});
  }, []);

  if (!stats) return (
    <div className="p-4">
      <Skeleton className="h-20 mb-4" />
      <Skeleton className="h-[300px]" />
    </div>
  );

  const funnel = analytics?.funnel;
  const agents = analytics?.agents || [];
  const funnelMax = funnel ? Math.max(funnel.total, 1) : 1;
  const chartData = buildChartData(analytics);

  return (
    <>
      {/* Tabs */}
      <div className="px-4 pt-4">
        <div className="flex border-b border-border">
          {(["overview", "campaigns"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 text-[13.5px] font-semibold border-b-2 -mb-px transition-colors outline-none capitalize",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "campaigns" ? <CampaignsAnalytics /> : (
      <div className="p-4">
        {/* ── Metric Strip ── */}
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

        {/* ── Area Chart (real, last 7 days) ── */}
        <Card title="Overview" subtitle="Last 7 days" className="mb-5">
          <div className="px-4 py-4"><OverviewChart data={chartData} /></div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {/* Real lead funnel — pipeline conversion */}
          <Card title="Lead funnel" subtitle="Reached each stage and beyond">
            <LeadFunnel stages={analytics?.funnel_stages} />
          </Card>

          {/* Interest Level — clickable rows deep-link to filtered inbox */}
          <Card title="Interest level">
            <InterestSplit funnel={funnel} />
          </Card>
        </div>

        {/* SLA Monitoring */}
        <Card title="SLA & activity monitoring" className="mb-5">
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: "Follow-ups sent", value: funnel?.followups || 0 },
              { label: "Call attempts", value: funnel?.call_attempts || 0 },
              { label: "Call duration", value: fmtDuration((funnel?.call_duration_sec || 0) / 60) },
              { label: "Median first response", value: fmtDuration(analytics?.response_time?.median_min) },
              { label: "Avg first response", value: fmtDuration(analytics?.response_time?.avg_min) },
              { label: "Agent replied", value: funnel?.replied || 0 },
            ].map(sla => (
              <div key={sla.label} className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground font-medium">{sla.label}</span>
                <span className="text-2xl font-extrabold text-foreground tabular-nums">{sla.value}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Agent Performance */}
        <Card title="Agent follow-up performance">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Agent</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Leads</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Replied</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Avg first response</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Within 5 min</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Hot</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Won</th>
                </tr>
              </thead>
              <tbody>
                {agents.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No data yet</td></tr>
                ) : agents.map((a) => {
                  const pct5 = a.within_5_pct <= 1 ? a.within_5_pct : a.within_5_pct / 100;
                  return (
                    <tr key={a.agent} className="border-b border-border/60 hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-2.5 font-semibold text-foreground">{a.agent}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{a.leads}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Badge label={a.leads > 0 ? `${Math.round((a.replied / a.leads) * 100)}%` : "-"} bg="#E8F5E9" text="#2E7D32" />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtDuration(a.avg_rt_min)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {a.leads > 0 ? (
                          <Badge
                            label={`${a.within_5_pct <= 1 ? Math.round(a.within_5_pct * 100) : Math.round(a.within_5_pct)}%`}
                            bg={pct5 >= 0.8 ? "#E8F5E9" : pct5 >= 0.5 ? "#FFF3E0" : "#FFEBEE"}
                            text={pct5 >= 0.8 ? "#2E7D32" : pct5 >= 0.5 ? "#E65100" : "#C62828"}
                          />
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-[#EF4444] tabular-nums">{a.hot || 0}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-[#059669] tabular-nums">{a.won}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

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
                    <p className="text-xs text-[#065F46] font-semibold">Won rate</p>
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
                        <span className="text-sm font-medium text-foreground/80">{r.reason}</span>
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

// ── Campaigns analytics sub-tab ──────────────────────────────
function CampaignsAnalytics() {
  const [rows, setRows] = useState<CampaignAnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.getCampaignAnalytics().then(setRows).catch(() => {}).finally(() => setLoading(false)); }, []);

  const totals = rows.reduce((t, r) => ({
    conversations: t.conversations + r.conversations,
    replied: t.replied + r.replied,
    strong: t.strong + r.strong,
    won: t.won + r.won,
  }), { conversations: 0, replied: 0, strong: 0, won: 0 });

  const cards = [
    { label: "Campaigns", value: rows.length, color: "#6366F1" },
    { label: "Conversations", value: totals.conversations, color: "#2D8B73" },
    { label: "Strong intent", value: totals.strong, color: "#EF4444" },
    { label: "Won", value: totals.won, color: "#059669" },
  ];

  return (
    <div className="p-4">
      <div className="flex flex-wrap bg-card rounded-lg border border-border shadow-xs mb-5 overflow-hidden">
        {cards.map((c, i) => (
          <div key={c.label} className={cn("flex-1 min-w-[150px] px-5 py-4", i < cards.length - 1 && "border-r border-border")}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{c.label}</p>
            <p className="text-2xl font-extrabold leading-tight tabular-nums mt-1" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      <Card title="Campaign performance">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Campaign", "Dealer", "Agents", "Leads", "Conversations", "Replied", "Strong intent", "Won", "Status"].map((h, idx) => (
                  <th key={h} className={cn("px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground", idx >= 2 && idx <= 7 ? "text-right" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="p-4"><Skeleton className="h-7" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No campaigns yet</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-foreground">{r.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.dealer_name || "-"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.agents}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.lead_count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.conversations}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Badge label={r.conversations > 0 ? `${Math.round((r.replied / r.conversations) * 100)}%` : "-"} bg="#E8F5E9" text="#2E7D32" />
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-primary tabular-nums">{r.strong}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-[#059669] tabular-nums">{r.won}</td>
                  <td className="px-4 py-2.5">
                    <Badge label={r.status} bg={r.status === "active" ? "#DCFCE7" : "#F1F5F9"} text={r.status === "active" ? "#15803D" : "#64748B"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
