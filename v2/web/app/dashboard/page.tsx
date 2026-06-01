"use client";
import { useEffect, useState } from "react";
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, LinearProgress, Chip, Skeleton, Tabs, Tab,
} from "@mui/material";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import MoveToInboxRoundedIcon from "@mui/icons-material/MoveToInboxRounded";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import WhatshotRoundedIcon from "@mui/icons-material/WhatshotRounded";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import Shell from "@/components/Shell";
import { api } from "@/lib/api";
import type { Stats, Analytics, CampaignAnalyticsRow } from "@/lib/types";

import LeaderboardOutlinedIcon from "@mui/icons-material/LeaderboardOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";

const METRICS = [
  { key: "total_leads", label: "Leads", Icon: LeaderboardOutlinedIcon, color: "#6366F1" },
  { key: "active", label: "Active", Icon: ChatBubbleOutlineRoundedIcon, color: "#2D8B73" },
  { key: "unassigned", label: "Unassigned", Icon: MoveToInboxRoundedIcon, color: "#E67E22" },
  { key: "bot_active", label: "AI Handled", Icon: SmartToyOutlinedIcon, color: "#7C3AED" },
  { key: "handoffs", label: "Strong Intent", Icon: WhatshotRoundedIcon, color: "#EF4444" },
  { key: "avg_rt_min", label: "Avg. Response Time", Icon: TimerOutlinedIcon, color: "#0284C7", fmt: (v: number) => {
    if (!v || v <= 0) return "-";
    if (v >= 60) return `${Math.floor(v / 60)}h ${Math.round(v % 60)}m`;
    if (v >= 1) return `${Math.round(v * 10) / 10}m`;
    return `${Math.round(v * 60)}s`;
  }},
  { key: "bookings", label: "Booking", Icon: EventAvailableOutlinedIcon, color: "#059669" },
];

// Generate mock 7-day chart data from stats
function generateChartData(stats: Stats) {
  const today = new Date();
  const data = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const label = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    // Simulate realistic distribution
    const factor = i === 0 ? 1 : i === 1 ? 0.85 : i === 2 ? 0.7 : Math.random() * 0.4 + 0.1;
    data.push({
      date: label,
      conversations: Math.round(stats.active * factor),
      replied: Math.round(stats.active * factor * 0.8),
      contacts: Math.round(stats.contacts * factor * 0.3),
    });
  }
  return data;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{ bgcolor: "#0F172A", borderRadius: "8px", px: 2, py: 1.5, boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
      <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.6)", mb: 0.75 }}>{label}</Typography>
      {payload.map((p: any) => (
        <Box key={p.dataKey} sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.25 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: p.color }} />
          <Typography sx={{ fontSize: 12, color: "#fff", fontWeight: 500 }}>{p.name}: <b>{p.value}</b></Typography>
        </Box>
      ))}
    </Box>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {});
    api.getAnalytics().then(setAnalytics).catch(() => {});
  }, []);

  if (!stats) return (
    <Shell>
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rectangular" height={80} sx={{ borderRadius: "8px", mb: 2 }} />
        <Skeleton variant="rectangular" height={300} sx={{ borderRadius: "8px" }} />
      </Box>
    </Shell>
  );

  const funnel = analytics?.funnel;
  const agents = analytics?.agents || [];
  const funnelMax = funnel ? Math.max(funnel.total, 1) : 1;
  const chartData = generateChartData(stats);

  return (
    <Shell>
      <Box sx={{ px: 2, pt: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ "& .MuiTab-root": { textTransform: "none", fontWeight: 600, fontSize: 13.5, minHeight: 40 } }}>
          <Tab label="Overview" />
          <Tab label="Campaigns" />
        </Tabs>
      </Box>
      {tab === 1 ? <CampaignsAnalytics /> : (
      <Box sx={{ p: 2, pt: 2 }}>
        {/* ── Metric Strip ── */}
        <Box sx={{
          display: "flex", bgcolor: "background.paper", borderRadius: "8px",
          border: "1px solid", borderColor: "divider", mb: 3, overflow: "hidden",
        }}>
          {METRICS.map((m, i) => {
            // Resolve KPI values from stats + analytics
            let val: number;
            if (m.key === "total_leads") val = analytics?.funnel?.total ?? stats.contacts ?? 0;
            else if (m.key === "avg_rt_min") val = analytics?.response_time?.median_min ?? 0;
            else if (m.key === "bookings") val = agents.reduce((s, a) => s + (a.won || 0), 0);
            else val = (stats as any)[m.key] ?? 0;
            const Icon = m.Icon;
            return (
              <Box key={m.key} sx={{
                flex: 1, px: 2, py: 2, display: "flex", alignItems: "center", gap: 1.5,
                borderRight: i < METRICS.length - 1 ? "1px solid" : "none", borderColor: "divider",
                transition: "background 0.15s",
                "&:hover": { bgcolor: "rgba(45,139,115,0.04)" },
              }}>
                <Box sx={{ width: 36, height: 36, borderRadius: "8px", bgcolor: `${m.color}12`, display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <Icon sx={{ fontSize: 18, color: m.color }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 10, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.2 }}>
                    {m.label}
                  </Typography>
                  <Typography sx={{ fontSize: 22, fontWeight: 800, color: "text.primary", lineHeight: 1, letterSpacing: "-0.02em" }}>
                    {m.fmt ? m.fmt(val) : val}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>

        {/* ── Area Chart (Last 7 Days) ── */}
        <Box sx={{ bgcolor: "background.paper", borderRadius: "8px", border: "1px solid", borderColor: "divider", mb: 3, overflow: "hidden" }}>
          <Box sx={{ px: 2, py: 2, borderBottom: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Overview</Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>Last 7 Days</Typography>
            </Box>
          </Box>
          <Box sx={{ px: 2, py: 2 }}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorConvo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#7C3AED" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="colorReplied" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2D8B73" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#2D8B73" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="colorContacts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E67E22" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#E67E22" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(0,0,0,0.08)" }} />
                <Legend iconType="circle" iconSize={8}
                  wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                  formatter={(v: string) => <span style={{ color: "#667085", fontWeight: 500 }}>{v}</span>}
                />
                <Area type="monotone" dataKey="conversations" name="Conversations" stroke="#7C3AED" strokeWidth={2.5}
                  fill="url(#colorConvo)" dot={{ r: 3.5, fill: "#fff", stroke: "#7C3AED", strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: "#7C3AED", stroke: "#fff", strokeWidth: 2 }}
                />
                <Area type="monotone" dataKey="replied" name="Replied" stroke="#2D8B73" strokeWidth={2}
                  fill="url(#colorReplied)" dot={{ r: 3, fill: "#fff", stroke: "#2D8B73", strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: "#2D8B73", stroke: "#fff", strokeWidth: 2 }}
                />
                <Area type="monotone" dataKey="contacts" name="New Contacts" stroke="#E67E22" strokeWidth={2}
                  fill="url(#colorContacts)" dot={{ r: 3, fill: "#fff", stroke: "#E67E22", strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: "#E67E22", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}>
          {/* Lead Funnel */}
          <Box sx={{ bgcolor: "background.paper", borderRadius: "8px", border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
            <Box sx={{ px: 2, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Lead funnel</Typography>
            </Box>
            <Box sx={{ p: 2 }}>
              {funnel && [
                { label: "Total leads", value: funnel.total, color: "#2D8B73" },
                { label: "Replied", value: funnel.replied, color: "#0288D1" },
                { label: "Showed intent", value: funnel.intent, color: "#ED6C02" },
                { label: "Strong intent", value: funnel.strong_intent, color: "#D32F2F" },
              ].map((row) => (
                <Box key={row.label} sx={{ mb: 2.5, "&:last-child": { mb: 0 } }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.75 }}>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>{row.label}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: row.color }}>{row.value}</Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={(row.value / funnelMax) * 100}
                    sx={{ height: 8, borderRadius: "8px", bgcolor: "rgba(0,0,0,0.04)", "& .MuiLinearProgress-bar": { borderRadius: "8px", bgcolor: row.color } }}
                  />
                </Box>
              ))}
            </Box>
          </Box>

          {/* Interest Level */}
          <Box sx={{ bgcolor: "background.paper", borderRadius: "8px", border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
            <Box sx={{ px: 2, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Interest level</Typography>
            </Box>
            <Box sx={{ p: 2 }}>
              {funnel && [
                { label: "Hot", value: funnel.hot, color: "#D32F2F" },
                { label: "Warm", value: funnel.warm, color: "#ED6C02" },
                { label: "Cold", value: funnel.cold, color: "#0288D1" },
                { label: "Unclassified", value: funnel.unknown, color: "#9CA3AF" },
              ].map((row) => (
                <Box key={row.label} sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2.5, "&:last-child": { mb: 0 } }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: row.color, flexShrink: 0 }} />
                  <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>{row.label}</Typography>
                  <LinearProgress variant="determinate" value={funnel.total > 0 ? (row.value / funnel.total) * 100 : 0}
                    sx={{ flex: 2, height: 8, borderRadius: "8px", bgcolor: "rgba(0,0,0,0.04)", "& .MuiLinearProgress-bar": { borderRadius: "8px", bgcolor: row.color } }}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 28, textAlign: "right", color: row.color }}>{row.value}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
        {/* SLA Monitoring */}
        <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
          <Box sx={{ flex: 1, bgcolor: "background.paper", borderRadius: "8px", border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
            <Box sx={{ px: 2, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15 }}>SLA & Activity Monitoring</Typography>
            </Box>
            <Box sx={{ p: 2, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {[
                { label: "Follow-up Count", value: funnel?.followups || 0 },
                { label: "Call Attempts", value: funnel?.call_attempts || 0 },
                { label: "Call Duration", value: (funnel?.call_duration_sec || 0) > 60 ? Math.round((funnel?.call_duration_sec || 0)/60) + "m" : (funnel?.call_duration_sec || 0) + "s" },
                { label: "Avg. Response Time", value: analytics?.response_time?.avg_min ? Math.round(analytics.response_time.avg_min) + "m" : "-" },
                { label: "Median Response", value: analytics?.response_time?.median_min ? Math.round(analytics.response_time.median_min) + "m" : "-" },
                { label: "Leads Touched (Replied)", value: funnel?.replied || 0 },
              ].map(sla => (
                <Box key={sla.label} sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 500 }}>{sla.label}</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>{sla.value}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        {/* Agent Performance */}
        <Box sx={{ bgcolor: "background.paper", borderRadius: "8px", border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
          <Box sx={{ px: 2, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
            <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Agent follow-up performance</Typography>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ "& th": { fontWeight: 600, fontSize: 13, color: "text.secondary", py: 1.5, borderBottom: "1px solid", borderColor: "divider" } }}>
                  <TableCell>Agent</TableCell>
                  <TableCell align="right">Leads</TableCell>
                  <TableCell align="right">Replied</TableCell>
                  <TableCell align="right">Avg. First Response</TableCell>
                  <TableCell align="right">Avg. Response Time</TableCell>
                  <TableCell align="right">Within 5 min</TableCell>
                  <TableCell align="right">Strong Intent</TableCell>
                  <TableCell align="right">Booking</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {agents.length === 0 ? (
                  <TableRow><TableCell colSpan={8} align="center" sx={{ py: 6, color: "text.secondary" }}>No data yet</TableCell></TableRow>
                ) : agents.map((a) => {
                  const fmtTime = (min: number) => {
                    if (!min || min <= 0) return "-";
                    if (min >= 60) return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
                    if (min >= 1) return `${Math.round(min * 10) / 10}m`;
                    return `${Math.round(min * 60)}s`;
                  };
                  const pct5 = a.within_5_pct <= 1 ? a.within_5_pct : a.within_5_pct / 100;
                  return (
                  <TableRow key={a.agent} sx={{ "&:hover": { bgcolor: "#FAFBFC" } }}>
                    <TableCell><Typography variant="body2" sx={{ fontWeight: 600 }}>{a.agent}</Typography></TableCell>
                    <TableCell align="right">{a.leads}</TableCell>
                    <TableCell align="right">
                      <Chip label={a.leads > 0 ? `${Math.round((a.replied / a.leads) * 100)}%` : "-"} size="small"
                        sx={{ bgcolor: "#E8F5E9", color: "#2E7D32", fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell align="right">{fmtTime(a.avg_first_rt_min ?? a.median_rt_min)}</TableCell>
                    <TableCell align="right">{fmtTime(a.avg_rt_min ?? 0)}</TableCell>
                    <TableCell align="right">
                      <Chip label={`${a.within_5_pct <= 1 ? Math.round(a.within_5_pct * 100) : Math.round(a.within_5_pct)}%`} size="small"
                        sx={{ bgcolor: pct5 >= 0.8 ? "#E8F5E9" : pct5 >= 0.5 ? "#FFF3E0" : "#FFEBEE",
                          color: pct5 >= 0.8 ? "#2E7D32" : pct5 >= 0.5 ? "#E65100" : "#C62828", fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: "primary.main" }}>{a.strong}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: "success.main" }}>{a.won}</TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* Lost Analysis */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mt: 3 }}>
          {/* Lost Overview */}
          <Box sx={{ bgcolor: "background.paper", borderRadius: "8px", border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
            <Box sx={{ px: 2, py: 2, borderBottom: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", gap: 1.5 }}>
              <TrendingDownRoundedIcon sx={{ fontSize: 18, color: "#EF4444" }} />
              <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Lost analysis</Typography>
            </Box>
            <Box sx={{ p: 2 }}>
              <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, mb: 2 }}>
                <Typography sx={{ fontSize: 36, fontWeight: 800, color: "#EF4444", lineHeight: 1 }}>
                  {analytics?.lost ?? stats?.lost ?? 0}
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 500 }}>total lost leads</Typography>
              </Box>
              {funnel && (
                <Box sx={{ display: "flex", gap: 1.5 }}>
                  <Box sx={{ flex: 1, p: 2, borderRadius: "8px", bgcolor: "#FEF2F2", textAlign: "center" }}>
                    <Typography sx={{ fontSize: 20, fontWeight: 800, color: "#EF4444" }}>
                      {funnel.total > 0 ? Math.round(((analytics?.lost ?? 0) / funnel.total) * 100) : 0}%
                    </Typography>
                    <Typography variant="caption" sx={{ color: "#991B1B", fontWeight: 600 }}>Loss rate</Typography>
                  </Box>
                  <Box sx={{ flex: 1, p: 2, borderRadius: "8px", bgcolor: "#F0FDF4", textAlign: "center" }}>
                    <Typography sx={{ fontSize: 20, fontWeight: 800, color: "#059669" }}>
                      {funnel.total > 0 ? Math.round(((stats?.bookings ?? 0) / funnel.total) * 100) : 0}%
                    </Typography>
                    <Typography variant="caption" sx={{ color: "#065F46", fontWeight: 600 }}>Booking rate</Typography>
                  </Box>
                </Box>
              )}
            </Box>
          </Box>

          {/* Lost Reasons */}
          <Box sx={{ bgcolor: "background.paper", borderRadius: "8px", border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
            <Box sx={{ px: 2, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Lost reasons</Typography>
            </Box>
            <Box sx={{ p: 2 }}>
              {(analytics?.lost_reasons && analytics.lost_reasons.length > 0) ? (
                analytics.lost_reasons.map((r, i) => {
                  const maxCount = Math.max(...analytics.lost_reasons!.map(x => x.count), 1);
                  return (
                    <Box key={r.reason} sx={{ mb: 2, "&:last-child": { mb: 0 } }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{r.reason}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: "#EF4444" }}>{r.count}</Typography>
                      </Box>
                      <LinearProgress variant="determinate" value={(r.count / maxCount) * 100}
                        sx={{ height: 6, borderRadius: "8px", bgcolor: "rgba(0,0,0,0.04)", "& .MuiLinearProgress-bar": { borderRadius: "8px", bgcolor: i === 0 ? "#EF4444" : i === 1 ? "#F97316" : "#FBBF24" } }}
                      />
                    </Box>
                  );
                })
              ) : (
                <Box sx={{ py: 4, textAlign: "center" }}>
                  <Typography variant="body2" sx={{ color: "text.disabled" }}>No lost reason data available</Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </Box>
      )}
    </Shell>
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
    <Box sx={{ p: 2, pt: 2 }}>
      <Box sx={{ display: "flex", bgcolor: "background.paper", borderRadius: "8px", border: "1px solid", borderColor: "divider", mb: 3, overflow: "hidden" }}>
        {cards.map((c, i) => (
          <Box key={c.label} sx={{ flex: 1, px: 2.5, py: 2, borderRight: i < cards.length - 1 ? "1px solid" : "none", borderColor: "divider" }}>
            <Typography sx={{ fontSize: 10, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.04em" }}>{c.label}</Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 800, color: c.color, lineHeight: 1.1 }}>{c.value}</Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ bgcolor: "background.paper", borderRadius: "8px", border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
        <Box sx={{ px: 2, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Campaign performance</Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ "& th": { fontWeight: 600, fontSize: 13, color: "text.secondary", py: 1.5 } }}>
                <TableCell>Campaign</TableCell>
                <TableCell>Dealer</TableCell>
                <TableCell align="right">Agents</TableCell>
                <TableCell align="right">Leads</TableCell>
                <TableCell align="right">Conversations</TableCell>
                <TableCell align="right">Replied</TableCell>
                <TableCell align="right">Strong intent</TableCell>
                <TableCell align="right">Won</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9}><Skeleton height={28} /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6, color: "text.secondary" }}>No campaigns yet</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id} sx={{ "&:hover": { bgcolor: "#FAFBFC" } }}>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 600 }}>{r.name}</Typography></TableCell>
                  <TableCell><Typography variant="body2" sx={{ color: "text.secondary" }}>{r.dealer_name || "-"}</Typography></TableCell>
                  <TableCell align="right">{r.agents}</TableCell>
                  <TableCell align="right">{r.lead_count}</TableCell>
                  <TableCell align="right">{r.conversations}</TableCell>
                  <TableCell align="right">
                    <Chip size="small" label={r.conversations > 0 ? `${Math.round((r.replied / r.conversations) * 100)}%` : "-"} sx={{ bgcolor: "#E8F5E9", color: "#2E7D32", fontWeight: 600 }} />
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: "primary.main" }}>{r.strong}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: "success.main" }}>{r.won}</TableCell>
                  <TableCell><Chip size="small" label={r.status} sx={{ textTransform: "capitalize", fontWeight: 700, fontSize: 10, bgcolor: r.status === "active" ? "#DCFCE7" : "#F1F5F9", color: r.status === "active" ? "#15803D" : "#64748B" }} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
}
