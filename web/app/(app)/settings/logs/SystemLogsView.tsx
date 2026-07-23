"use client";
import { useI18n } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Download, PhoneIncoming, PhoneOutgoing, CheckCircle2, Clock, XCircle, AlertTriangle, Eye } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AuditEntry, LogMessage, LogConversation, LogCall, LogActivity, ExportJob, Campaign, Channel } from "@/lib/types";
import { MultiSelect } from "@/components/ui/multi-select";
import { FilterButton, FilterDrawer, FilterField } from "@/components/FilterDrawer";
import DateRangeFilter, { presetRange, type DateRangeValue } from "@/components/DateRangeFilter";
import { useToast } from "@/app/(app)/settings/_shared";
import { rewriteLocalMedia } from "@/app/(app)/inbox/components/MessageBubble";
import ChatPopup from "@/components/ChatPopup";

type ChatTarget = { id: string; name?: string | null; phone?: string | null };

export type TabKey = "messages" | "conversations" | "activity" | "system" | "calls" | "downloads";

// Each tab is a standalone route: /system-logs/<slug>. "conversation" is
// singular in the URL but maps to the plural API kind.
const TAB_SLUG: Record<TabKey, string> = {
  messages: "messages", conversations: "conversation", activity: "activity",
  system: "system", calls: "calls", downloads: "downloads",
};
const TABS: { key: TabKey; label: string }[] = [
  { key: "messages", label: "Message History" },
  { key: "conversations", label: "Conversations" },
  { key: "activity", label: "User Activity" },
  { key: "system", label: "System Logs" },
  { key: "calls", label: "Call Logs" },
  { key: "downloads", label: "Downloads" },
];
const PAGE = 50;
const DL_PAGE = 8;
const ACTION_COLOR: Record<string, string> = { created: "#16A34A", deleted: "#DC2626", updated: "#2563EB", submitted: "#7C3AED", tested: "#0891B2", connected: "#16A34A", disconnected: "#DC2626" };

const fmtDT = (iso?: string | null) => iso ? new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
const fmtDay = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "-";
function csvDT(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
const callDur = (s?: number) => { if (!s) return "0:00"; const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; };
// Human duration for SLA columns (first/avg response, etc.): "45s", "2m 10s", "1h 5m".
const dur = (s?: number | null) => {
  if (!s || s <= 0) return "-";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), sec = s % 60;
  if (m < 60) return sec ? `${m}m ${sec}s` : `${m}m`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
};
const dirLabel = (d?: string | null) => d === "inbound" ? "Incoming" : d === "outbound" ? "Outgoing" : (d || "-");
const sendStatus = (s?: string | null) => s === "failed" ? "Failed" : s === "queued" ? "Pending" : (s ? "Sent" : "-");
const readStatus = (s?: string | null) => s === "read" ? "Read" : (s === "sent" || s === "delivered") ? "Unread" : "-";
const detailText = (detail: Record<string, unknown> | null) => detail ? Object.entries(detail).map(([k, v]) => `${k}: ${v}`).join(" · ") : "";
function activityLabel(a: LogActivity): string {
  if (a.kind === "presence") return a.event === "online" ? (a.detail && (a.detail as any).via === "login" ? "Login" : "Online") : ((a.detail as any)?.reason ? `Offline · ${(a.detail as any).reason}` : "Logout");
  if (a.kind === "lifecycle") return a.event === "active" ? "Activated" : a.event === "inactive" ? "Deactivated" : a.event === "deleted" ? "Deleted" : a.event;
  return a.event;
}
const activityReason = (a: LogActivity) => (a.detail && typeof (a.detail as any).reason === "string") ? (a.detail as any).reason : "-";

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const map: Record<string, { c: string; Icon: any; label: string }> = {
    completed: { c: "#16A34A", Icon: CheckCircle2, label: "Completed" },
    processing: { c: "#2563EB", Icon: Loader2, label: "Processing" },
    queued: { c: "#E67E22", Icon: Clock, label: "Queued" },
    failed: { c: "#DC2626", Icon: XCircle, label: "Failed" },
  };
  const s = map[status] || map.queued;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold" style={{ color: s.c, backgroundColor: s.c + "1a" }}>
      <s.Icon className={cn("w-3 h-3", status === "processing" && "animate-spin")} />{t(s.label)}
    </span>
  );
}

// Interest pill · Hot/Warm/Cold kept in English by product decision.
function InterestPill({ level }: { level?: string | null }) {
  const lv = (level || "").toLowerCase();
  const c = lv === "hot" ? "#EF4444" : lv === "warm" ? "#F59E0B" : lv === "cold" ? "#3B82F6" : null;
  if (!c) return <span className="text-muted-foreground">-</span>;
  return <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize" style={{ color: c, backgroundColor: c + "1a" }}>{lv}</span>;
}

function downloadCsv(name: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [header.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

type ExportKind = "messages" | "conversations" | "calls" | "activity" | "system";

export default function SystemLogsView({ tab }: { tab: TabKey }) {
  const { t } = useI18n();
  const router = useRouter();
  const [dr, setDr] = useState<DateRangeValue>({ preset: "30d", ...presetRange("30d") });
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [messages, setMessages] = useState<LogMessage[]>([]);
  const [convs, setConvs] = useState<LogConversation[]>([]);
  const [calls, setCalls] = useState<LogCall[]>([]);
  const [activity, setActivity] = useState<LogActivity[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [err, setErr] = useState("");
  const [exports, setExports] = useState<ExportJob[]>([]);
  const [rowExporting, setRowExporting] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatTarget | null>(null);
  const { notify, ToastHost } = useToast();
  const [fCampaign, setFCampaign] = useState<string[]>([]);
  const [fChannel, setFChannel] = useState<string[]>([]);
  const [fLabel, setFLabel] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const activeFilters = fCampaign.length + fChannel.length + (fLabel ? 1 : 0);
  const clearFilters = () => { setFCampaign([]); setFChannel([]); setFLabel(""); };
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  useEffect(() => {
    api.listCampaigns().then((c) => setCampaigns(c || [])).catch(() => {});
    api.listChannels().then((c) => setChannels(c || [])).catch(() => {});
  }, []);

  const from = dr.from;
  const to = dr.to;
  const fetchTab = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const flt = { campaign_id: fCampaign.length ? fCampaign.join(",") : undefined, channel_id: fChannel.length ? fChannel.join(",") : undefined, label: fLabel || undefined };
      if (tab === "messages") { const r = await api.systemLog("messages", { limit: PAGE, offset: page * PAGE, from, to, ...flt }); setMessages(r.rows as unknown as LogMessage[]); setTotal(r.total); }
      else if (tab === "conversations") { const r = await api.systemLog("conversations", { limit: PAGE, offset: page * PAGE, from, to, ...flt }); setConvs(r.rows as unknown as LogConversation[]); setTotal(r.total); }
      else if (tab === "calls") { const r = await api.systemLog("calls", { limit: PAGE, offset: page * PAGE, from, to, ...flt }); setCalls(r.rows as unknown as LogCall[]); setTotal(r.total); }
      else if (tab === "activity") { const r = await api.systemLog("activity", { limit: PAGE, offset: page * PAGE, from, to }); setActivity(r.rows as unknown as LogActivity[]); setTotal(r.total); }
      else if (tab === "system") { const auditRows = await api.listAuditLog(); setAudit(auditRows); setTotal(auditRows.length); }
      else setTotal(0);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }, [tab, page, from, to, fCampaign, fChannel, fLabel]);
  useEffect(() => { fetchTab(); }, [fetchTab]);
  useEffect(() => { setPage(0); }, [dr, fCampaign, fChannel, fLabel]);

  const fetchExports = useCallback(() => { api.listExports().then(setExports).catch(() => {}); }, []);
  useEffect(() => { if (tab === "downloads") fetchExports(); }, [tab, fetchExports]);
  useEffect(() => {
    if (tab !== "downloads") return;
    if (!exports.some((e) => e.status === "queued" || e.status === "processing")) return;
    const iv = setInterval(fetchExports, 2500);
    return () => clearInterval(iv);
  }, [tab, exports, fetchExports]);

  async function startExport(kind: ExportKind) {
    if (kind === "system") {
      downloadCsv("system-logs.csv", ["When", "Actor", "Action", "Entity", "Detail"],
        audit.map((a) => [csvDT(a.created_at), a.actor_name, a.action, `${a.entity_type} ${a.entity_id ?? ""}`, detailText(a.detail)]));
      return;
    }
    setExporting(kind);
    try {
      await api.createExport(kind, from || undefined, to || undefined, { campaign_id: fCampaign.length ? fCampaign.join(",") : undefined, channel_id: fChannel.length ? fChannel.join(",") : undefined, label: kind === "messages" ? (fLabel || undefined) : undefined });
      notify(t("settings.exportQueuedTrackItIn"));
      router.push(`/settings/logs/${TAB_SLUG.downloads}`);
      setTimeout(fetchExports, 400);
    } catch (e) { notify(e instanceof Error ? e.message : t("settings.exportFailed"), "error"); }
    finally { setExporting(null); }
  }

  // Per-row conversation transcript export -> conversation-<id>.csv.
  async function exportConversation(id: string) {
    setRowExporting(id);
    try { await api.downloadConversationCsv(id); }
    catch (e) { notify(e instanceof Error ? e.message : t("settings.exportFailed"), "error"); }
    finally { setRowExporting(null); }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE));
  const auditPaged = audit.slice(page * PAGE, page * PAGE + PAGE);
  const dlTotalPages = Math.max(1, Math.ceil(exports.length / DL_PAGE));
  const exportsPaged = exports.slice(page * DL_PAGE, page * DL_PAGE + DL_PAGE);
  const showExportBtn = tab !== "downloads";
  const showRange = tab !== "system";
  const showConvFilters = tab === "messages" || tab === "conversations" || tab === "calls";
  const showLabel = tab === "messages";

  const TH = ({ children, className }: { children?: React.ReactNode; className?: string }) =>
    <th className={cn("px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap", className)}>{children}</th>;
  const cols: Record<TabKey, number> = { messages: 15, conversations: 14, activity: 5, system: 5, calls: 9, downloads: 1 };
  const rowsLen = tab === "messages" ? messages.length : tab === "conversations" ? convs.length : tab === "calls" ? calls.length : tab === "activity" ? activity.length : auditPaged.length;

  return (
    <div className="h-full flex flex-col px-6 py-5 min-h-0 overflow-hidden">
      {/* Tabs · each a standalone route */}
      <div className="flex items-center border-b border-border shrink-0 overflow-x-auto">
        {TABS.map((tb) => (
          <Link key={tb.key} href={`/settings/logs/${TAB_SLUG[tb.key]}`}
            className={cn("px-3 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors outline-none",
              tab === tb.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t(tb.label)}
          </Link>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 py-3 shrink-0 flex-wrap">
        {showRange && <DateRangeFilter value={dr} onChange={setDr} />}
        {showConvFilters && (
          <>
            <FilterButton count={activeFilters} onClick={() => setFilterOpen(true)} />
            {activeFilters > 0 && <button onClick={clearFilters} className="text-[12px] font-semibold text-primary hover:underline outline-none">{t("common.clear")}</button>}
            <FilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)} onClear={clearFilters} canClear={activeFilters > 0}>
              <FilterField label={t("settings.campaigns")}><MultiSelect value={fCampaign} onChange={setFCampaign} placeholder={t("common.allCampaigns")} className="w-full" options={campaigns.map((c) => ({ value: c.id, label: c.name }))} /></FilterField>
              <FilterField label={t("settings.channels")}><MultiSelect value={fChannel} onChange={setFChannel} placeholder={t("common.allChannels")} className="w-full" options={channels.map((c) => ({ value: c.id, label: c.name }))} /></FilterField>
              {showLabel && <FilterField label={t("settings.label")}><input value={fLabel} onChange={(e) => setFLabel(e.target.value)} placeholder={t("settings.label")}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary" /></FilterField>}
            </FilterDrawer>
          </>
        )}
        <div className="flex-1" />
        {showExportBtn && (
          <button onClick={() => startExport(tab as ExportKind)} disabled={!!exporting}
            className="inline-flex items-center gap-2 px-3.5 h-9 rounded-md border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 outline-none transition-colors">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}{t("contacts.export")}
          </button>
        )}
      </div>

      {/* Body */}
      <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col">
        {tab === "downloads" ? (
          <div className="flex flex-col flex-1 min-h-0 p-5">
            <div className="rounded-lg border border-border overflow-auto flex-1 min-h-0">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10"><tr className="border-b border-border bg-muted">
                  {["Data", "Requested by", "Date range", "Filters", "Rows", "Status", "Created", "Action"].map((h, i) => (
                    <th key={h} className={cn("px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap", i === 7 ? "text-right" : "text-left")}>{t(h)}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {exports.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">{t("settings.noExportsYetUseThe")}</td></tr>
                  ) : exportsPaged.map((e) => {
                    const chips = [e.campaign_name, e.channel_name, e.label].filter(Boolean) as string[];
                    return (
                      <tr key={e.id} className="border-b border-border/60 hover:bg-muted/40">
                        <td className="px-4 py-2.5 font-semibold text-foreground capitalize whitespace-nowrap">{e.kind}</td>
                        <td className="px-4 py-2.5 text-foreground/80 whitespace-nowrap">{e.requested_by || "-"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-[12px] whitespace-nowrap">{e.date_from ? `${fmtDay(e.date_from)} - ${e.date_to ? fmtDay(e.date_to) : "now"}` : t("common.allTime")}</td>
                        <td className="px-4 py-2.5">
                          {chips.length === 0 ? <span className="text-muted-foreground text-[12px]">-</span> : (
                            <div className="flex flex-wrap gap-1">{chips.map((c) => <span key={c} className="inline-flex px-1.5 py-0.5 rounded-md bg-muted text-[10.5px] font-medium text-foreground/80">{c}</span>)}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{e.row_count ?? "-"}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={e.status} /></td>
                        <td className="px-4 py-2.5 text-muted-foreground text-[12px] whitespace-nowrap">{fmtDT(e.created_at)}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {e.status === "completed" && e.file_url
                            ? <a href={rewriteLocalMedia(e.file_url)} download target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary text-[13px] font-semibold hover:underline"><Download className="w-4 h-4" />{t("broadcasts.download")}</a>
                            : e.status === "failed"
                              ? <span className="text-[12px] text-destructive" title={e.error || ""}>{t("broadcasts.failed")}</span>
                              : <span className="text-[12px] text-muted-foreground">{t("settings.preparing")}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted z-10">
                <tr className="border-b border-border">
                  {tab === "messages" && <><TH>{t("Customer Name")}</TH><TH>{t("Customer Number")}</TH><TH>{t("Customer Email")}</TH><TH>{t("Message Type")}</TH><TH>{t("settings.direction")}</TH><TH>{t("contacts.created")}</TH><TH>{t("Send Status")}</TH><TH>{t("Read Status")}</TH><TH>{t("Billable")}</TH><TH>{t("Message Cost")}</TH><TH>{t("AI Deducted")}</TH><TH>{t("settings.agentName")}</TH><TH>{t("settings.agentEmail")}</TH><TH>{t("automation.campaign")}</TH><TH className="text-right">{t("common.actions")}</TH></>}
                  {tab === "conversations" && <><TH>{t("settings.agentName")}</TH><TH>{t("settings.agentEmail")}</TH><TH>{t("automation.campaign")}</TH><TH>{t("Customer Name")}</TH><TH>{t("Contact Number")}</TH><TH>{t("contacts.stage")}</TH><TH>{t("Interest Level")}</TH><TH>{t("Chat Initiation Time")}</TH><TH>{t("Assigned At")}</TH><TH className="text-right">{t("First Response Time")}</TH><TH className="text-right">{t("Avg. Response Time")}</TH><TH>{t("Closing Time")}</TH><TH>{t("Current Conversation Status")}</TH><TH className="text-right">{t("common.actions")}</TH></>}
                  {tab === "activity" && <><TH>{t("settings.agentName")}</TH><TH>{t("settings.agentEmail")}</TH><TH>{t("settings.agentActivity")}</TH><TH>{t("settings.offlineReason")}</TH><TH>{t("settings.actionAt")}</TH></>}
                  {tab === "calls" && <><TH>{t("settings.type")}</TH><TH>{t("inbox.name")}</TH><TH>{t("settings.phoneNumber")}</TH><TH className="text-right">{t("settings.duration")}</TH><TH>{t("settings.startedAt")}</TH><TH>{t("settings.endedAt")}</TH><TH>{t("contacts.agent")}</TH><TH>{t("automation.status")}</TH><TH>{t("components.recording")}</TH></>}
                  {tab === "system" && <><TH>{t("settings.when")}</TH><TH>{t("settings.actor")}</TH><TH>{t("settings.action")}</TH><TH>{t("settings.entity")}</TH><TH>{t("settings.detail")}</TH></>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={cols[tab]} className="text-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></td></tr>
                ) : err ? (
                  <tr><td colSpan={cols[tab]} className="text-center py-12">
                    <div className="inline-flex items-center gap-2 text-destructive text-[13px] font-medium"><AlertTriangle className="w-4 h-4" />{t("settings.couldNotLoadData")} {err}</div>
                    <div className="mt-2"><button onClick={fetchTab} className="text-[12px] font-semibold text-primary hover:underline outline-none">{t("settings.retry")}</button></div>
                  </td></tr>
                ) : rowsLen === 0 ? (
                  <tr><td colSpan={cols[tab]} className="text-center py-16 text-muted-foreground">{t("settings.noDataFound")}</td></tr>
                ) : <>
                  {tab === "messages" && messages.map((m, i) => (
                    <tr key={m.message_id + i} className="border-b border-border/60 hover:bg-muted/40">
                      <td className="px-4 py-2.5 font-medium text-foreground truncate max-w-[160px]">{m.contact_name || "-"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-foreground/80">{m.contact_phone || "-"}</td>
                      <td className="px-4 py-2.5 text-foreground/80 truncate max-w-[180px]">{m.contact_email || "-"}</td>
                      <td className="px-4 py-2.5 capitalize text-muted-foreground">{m.message_type}</td>
                      <td className="px-4 py-2.5"><span className={cn("inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold", m.direction === "inbound" ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600")}>{t(dirLabel(m.direction))}</span></td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-[12px]">{fmtDT(m.created_at)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-[12px]">{t(sendStatus(m.status))}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-[12px]">{t(readStatus(m.status))}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-[12px]">-</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-[12px] tabular-nums">-</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-[12px] tabular-nums">-</td>
                      <td className="px-4 py-2.5 text-foreground/80 truncate max-w-[140px]">{m.agent_name || "-"}</td>
                      <td className="px-4 py-2.5 text-foreground/80 truncate max-w-[180px]">{m.agent_email || "-"}</td>
                      <td className="px-4 py-2.5 text-foreground/80">{m.campaign_name || "-"}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {m.conversation_id
                          ? <button onClick={() => setChat({ id: m.conversation_id!, name: m.contact_name, phone: m.contact_phone })} className="inline-flex items-center gap-1 text-primary text-[12px] font-semibold hover:underline outline-none"><Eye className="w-3.5 h-3.5" />{t("contacts.viewDetails")}</button>
                          : <span className="text-muted-foreground/60 text-[12px]">-</span>}
                      </td>
                    </tr>
                  ))}
                  {tab === "conversations" && convs.map((c) => (
                    <tr key={c.id} className="border-b border-border/60 hover:bg-muted/40">
                      <td className="px-4 py-2.5 font-medium text-foreground truncate max-w-[140px]">{c.agent_name || "-"}</td>
                      <td className="px-4 py-2.5 text-foreground/80 truncate max-w-[180px]">{c.agent_email || "-"}</td>
                      <td className="px-4 py-2.5 text-foreground/80">{c.campaign_name || "-"}</td>
                      <td className="px-4 py-2.5 text-foreground/80 truncate max-w-[160px]">{c.customer_name || "-"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-foreground/80">{c.contact_number || "-"}</td>
                      <td className="px-4 py-2.5 text-foreground">{c.stage || "-"}</td>
                      <td className="px-4 py-2.5"><InterestPill level={c.interest_level} /></td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-[12px]">{fmtDT(c.chat_initiation)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-[12px]">{fmtDT(c.assigned_at)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{dur(c.first_response_sec)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{dur(c.avg_response_sec)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-[12px]">{fmtDT(c.closing_at)}</td>
                      <td className="px-4 py-2.5"><span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold bg-muted text-muted-foreground capitalize">{t(c.status)}</span></td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button onClick={() => exportConversation(c.id)} disabled={rowExporting === c.id} title={t("contacts.export")}
                            className="inline-flex items-center gap-1 text-foreground/70 hover:text-primary text-[12px] font-semibold disabled:opacity-50 outline-none">
                            {rowExporting === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => setChat({ id: c.id, name: c.customer_name, phone: c.contact_number })} className="inline-flex items-center gap-1 text-primary text-[12px] font-semibold hover:underline outline-none"><Eye className="w-3.5 h-3.5" />{t("contacts.viewDetails")}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {tab === "activity" && activity.map((a, i) => {
                    const lbl = activityLabel(a);
                    const isOn = lbl === "Login" || lbl === "Online" || lbl === "Activated";
                    return (
                      <tr key={i} className="border-b border-border/60 hover:bg-muted/40">
                        <td className="px-4 py-2.5 font-medium text-foreground truncate max-w-[160px]">{a.agent_name || "-"}</td>
                        <td className="px-4 py-2.5 text-foreground/80 truncate max-w-[220px]">{a.agent_email || "-"}</td>
                        <td className="px-4 py-2.5"><span className={cn("inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold", isOn ? "bg-emerald-50 text-emerald-600" : "bg-muted text-muted-foreground")}>{t(lbl)}</span></td>
                        <td className="px-4 py-2.5 text-muted-foreground">{activityReason(a)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-[12px]">{fmtDT(a.action_at)}</td>
                      </tr>
                    );
                  })}
                  {tab === "calls" && calls.map((c) => (
                    <tr key={c.id} className="border-b border-border/60 hover:bg-muted/40">
                      <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">{c.direction === "inbound" ? <PhoneIncoming className="w-3.5 h-3.5 text-blue-600" /> : <PhoneOutgoing className="w-3.5 h-3.5 text-emerald-600" />}{t(dirLabel(c.direction))}</span></td>
                      <td className="px-4 py-2.5 font-medium text-foreground truncate max-w-[160px]">{c.name || "-"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-foreground/80">{c.phone || "-"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{callDur(c.duration_seconds)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-[12px]">{fmtDT(c.received_at)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-[12px]">{fmtDT(c.ended_at)}</td>
                      <td className="px-4 py-2.5 text-foreground/80 truncate max-w-[140px]">{c.agent || "-"}</td>
                      <td className="px-4 py-2.5 capitalize text-muted-foreground text-[12px]">{c.call_status || c.end_reason || "-"}</td>
                      <td className="px-4 py-2.5">
                        {c.recording_url ? (
                          <a href={c.recording_url} download target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline">
                            <Download className="w-3.5 h-3.5" />{t("broadcasts.download")}
                          </a>
                        ) : <span className="text-muted-foreground/60 text-[12px]">-</span>}
                      </td>
                    </tr>
                  ))}
                  {tab === "system" && auditPaged.map((a) => {
                    const ac = ACTION_COLOR[a.action] ?? "#64748B";
                    return (
                      <tr key={a.id} className="border-b border-border/60 hover:bg-muted/40">
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-[12px]">{fmtDT(a.created_at)}</td>
                        <td className="px-4 py-2.5 font-medium text-foreground">{a.actor_name || t("settings.system")}</td>
                        <td className="px-4 py-2.5"><span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold capitalize" style={{ backgroundColor: ac + "1a", color: ac }}>{a.action}</span></td>
                        <td className="px-4 py-2.5 text-foreground/80 capitalize">{a.entity_type}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-[12px] truncate max-w-[320px]">{detailText(a.detail)}</td>
                      </tr>
                    );
                  })}
                </>}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination · log tabs */}
        {tab !== "downloads" && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-sm shrink-0">
            <span className="text-muted-foreground tabular-nums">{total} total</span>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground mx-2 tabular-nums">{t("settings.page")} {page + 1} of {totalPages}</span>
              <button disabled={page <= 0} onClick={() => setPage(page - 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none transition-colors">{t("settings.prev")}</button>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none transition-colors">{t("settings.next")}</button>
            </div>
          </div>
        )}

        {/* Pagination · downloads list */}
        {tab === "downloads" && exports.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-sm shrink-0">
            <span className="text-muted-foreground tabular-nums">{exports.length} total</span>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground mx-2 tabular-nums">{t("settings.page")} {page + 1} of {dlTotalPages}</span>
              <button disabled={page <= 0} onClick={() => setPage(page - 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none transition-colors">{t("settings.prev")}</button>
              <button disabled={page >= dlTotalPages - 1} onClick={() => setPage(page + 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none transition-colors">{t("settings.next")}</button>
            </div>
          </div>
        )}
      </div>
      {chat && <ChatPopup conversationId={chat.id} name={chat.name} phone={chat.phone} onClose={() => setChat(null)} notify={(m, s) => notify(m, s === "warning" ? "info" : s)} />}
      {ToastHost}
    </div>
  );
}
