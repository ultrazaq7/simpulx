"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, Users, Send, CheckCheck, MessageSquare, Percent, CircleDollarSign,
  Trash2, RotateCcw, Download, Search, ArrowDownLeft, Megaphone, MousePointerClick,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tip } from "@/components/ui/tooltip";

import { api } from "@/lib/api";
import { Select } from "@/components/Select";
import { fmtDate, cn } from "@/lib/utils";
import type { BroadcastDetail, BroadcastRecipient } from "@/lib/types";

const STATUS_PILL: Record<string, string> = {
  completed: "bg-success/10 text-success", sending: "bg-info/10 text-info",
  queued: "bg-info/10 text-info", scheduled: "bg-warning/10 text-warning",
  draft: "bg-muted text-muted-foreground", failed: "bg-destructive/10 text-destructive",
};

export default function BroadcastDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<BroadcastDetail | null>(null);
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"general" | "messages">("general");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [det, rec] = await Promise.all([api.getBroadcast(id), api.listBroadcastRecipients(id).catch(() => [])]);
      setD(det); setRecipients(rec as BroadcastRecipient[]);
    } catch { /* ignore */ } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function retry() {
    if (!d) return;
    setBusy(true);
    try { await api.retryBroadcast(d.id); await load(); } catch { /* ignore */ } finally { setBusy(false); }
  }
  async function remove() {
    if (!d || !confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try { await api.deleteBroadcast(d.id); router.push("/broadcasts"); } catch { setBusy(false); }
  }

  if (loading) return <div className="grid place-items-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!d) return <div className="p-8 text-muted-foreground">Broadcast not found.</div>;

  const isTemplate = !!d.template_name;
  const unitCost = isTemplate ? 0.0466 : 0.0118;
  const cost = d.sent_count * unitCost;
  const responseRate = d.sent_count > 0 ? (d.responses / d.sent_count) * 100 : 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={() => router.push("/broadcasts")} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none"><ArrowLeft className="w-5 h-5" /></button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-[15px] text-foreground truncate">{d.name}</p>
            <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide capitalize", STATUS_PILL[d.status] ?? STATUS_PILL.draft)}>{d.status}</span>
          </div>
          <p className="text-[11.5px] text-muted-foreground">{isTemplate ? "Template broadcast" : "Text broadcast"} · {fmtDate(d.created_at)}</p>
        </div>
        <div className="flex-1" />
        {d.failed_count > 0 && (
          <button onClick={retry} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-[13px] font-semibold text-foreground/80 hover:bg-muted disabled:opacity-50 transition-colors outline-none">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Re-run failed
          </button>
        )}
        <Tip label="Delete"><button onClick={remove} disabled={busy} className="p-2 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 transition-colors outline-none"><Trash2 className="w-[18px] h-[18px]" /></button></Tip>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 border-b border-border bg-card shrink-0">
        {(["general", "messages"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("relative px-3 py-2.5 text-[13px] font-semibold capitalize outline-none transition-colors",
              tab === t ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
            {t === "messages" ? `Messages (${recipients.length})` : t}
            {tab === t && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4">
        {tab === "general"
          ? <GeneralTab d={d} cost={cost} responseRate={responseRate} isTemplate={isTemplate} />
          : <MessagesTab recipients={recipients} name={d.name} />}
      </div>
    </div>
  );
}

// ── General ────────────────────────────────────────────────────────────────
function StatCard({ Icon, label, value, accent }: { Icon: LucideIcon; label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg border border-border bg-card shadow-xs p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={cn("w-4 h-4", accent)} />
        <span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-[26px] font-bold text-foreground mt-2 tabular-nums leading-none">{value}</p>
    </div>
  );
}

function Bar({ segments }: { segments: { label: string; value: number; cls: string }[] }) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));
  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
        {segments.map((s) => s.value > 0 && <div key={s.label} className={s.cls} style={{ width: `${(s.value / total) * 100}%` }} />)}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={cn("w-2.5 h-2.5 rounded-sm", s.cls)} />
            <span className="text-[12px] text-muted-foreground">{s.label}</span>
            <span className="text-[12px] font-bold text-foreground tabular-nums">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GeneralTab({ d, cost, responseRate, isTemplate }: { d: BroadcastDetail; cost: number; responseRate: number; isTemplate: boolean }) {
  const meta: [string, string][] = [
    ["Campaign name", d.name],
    ["Type", isTemplate ? "WhatsApp template" : "Text message"],
    ["Total contacts", String(d.total_recipients)],
    ["Status", d.status],
    ["Channel (sent by)", d.channel_name ? (d.channel_display ? `${d.channel_name} (${d.channel_display})` : d.channel_name) : "-"],
    ...(isTemplate ? [["Template", `${d.template_name}${d.template_language ? ` (${d.template_language})` : ""}`] as [string, string]] : []),
    ["Audience", d.audience === "selected" ? "Selected contacts" : d.audience === "tags" ? "Tag filtered" : "All contacts"],
    ["Created", fmtDate(d.created_at)],
    ["Created by", d.created_by_name ?? "-"],
  ];
  return (
    <div className="space-y-4 max-w-[1100px]">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <StatCard Icon={Users} label="Recipients" value={String(d.total_recipients)} accent="text-info" />
        <StatCard Icon={Send} label="Sent" value={String(d.sent_count)} accent="text-primary" />
        <StatCard Icon={CheckCheck} label="Read" value={String(d.read_count)} accent="text-success" />
        <StatCard Icon={MousePointerClick} label="Clicks" value={String(d.clicks)} accent="text-secondary" />
        <StatCard Icon={MessageSquare} label="Responses" value={String(d.responses)} accent="text-amber" />
        <StatCard Icon={Percent} label="Response rate" value={`${responseRate.toFixed(1)}%`} accent="text-success" />
        <StatCard Icon={CircleDollarSign} label="Est. cost" value={`$${cost.toFixed(2)}`} accent="text-warning" />
      </div>

      {/* Breakdown bars */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card shadow-xs p-5">
          <p className="text-[13px] font-bold text-foreground mb-3">Delivery status</p>
          <Bar segments={[
            { label: "Sent", value: d.sent_count, cls: "bg-primary" },
            { label: "Pending", value: d.pending_count, cls: "bg-muted-foreground/50" },
            { label: "Failed", value: d.failed_count, cls: "bg-destructive" },
          ]} />
        </div>
        <div className="rounded-lg border border-border bg-card shadow-xs p-5">
          <p className="text-[13px] font-bold text-foreground mb-3">Read status</p>
          <Bar segments={[
            { label: "Read", value: d.read_count, cls: "bg-success" },
            { label: "Delivered", value: Math.max(0, d.delivered_count - d.read_count), cls: "bg-info" },
            { label: "Sent", value: Math.max(0, d.sent_count - d.delivered_count), cls: "bg-muted-foreground/40" },
          ]} />
        </div>
      </div>

      {/* Meta + preview */}
      <div className="grid lg:grid-cols-[1fr_300px] gap-3">
        <div className="rounded-lg border border-border bg-card shadow-xs divide-y divide-border">
          {meta.map(([k, v]) => (
            <div key={k} className="flex gap-3 px-5 py-3">
              <span className="w-40 shrink-0 text-[12.5px] text-muted-foreground">{k}</span>
              <span className="text-[13px] font-semibold text-foreground capitalize break-words min-w-0">{v}</span>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-border bg-card shadow-xs p-4">
          <p className="text-[13px] font-bold text-foreground mb-3 text-center">Preview</p>
          <div className="rounded-[24px] border-[3px] border-[#2D2D44] bg-[#1A1A2E] p-1.5 shadow-xl">
            <div className="rounded-[16px] overflow-hidden bg-[#ECE5DD]">
              <div className="h-8 bg-[#075E54]" />
              <div className="min-h-[170px] p-3 flex flex-col items-start" style={{ background: "#ECE5DD" }}>
                <div className="max-w-[200px] rounded-lg rounded-tl-sm bg-white px-3 pt-2 pb-1.5 shadow-sm">
                  <p className="text-[11.5px] leading-relaxed text-[#303030] whitespace-pre-wrap break-words">{(d.body || "(no message)").slice(0, 360)}</p>
                  <p className="text-right text-[8.5px] text-[#8D9A9E] mt-1">11:44</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Messages ───────────────────────────────────────────────────────────────
const SEND_BADGE: Record<string, string> = {
  sent: "bg-success/10 text-success", pending: "bg-muted text-muted-foreground", failed: "bg-destructive/10 text-destructive",
};
const READ_BADGE: Record<string, string> = {
  read: "bg-success/10 text-success", delivered: "bg-info/10 text-info", sent: "bg-muted text-muted-foreground", pending: "bg-muted text-muted-foreground",
};
type QuickFilter = "all" | "sent" | "pending" | "failed" | "clicked" | "responses";

function MessagesTab({ recipients, name }: { recipients: BroadcastRecipient[]; name: string }) {
  const [filter, setFilter] = useState<QuickFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);

  const filtered = useMemo(() => {
    let list = recipients;
    if (filter === "responses") list = list.filter((r) => r.responded);
    else if (filter === "clicked") list = list.filter((r) => r.clicked);
    else if (filter !== "all") list = list.filter((r) => r.send_status === filter);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((r) => (r.contact_name || r.phone || "").toLowerCase().includes(q));
    return list;
  }, [recipients, filter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  useEffect(() => { setPage(1); }, [filter, query, perPage]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Customer", "Number", "Send status", "Read status", "Type", "Clicked", "Responded"];
    const lines = filtered.map((r) => [r.contact_name, r.phone, r.send_status, r.read_status, r.type, r.clicked ? (r.clicked_button || "yes") : "no", r.responded ? "yes" : "no"].map(esc).join(","));
    const url = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${name}-messages.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const counts = useMemo(() => ({
    all: recipients.length,
    sent: recipients.filter((r) => r.send_status === "sent").length,
    pending: recipients.filter((r) => r.send_status === "pending").length,
    failed: recipients.filter((r) => r.send_status === "failed").length,
    clicked: recipients.filter((r) => r.clicked).length,
    responses: recipients.filter((r) => r.responded).length,
  }), [recipients]);

  const FILTERS: { key: QuickFilter; label: string }[] = [
    { key: "all", label: "All" }, { key: "sent", label: "Sent" }, { key: "pending", label: "Pending" },
    { key: "failed", label: "Failed" }, { key: "clicked", label: "Clicked" }, { key: "responses", label: "Responses" },
  ];

  return (
    <div>
      {/* toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={cn("inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md text-[12.5px] font-semibold transition-colors outline-none",
                filter === f.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
              {f.label}<span className="text-[11px] tabular-nums opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or number"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </div>
        <button onClick={exportCsv} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-[13px] font-semibold text-foreground/80 hover:bg-muted transition-colors outline-none">
          <Download className="w-4 h-4" /> Download
        </button>
      </div>

      {/* table */}
      <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Customer", "Number", "Send status", "Read status", "Type", "CTA", "Responded"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">No recipients match this filter.</td></tr>
              ) : paged.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-[13px] text-foreground">{r.contact_name || "Unknown"}</td>
                  <td className="px-4 py-2.5 text-foreground/80 tabular-nums">{r.phone || "-"}</td>
                  <td className="px-4 py-2.5"><span className={cn("inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold capitalize", SEND_BADGE[r.send_status] ?? SEND_BADGE.pending)}>{r.send_status}</span></td>
                  <td className="px-4 py-2.5"><span className={cn("inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold capitalize", READ_BADGE[r.read_status] ?? READ_BADGE.pending)}>{r.read_status}</span></td>
                  <td className="px-4 py-2.5 text-muted-foreground capitalize">{r.type}</td>
                  <td className="px-4 py-2.5">
                    {r.clicked
                      ? <span className="inline-flex items-center gap-1 text-secondary text-[12px] font-semibold"><MousePointerClick className="w-3.5 h-3.5" />{r.clicked_button || "Clicked"}</span>
                      : <span className="text-muted-foreground text-[12px]">-</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.responded
                      ? <span className="inline-flex items-center gap-1 text-info text-[12px] font-semibold"><ArrowDownLeft className="w-3.5 h-3.5" />Replied</span>
                      : <span className="text-muted-foreground text-[12px]">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* pagination */}
        <div className="flex items-center py-3 px-4 border-t border-border">
          <span className="text-[13px] font-semibold text-muted-foreground tabular-nums">{filtered.length} recipient{filtered.length === 1 ? "" : "s"}</span>
          <div className="flex-1 flex justify-center items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage(1)} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed outline-none transition-colors"><ChevronsLeft className="w-[18px] h-[18px]" /></button>
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed outline-none transition-colors"><ChevronLeft className="w-[18px] h-[18px]" /></button>
            <span className="px-3 py-1 rounded-md border border-primary/40 text-primary text-[13px] font-bold min-w-[32px] text-center tabular-nums">{page}</span>
            <span className="text-[13px] text-muted-foreground tabular-nums">/ {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed outline-none transition-colors"><ChevronRight className="w-[18px] h-[18px]" /></button>
            <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed outline-none transition-colors"><ChevronsRight className="w-[18px] h-[18px]" /></button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted-foreground">Per page</span>
            <Select value={String(perPage)} onChange={(v) => setPerPage(Number(v))} align="right" className="w-[76px]"
              options={[25, 50, 100].map((n) => ({ value: String(n), label: String(n) }))} />
          </div>
        </div>
      </div>
    </div>
  );
}
