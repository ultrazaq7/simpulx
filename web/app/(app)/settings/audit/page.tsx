"use client";
import { useEffect, useState, useCallback } from "react";
import { Loader2, Download, PhoneIncoming, PhoneOutgoing, MessageSquare, MessagesSquare, Phone, Activity, FileText } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AuditEntry, LogMessage, LogConversation, LogCall, LogActivity } from "@/lib/types";
import { Select } from "@/components/Select";

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
];
const PAGE = 50;
const ACTION_COLOR: Record<string, string> = { created: "#16A34A", deleted: "#DC2626", updated: "#2563EB", submitted: "#7C3AED", tested: "#0891B2", connected: "#16A34A", disconnected: "#DC2626" };

const fmtDT = (iso?: string | null) => iso ? new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
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
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [messages, setMessages] = useState<LogMessage[]>([]);
  const [convs, setConvs] = useState<LogConversation[]>([]);
  const [calls, setCalls] = useState<LogCall[]>([]);
  const [activity, setActivity] = useState<LogActivity[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  const from = fromDate(range);
  const to = range ? new Date().toISOString().slice(0, 10) : "";

  const fetchTab = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "messages") { const r = await api.systemLog<LogMessage>("messages", { limit: PAGE, offset: page * PAGE, from, to }); setMessages(r.rows); setTotal(r.total); }
      else if (tab === "conversations") { const r = await api.systemLog<LogConversation>("conversations", { limit: PAGE, offset: page * PAGE, from, to }); setConvs(r.rows); setTotal(r.total); }
      else if (tab === "calls") { const r = await api.systemLog<LogCall>("calls", { limit: PAGE, offset: page * PAGE, from, to }); setCalls(r.rows); setTotal(r.total); }
      else if (tab === "activity") { const r = await api.systemLog<LogActivity>("activity", { limit: PAGE, offset: page * PAGE, from, to }); setActivity(r.rows); setTotal(r.total); }
      else if (tab === "system") { const a = await api.listAuditLog(); setAudit(a); setTotal(a.length); }
      else setTotal(0);
    } catch { /* keep prev */ } finally { setLoading(false); }
  }, [tab, page, from, to]);
  useEffect(() => { fetchTab(); }, [fetchTab]);
  useEffect(() => { setPage(0); }, [tab, range]);

  async function exportData(kind: ExportKind) {
    setExporting(kind);
    try {
      if (kind === "messages") {
        const r = await api.systemLog<LogMessage>("messages", { limit: 5000, offset: 0, from, to });
        downloadCsv("messages.csv",
          ["File Name", "Channel Id", "Contact ID", "Contact Name", "Sender/Agent Name", "Agent Email", "Direction", "Call Duration (in sec)", "Error Message", "Billable", "Cost Currency", "Message Cost", "AI Credits", "Created At", "Updated At", "Call ID", "Recording Url", "Connect Status", "Call Status", "Message Type", "Message ID", "Message", "File Url", "File Caption", "Read Status", "Sent Status", "Contact Phone Number", "Contact Email", "Source Url", "Source Id", "Source Type"],
          r.rows.map((m) => ["", m.channel_id, m.contact_id, m.contact_name, m.agent_name || m.contact_name, m.agent_email, dirLabel(m.direction), "", "", "False", "", "", "", csvDT(m.created_at), csvDT(m.created_at), "", "", "", "", m.message_type, m.message_id, m.message, m.file_url, "", m.status, m.status, m.contact_phone, "", m.source_url, m.source_id, ""]));
      } else if (kind === "conversations") {
        const r = await api.systemLog<LogConversation>("conversations", { limit: 5000, offset: 0, from, to });
        downloadCsv("conversations.csv",
          ["Agent Name", "Email", "Department Name", "Customer Name", "Disposition", "Contact Number", "Assigned At", "Closed At", "First Reponse Time (sec)", "Average Reponse Time (sec)", "Closing Time (sec)", "Total Messages Sent By Agent", "Current Conversation Status", "Chat Initiation Time", "Has Abandonment", "Has Dropped", "Conversation Url", "Customer Satisfaction Rating", "Customer Satisfaction Review"],
          r.rows.map((c) => [c.agent_name, c.email, c.department_name, c.customer_name, c.disposition, c.contact_number, csvDT(c.assigned_at), csvDT(c.closed_at), c.first_response_sec, 0, c.closing_sec, c.agent_messages, c.status, csvDT(c.chat_initiation), "false", "false", `${location.origin}/inbox?c=${c.id}`, "", ""]));
      } else if (kind === "calls") {
        const r = await api.systemLog<LogCall>("calls", { limit: 5000, offset: 0, from, to });
        downloadCsv("calls.csv",
          ["Type", "Name", "Phone Number", "Duration (sec)", "Received At", "Ended At", "Agent", "Status"],
          r.rows.map((c) => [dirLabel(c.direction), c.name, c.phone, c.duration_seconds, csvDT(c.received_at), csvDT(c.ended_at), c.agent, c.call_status]));
      } else if (kind === "activity") {
        const r = await api.systemLog<LogActivity>("activity", { limit: 5000, offset: 0, from, to });
        downloadCsv("user-activity.csv",
          ["Agent Name", "Agent Email", "Agent Activity", "Offline Reason", "Action At"],
          r.rows.map((a) => [a.agent_name, a.agent_email, activityLabel(a), activityReason(a), csvDT(a.action_at)]));
      } else if (kind === "system") {
        downloadCsv("system-logs.csv", ["When", "Actor", "Action", "Entity", "Detail"],
          audit.map((a) => [csvDT(a.created_at), a.actor_name, a.action, `${a.entity_type} ${a.entity_id ?? ""}`, detailText(a.detail)]));
      }
    } finally { setExporting(null); }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE));
  const auditPaged = audit.slice(page * PAGE, page * PAGE + PAGE);
  const showExportBtn = tab !== "downloads";
  const showRange = tab !== "system";

  const TH = ({ children, className }: { children?: React.ReactNode; className?: string }) =>
    <th className={cn("px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap", className)}>{children}</th>;
  const cols: Record<TabKey, number> = { messages: 8, conversations: 9, activity: 5, system: 5, calls: 8, downloads: 1 };
  const rowsLen = tab === "messages" ? messages.length : tab === "conversations" ? convs.length : tab === "calls" ? calls.length : tab === "activity" ? activity.length : auditPaged.length;

  const DL = [
    { kind: "messages" as const, label: "Message History", desc: "All inbound + outbound messages", icon: MessageSquare },
    { kind: "conversations" as const, label: "Conversations", desc: "Conversation summaries + response times", icon: MessagesSquare },
    { kind: "calls" as const, label: "Call Logs", desc: "Voice calls with durations", icon: Phone },
    { kind: "activity" as const, label: "User Activity", desc: "Agent login / presence events", icon: Activity },
  ];

  return (
    <div className="h-full flex flex-col px-6 py-5 min-h-0 overflow-hidden">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border shrink-0 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors outline-none",
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 py-3 shrink-0">
        {showRange && <Select value={range} onChange={setRange} options={RANGES} className="w-[150px]" searchable={false} />}
        <div className="flex-1" />
        {showExportBtn && (
          <button onClick={() => exportData(tab as ExportKind)} disabled={!!exporting}
            className="inline-flex items-center gap-2 px-3.5 h-9 rounded-md border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 outline-none transition-colors">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Export
          </button>
        )}
      </div>

      {/* Body */}
      <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col">
        {tab === "downloads" ? (
          <div className="overflow-auto flex-1 min-h-0 p-5">
            <p className="text-[13px] text-muted-foreground mb-4">Download log data as CSV{range ? ` for the ${RANGES.find((r) => r.value === range)?.label.toLowerCase()}` : ""}. Message and Conversation files match the training column layout.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[760px]">
              {DL.map((d) => (
                <div key={d.kind} className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center shrink-0"><d.icon className="w-5 h-5 text-primary" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[13.5px] text-foreground">{d.label}</p>
                    <p className="text-[12px] text-muted-foreground truncate">{d.desc}</p>
                  </div>
                  <button onClick={() => exportData(d.kind)} disabled={!!exporting}
                    className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-[13px] font-semibold text-foreground hover:bg-muted disabled:opacity-50 outline-none transition-colors shrink-0">
                    {exporting === d.kind ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}CSV
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted z-10">
                <tr className="border-b border-border">
                  {tab === "messages" && <><TH>Created</TH><TH>Direction</TH><TH>Contact</TH><TH>Phone</TH><TH>Agent</TH><TH>Type</TH><TH>Message</TH><TH>Status</TH></>}
                  {tab === "conversations" && <><TH>Agent</TH><TH>Department</TH><TH>Customer</TH><TH>Contact</TH><TH>Status</TH><TH className="text-right">First resp (s)</TH><TH className="text-right">Closing (s)</TH><TH className="text-right">Agent msgs</TH><TH>Initiated</TH></>}
                  {tab === "activity" && <><TH>Agent Name</TH><TH>Agent Email</TH><TH>Agent Activity</TH><TH>Offline Reason</TH><TH>Action At</TH></>}
                  {tab === "calls" && <><TH>Type</TH><TH>Name</TH><TH>Phone Number</TH><TH className="text-right">Duration</TH><TH>Received At</TH><TH>Ended At</TH><TH>Agent</TH><TH>Status</TH></>}
                  {tab === "system" && <><TH>When</TH><TH>Actor</TH><TH>Action</TH><TH>Entity</TH><TH>Detail</TH></>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={cols[tab]} className="text-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></td></tr>
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
                      <td className="px-4 py-2.5 text-foreground/80">{c.department_name || "-"}</td>
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

        {/* Pagination */}
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
      </div>
    </div>
  );
}
