"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, Download, PhoneIncoming, PhoneOutgoing, CheckCircle2, Clock, XCircle, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AuditEntry, LogMessage, LogConversation, LogCall, LogActivity, ExportJob, Campaign, Channel } from "@/lib/types";
import { Select } from "@/components/Select";
import { MultiSelect } from "@/components/ui/multi-select";
import { useToast } from "../_shared";
import { rewriteLocalMedia } from "@/app/(app)/inbox/components/MessageBubble";

type TabKey = "messages" | "conversations" | "activity" | "system" | "calls" | "downloads";
const TABS: { key: TabKey; label: string }[] = [
  { key: "messages", label: "Message History" },
  { key: "conversations", label: "Conversations" },
  { key: "activity", label: "User Activity" },
  { key: "system", label: "System Logs" },
  { key: "calls", label: "Call Logs" },
  { key: "downloads", label: "Downloads" },
];
const RANGES = [
  { value: "", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
];
const PAGE = 50;
const DL_PAGE = 8; // downloads list rows per page
const ACTION_COLOR: Record<string, string> = { created: "#16A34A", deleted: "#DC2626", updated: "#2563EB", submitted: "#7C3AED", tested: "#0891B2", connected: "#16A34A", disconnected: "#DC2626" };

const fmtDT = (iso?: string | null) => iso ? new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
const fmtDay = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "-";
function csvDT(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
const dur = (s?: number) => { if (!s) return "0:00"; const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; };
const dirLabel = (d?: string | null) => d === "inbound" ? "Incoming" : d === "outbound" ? "Outgoing" : (d || "-");
const detailText = (detail: Record<string, unknown> | null) => detail ? Object.entries(detail).map(([k, v]) => `${k}: ${v}`).join(" · ") : "";
function activityLabel(a: LogActivity): string {
  if (a.kind === "presence") return a.event === "online" ? (a.detail && (a.detail as any).via === "login" ? "Login" : "Online") : "Logout";
  if (a.kind === "lifecycle") return a.event === "active" ? "Activated" : a.event === "inactive" ? "Deactivated" : a.event === "deleted" ? "Deleted" : a.event;
  return a.event;
}
const activityReason = (a: LogActivity) => (a.detail && typeof (a.detail as any).reason === "string") ? (a.detail as any).reason : "-";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { c: string; Icon: any; label: string }> = {
    completed: { c: "#16A34A", Icon: CheckCircle2, label: "Completed" },
    processing: { c: "#2563EB", Icon: Loader2, label: "Processing" },
    queued: { c: "#E67E22", Icon: Clock, label: "Queued" },
    failed: { c: "#DC2626", Icon: XCircle, label: "Failed" },
  };
  const s = map[status] || map.queued;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold" style={{ color: s.c, backgroundColor: s.c + "1a" }}>
      <s.Icon className={cn("w-3 h-3", status === "processing" && "animate-spin")} />{s.label}
    </span>
  );
}

function fromDate(range: string) { if (!range) return ""; const d = new Date(); d.setDate(d.getDate() - Number(range)); return d.toISOString().slice(0, 10); }
function downloadCsv(name: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [header.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

type ExportKind = "messages" | "conversations" | "calls" | "activity" | "system";

export default function SystemLogsPage() {
  const [tab, setTab] = useState<TabKey>("messages");
  const [range, setRange] = useState("30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
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
  const { notify, ToastHost } = useToast();
  // Filters (campaign + channel on log tabs; label on messages only).
  const [fCampaign, setFCampaign] = useState<string[]>([]);
  const [fChannel, setFChannel] = useState<string[]>([]);
  const [fLabel, setFLabel] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  useEffect(() => {
    api.listCampaigns().then((c) => setCampaigns(c || [])).catch(() => {});
    api.listChannels().then((c) => setChannels(c || [])).catch(() => {});
  }, []);

  const from = range === "custom" ? customFrom : fromDate(range);
  const to = range === "custom"
    ? customTo
    : (range ? new Date().toISOString().slice(0, 10) : "");
  const fetchTab = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const flt = { campaign_id: fCampaign.length ? fCampaign.join(",") : undefined, channel_id: fChannel.length ? fChannel.join(",") : undefined, label: fLabel || undefined };
      if (tab === "messages") { const r = await api.systemLog("messages", { limit: PAGE, offset: page * PAGE, from, to, ...flt }); setMessages(r.rows as unknown as LogMessage[]); setTotal(r.total); }
      else if (tab === "conversations") { const r = await api.systemLog("conversations", { limit: PAGE, offset: page * PAGE, from, to, ...flt }); setConvs(r.rows as unknown as LogConversation[]); setTotal(r.total); }
      else if (tab === "calls") { const r = await api.systemLog("calls", { limit: PAGE, offset: page * PAGE, from, to, ...flt }); setCalls(r.rows as unknown as LogCall[]); setTotal(r.total); }
      else if (tab === "activity") { const r = await api.systemLog("activity", { limit: PAGE, offset: page * PAGE, from, to }); setActivity(r.rows as unknown as LogActivity[]); setTotal(r.total); }
      else if (tab === "system") { const a = await api.listAuditLog(); setAudit(a); setTotal(a.length); }
      else setTotal(0);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }, [tab, page, from, to, fCampaign, fChannel, fLabel]);
  useEffect(() => { fetchTab(); }, [fetchTab]);
  useEffect(() => { setPage(0); }, [tab, range, customFrom, customTo, fCampaign, fChannel, fLabel]);

  // Async exports: queue a job; the worker generates the full CSV and the
  // Downloads tab polls for live status.
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
      // Audit log is small + already loaded; export it directly.
      downloadCsv("system-logs.csv", ["When", "Actor", "Action", "Entity", "Detail"],
        audit.map((a) => [csvDT(a.created_at), a.actor_name, a.action, `${a.entity_type} ${a.entity_id ?? ""}`, detailText(a.detail)]));
      return;
    }
    setExporting(kind);
    try {
      await api.createExport(kind, from || undefined, to || undefined, { campaign_id: fCampaign.length ? fCampaign.join(",") : undefined, channel_id: fChannel.length ? fChannel.join(",") : undefined, label: kind === "messages" ? (fLabel || undefined) : undefined });
      notify("Export queued. Track it in the Downloads tab.");
      setTab("downloads");
      setTimeout(fetchExports, 400);
    } catch (e) { notify(e instanceof Error ? e.message : "Export failed", "error"); }
    finally { setExporting(null); }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE));
  const auditPaged = audit.slice(page * PAGE, page * PAGE + PAGE);
  // Downloads list is client-paginated (the API returns the recent 100 jobs).
  const dlTotalPages = Math.max(1, Math.ceil(exports.length / DL_PAGE));
  const exportsPaged = exports.slice(page * DL_PAGE, page * DL_PAGE + DL_PAGE);
  const showExportBtn = tab !== "downloads";
  const showRange = tab !== "system";
  const showConvFilters = tab === "messages" || tab === "conversations" || tab === "calls";
  const showLabel = tab === "messages";

  const TH = ({ children, className }: { children?: React.ReactNode; className?: string }) =>
    <th className={cn("px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap", className)}>{children}</th>;
  const cols: Record<TabKey, number> = { messages: 8, conversations: 9, activity: 5, system: 5, calls: 9, downloads: 1 };
  const rowsLen = tab === "messages" ? messages.length : tab === "conversations" ? convs.length : tab === "calls" ? calls.length : tab === "activity" ? activity.length : auditPaged.length;

  return (
    <div className="h-full flex flex-col px-6 py-5 min-h-0 overflow-hidden">
      {/* Tabs */}
      <div className="flex items-center border-b border-border shrink-0">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("px-3 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors outline-none",
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 py-3 shrink-0 flex-wrap">
        {showRange && <Select value={range} onChange={setRange} options={RANGES} className="w-[150px]" searchable={false} />}
        {showRange && range === "custom" && (
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)}
              className="h-9 px-2 rounded-md border border-input bg-background text-[13px] text-foreground outline-none focus:border-primary" />
            <span>to</span>
            <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)}
              className="h-9 px-2 rounded-md border border-input bg-background text-[13px] text-foreground outline-none focus:border-primary" />
          </div>
        )}
        {showConvFilters && (
          <>
            <MultiSelect value={fCampaign} onChange={setFCampaign} placeholder="All campaigns" className="w-[170px]"
              options={campaigns.map((c) => ({ value: c.id, label: c.name }))} />
            <MultiSelect value={fChannel} onChange={setFChannel} placeholder="All channels" className="w-[160px]"
              options={channels.map((c) => ({ value: c.id, label: c.name }))} />
          </>
        )}
        {showLabel && (
          <input value={fLabel} onChange={(e) => setFLabel(e.target.value)} placeholder="Label"
            className="w-[140px] h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary" />
        )}
        {showConvFilters && (fCampaign.length > 0 || fChannel.length > 0 || fLabel) && (
          <button onClick={() => { setFCampaign([]); setFChannel([]); setFLabel(""); }} className="text-[12px] font-semibold text-primary hover:underline outline-none">Clear</button>
        )}
        <div className="flex-1" />
        {showExportBtn && (
          <button onClick={() => startExport(tab as ExportKind)} disabled={!!exporting}
            className="inline-flex items-center gap-2 px-3.5 h-9 rounded-md border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 outline-none transition-colors">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Export
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
                    <th key={h} className={cn("px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap", i === 7 ? "text-right" : "text-left")}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {exports.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">No exports yet. Use the Export button on any tab.</td></tr>
                  ) : exportsPaged.map((e) => {
                    const chips = [e.campaign_name, e.channel_name, e.label].filter(Boolean) as string[];
                    return (
                      <tr key={e.id} className="border-b border-border/60 hover:bg-muted/40">
                        <td className="px-4 py-2.5 font-semibold text-foreground capitalize whitespace-nowrap">{e.kind}</td>
                        <td className="px-4 py-2.5 text-foreground/80 whitespace-nowrap">{e.requested_by || "-"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-[12px] whitespace-nowrap">{e.date_from ? `${fmtDay(e.date_from)} - ${e.date_to ? fmtDay(e.date_to) : "now"}` : "All time"}</td>
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
                            ? <a href={rewriteLocalMedia(e.file_url)} download target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary text-[13px] font-semibold hover:underline"><Download className="w-4 h-4" />Download</a>
                            : e.status === "failed"
                              ? <span className="text-[12px] text-destructive" title={e.error || ""}>Failed</span>
                              : <span className="text-[12px] text-muted-foreground">Preparing</span>}
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
                  {tab === "messages" && <><TH>Created</TH><TH>Direction</TH><TH>Contact</TH><TH>Phone</TH><TH>Agent</TH><TH>Type</TH><TH>Message</TH><TH>Status</TH></>}
                  {tab === "conversations" && <><TH>Agent</TH><TH>Campaign</TH><TH>Customer</TH><TH>Contact</TH><TH>Status</TH><TH className="text-right">First resp (s)</TH><TH className="text-right">Closing (s)</TH><TH className="text-right">Agent msgs</TH><TH>Initiated</TH></>}
                  {tab === "activity" && <><TH>Agent Name</TH><TH>Agent Email</TH><TH>Agent Activity</TH><TH>Offline Reason</TH><TH>Action At</TH></>}
                  {tab === "calls" && <><TH>Type</TH><TH>Name</TH><TH>Phone Number</TH><TH className="text-right">Duration</TH><TH>Started At</TH><TH>Ended At</TH><TH>Agent</TH><TH>Status</TH><TH>Recording</TH></>}
                  {tab === "system" && <><TH>When</TH><TH>Actor</TH><TH>Action</TH><TH>Entity</TH><TH>Detail</TH></>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={cols[tab]} className="text-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></td></tr>
                ) : err ? (
                  <tr><td colSpan={cols[tab]} className="text-center py-12">
                    <div className="inline-flex items-center gap-2 text-destructive text-[13px] font-medium"><AlertTriangle className="w-4 h-4" />Could not load data: {err}</div>
                    <div className="mt-2"><button onClick={fetchTab} className="text-[12px] font-semibold text-primary hover:underline outline-none">Retry</button></div>
                  </td></tr>
                ) : rowsLen === 0 ? (
                  <tr><td colSpan={cols[tab]} className="text-center py-16 text-muted-foreground">No data found</td></tr>
                ) : <>
                  {tab === "messages" && messages.map((m, i) => (
                    <tr key={m.message_id + i} className="border-b border-border/60 hover:bg-muted/40">
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-[12px]">{fmtDT(m.created_at)}</td>
                      <td className="px-4 py-2.5"><span className={cn("inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold", m.direction === "inbound" ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600")}>{dirLabel(m.direction)}</span></td>
                      <td className="px-4 py-2.5 font-medium text-foreground truncate max-w-[160px]">{m.contact_name || "-"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-foreground/80">{m.contact_phone || "-"}</td>
                      <td className="px-4 py-2.5 text-foreground/80 truncate max-w-[140px]">{m.agent_name || "-"}</td>
                      <td className="px-4 py-2.5 capitalize text-muted-foreground">{m.message_type}</td>
                      <td className="px-4 py-2.5 text-foreground/90 truncate max-w-[280px]">{m.message || (m.file_url ? "[media]" : "-")}</td>
                      <td className="px-4 py-2.5 capitalize text-muted-foreground text-[12px]">{m.status}</td>
                    </tr>
                  ))}
                  {tab === "conversations" && convs.map((c) => (
                    <tr key={c.id} className="border-b border-border/60 hover:bg-muted/40">
                      <td className="px-4 py-2.5 font-medium text-foreground truncate max-w-[140px]">{c.agent_name || "-"}</td>
                      <td className="px-4 py-2.5 text-foreground/80">{c.campaign_name || "-"}</td>
                      <td className="px-4 py-2.5 text-foreground/80 truncate max-w-[160px]">{c.customer_name || "-"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-foreground/80">{c.contact_number || "-"}</td>
                      <td className="px-4 py-2.5"><span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold bg-muted text-muted-foreground capitalize">{c.status}</span></td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{c.first_response_sec || 0}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{c.closing_sec || 0}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{c.agent_messages}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-[12px]">{fmtDT(c.chat_initiation)}</td>
                    </tr>
                  ))}
                  {tab === "activity" && activity.map((a, i) => {
                    const lbl = activityLabel(a);
                    const isOn = lbl === "Login" || lbl === "Online" || lbl === "Activated";
                    return (
                      <tr key={i} className="border-b border-border/60 hover:bg-muted/40">
                        <td className="px-4 py-2.5 font-medium text-foreground truncate max-w-[160px]">{a.agent_name || "-"}</td>
                        <td className="px-4 py-2.5 text-foreground/80 truncate max-w-[220px]">{a.agent_email || "-"}</td>
                        <td className="px-4 py-2.5"><span className={cn("inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold", isOn ? "bg-emerald-50 text-emerald-600" : "bg-muted text-muted-foreground")}>{lbl}</span></td>
                        <td className="px-4 py-2.5 text-muted-foreground">{activityReason(a)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-[12px]">{fmtDT(a.action_at)}</td>
                      </tr>
                    );
                  })}
                  {tab === "calls" && calls.map((c) => (
                    <tr key={c.id} className="border-b border-border/60 hover:bg-muted/40">
                      <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">{c.direction === "inbound" ? <PhoneIncoming className="w-3.5 h-3.5 text-blue-600" /> : <PhoneOutgoing className="w-3.5 h-3.5 text-emerald-600" />}{dirLabel(c.direction)}</span></td>
                      <td className="px-4 py-2.5 font-medium text-foreground truncate max-w-[160px]">{c.name || "-"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-foreground/80">{c.phone || "-"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{dur(c.duration_seconds)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-[12px]">{fmtDT(c.received_at)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-[12px]">{fmtDT(c.ended_at)}</td>
                      <td className="px-4 py-2.5 text-foreground/80 truncate max-w-[140px]">{c.agent || "-"}</td>
                      <td className="px-4 py-2.5 capitalize text-muted-foreground text-[12px]">{c.call_status || c.end_reason || "-"}</td>
                      <td className="px-4 py-2.5">
                        {c.recording_url ? (
                          <a href={c.recording_url} download target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline">
                            <Download className="w-3.5 h-3.5" />Download
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
                        <td className="px-4 py-2.5 font-medium text-foreground">{a.actor_name || "System"}</td>
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

        {/* Pagination — log tabs */}
        {tab !== "downloads" && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-sm shrink-0">
            <span className="text-muted-foreground tabular-nums">{total} total</span>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground mx-2 tabular-nums">Page {page + 1} of {totalPages}</span>
              <button disabled={page <= 0} onClick={() => setPage(page - 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none transition-colors">Prev</button>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none transition-colors">Next</button>
            </div>
          </div>
        )}

        {/* Pagination — downloads list */}
        {tab === "downloads" && exports.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-sm shrink-0">
            <span className="text-muted-foreground tabular-nums">{exports.length} total</span>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground mx-2 tabular-nums">Page {page + 1} of {dlTotalPages}</span>
              <button disabled={page <= 0} onClick={() => setPage(page - 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none transition-colors">Prev</button>
              <button disabled={page >= dlTotalPages - 1} onClick={() => setPage(page + 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none transition-colors">Next</button>
            </div>
          </div>
        )}
      </div>
      {ToastHost}
    </div>
  );
}
