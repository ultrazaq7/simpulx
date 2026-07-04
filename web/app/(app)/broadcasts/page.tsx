"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SpeakerLinear as Speaker, QuestionCircleLinear as RefreshCw, AddCircleLinear as Plus, CloseCircleLinear as X, RefreshLinear as Loader2, PlainLinear as Send, TrashBinTrashLinear as Trash2, CheckReadLinear as Check, MagniferLinear as Search, UploadSquareLinear as Upload, UsersGroupTwoRoundedLinear as Users, UserPlusRoundedLinear as UserPlus, FileTextLinear as FileText, ChatRoundLinear as MessageSquare, TagLinear as TagIcon, InfoCircleLinear as Info, ClockCircleLinear as Clock, CheckCircleLinear as CheckCircle2, DangerCircleLinear as AlertCircle, SmartphoneLinear as Smartphone, ArrowLeftLinear as ArrowLeft, AltArrowRightLinear as ChevronRight, AltArrowLeftLinear as ChevronLeft, QuestionCircleLinear as ChevronsLeft, QuestionCircleLinear as ChevronsRight } from "solar-icon-set";
import type { SVGProps } from "react";
type LucideIcon = (props: SVGProps<SVGSVGElement>) => JSX.Element;
import { Tip } from "@/components/ui/tooltip";

import { api } from "@/lib/api";
import { Select } from "@/components/Select";
import SidePanel from "@/components/SidePanel";
import { usePermissions } from "@/lib/permissions";
import { fmtDateTimeShort, cn } from "@/lib/utils";
import type { Broadcast, Template, Channel, Contact } from "@/lib/types";

// ── Status presentation ────────────────────────────────────────────────────
const STATUS: Record<string, { cls: string; Icon: LucideIcon }> = {
  completed: { cls: "bg-success/10 text-success", Icon: CheckCircle2 },
  sending: { cls: "bg-info/10 text-info", Icon: Send },
  queued: { cls: "bg-info/10 text-info", Icon: Send },
  scheduled: { cls: "bg-warning/10 text-warning", Icon: Clock },
  draft: { cls: "bg-muted text-muted-foreground", Icon: FileText },
  failed: { cls: "bg-destructive/10 text-destructive", Icon: AlertCircle },
};
const statusMeta = (s: string) => STATUS[s] ?? STATUS.draft;
const AUDIENCE_LABEL: Record<string, string> = { all: "All contacts", tags: "Tag filtered", selected: "Selected" };

type Toast = { msg: string; sev: "success" | "error" } | null;

// ════════════════════════════════════════════════════════════════════════════
// List page
// ════════════════════════════════════════════════════════════════════════════
export default function BroadcastsPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const canSend = can("send_broadcasts");
  const [rows, setRows] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  async function load() {
    setLoading(true);
    try { setRows(await api.listBroadcasts()); } catch { /* ignore */ } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((b) => (b.name + " " + (b.template_name || "") + " " + (b.body || "")).toLowerCase().includes(q));
  }, [rows, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  useEffect(() => { setPage(1); }, [query, perPage]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  async function sendNow(b: Broadcast) {
    if (!confirm(`Send "${b.name}" to ${b.total_recipients} recipient${b.total_recipients === 1 ? "" : "s"} now? This cannot be undone.`)) return;
    setBusyId(b.id);
    try { await api.sendBroadcast(b.id); setToast({ msg: "Broadcast is sending", sev: "success" }); load(); }
    catch (e) { setToast({ msg: String(e), sev: "error" }); }
    finally { setBusyId(null); }
  }
  async function remove(b: Broadcast) {
    if (!confirm(`Delete "${b.name}"? This cannot be undone.`)) return;
    setBusyId(b.id);
    try { await api.deleteBroadcast(b.id); setToast({ msg: "Broadcast deleted", sev: "success" }); load(); }
    catch (e) { setToast({ msg: String(e), sev: "error" }); }
    finally { setBusyId(null); }
  }

  return (
    <div className="px-4 pt-4 pb-4 h-full flex flex-col min-h-0">
      <div className="bg-card rounded-lg border border-border shadow-xs overflow-hidden flex flex-col flex-1 min-h-0">
        {/* Toolbar */}
        <div className="p-3 flex items-center gap-3 border-b border-border shrink-0">
          <div className="relative w-[300px] max-w-[45vw]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search broadcasts"
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </div>
          <Tip label="Refresh"><button onClick={load} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors outline-none">
            <RefreshCw className={cn("w-[18px] h-[18px]", loading && "animate-spin")} />
          </button></Tip>
          <div className="flex-1" />
          {canSend && (
            <button onClick={() => setWizardOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm hover:shadow-brand-md transition-all outline-none">
              <Speaker className="w-4 h-4" /> New broadcast
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Broadcast", "Status", "Audience", "Delivery", "Created", ""].map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{h || <span className="sr-only">Actions</span>}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? Array(6).fill(0).map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-2.5"><div className="h-10 skeleton rounded-md" /></td></tr>
              )) : paged.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16">
                    {rows.length === 0
                      ? <EmptyState onCreate={() => setWizardOpen(true)} canCreate={canSend} />
                      : <p className="text-center text-sm text-muted-foreground">No broadcasts match your search.</p>}
                  </td>
                </tr>
              ) : paged.map((b) => (
                <BroadcastRow key={b.id} b={b} busy={busyId === b.id} canManage={canSend}
                  onOpen={() => router.push(`/broadcasts/${b.id}`)}
                  onSend={() => sendNow(b)} onDelete={() => remove(b)} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center py-3 px-4 border-t border-border shrink-0">
          <span className="text-[13px] font-semibold text-muted-foreground tabular-nums">{filtered.length} broadcast{filtered.length === 1 ? "" : "s"}</span>
          <div className="flex-1 flex justify-center items-center gap-1">
            <button aria-label="First page" disabled={page <= 1} onClick={() => setPage(1)} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed outline-none transition-colors"><ChevronsLeft className="w-[18px] h-[18px]" /></button>
            <button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed outline-none transition-colors"><ChevronLeft className="w-[18px] h-[18px]" /></button>
            <span className="px-3 py-1 rounded-md border border-primary/40 text-primary text-[13px] font-bold min-w-[32px] text-center tabular-nums">{page}</span>
            <span className="text-[13px] text-muted-foreground tabular-nums">/ {totalPages}</span>
            <button aria-label="Next page" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed outline-none transition-colors"><ChevronRight className="w-[18px] h-[18px]" /></button>
            <button aria-label="Last page" disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed outline-none transition-colors"><ChevronsRight className="w-[18px] h-[18px]" /></button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted-foreground">Per page</span>
            <Select value={String(perPage)} onChange={(v) => setPerPage(Number(v))} align="right" className="w-[72px]"
              options={[10, 25, 50].map((n) => ({ value: String(n), label: String(n) }))} />
          </div>
        </div>
      </div>

      {wizardOpen && (
        <BroadcastWizard
          onClose={() => setWizardOpen(false)}
          onDone={(msg) => { setWizardOpen(false); setToast({ msg, sev: "success" }); load(); }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-6 z-[120] animate-scale-in">
          <div className={cn("px-4 py-2.5 rounded-lg text-sm font-semibold shadow-xl text-white",
            toast.sev === "error" ? "bg-[#DC2626]" : "bg-[#2D8B73]")}>
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onCreate, canCreate }: { onCreate: () => void; canCreate: boolean }) {
  return (
    <div className="grid place-items-center text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 grid place-items-center mb-4">
        <Speaker className="w-8 h-8 text-primary" />
      </div>
      <p className="font-bold text-foreground">No broadcasts yet</p>
      <p className="text-sm text-muted-foreground mt-1 mb-4">Send bulk messages to your contacts at once.</p>
      {canCreate && (
        <button onClick={onCreate}
          className="inline-flex items-center gap-2 px-4 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm hover:shadow-brand-md transition-all outline-none">
          <Plus className="w-4 h-4" /> Create first broadcast
        </button>
      )}
    </div>
  );
}

function BroadcastRow({ b, busy, canManage, onOpen, onSend, onDelete }: { b: Broadcast; busy: boolean; canManage: boolean; onOpen: () => void; onSend: () => void; onDelete: () => void }) {
  const sm = statusMeta(b.status);
  const isTemplate = !!b.template_name;
  const preview = isTemplate ? b.template_name! : (b.body?.trim() || "No message");
  const canSend = b.status === "draft" || b.status === "scheduled" || b.status === "failed";
  const pct = b.total_recipients > 0 ? Math.round((b.sent_count / b.total_recipients) * 100) : 0;
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

  return (
    <tr onClick={onOpen} className="border-b border-border/60 hover:bg-muted/40 transition-colors cursor-pointer">
      {/* Broadcast */}
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("w-9 h-9 rounded-md grid place-items-center shrink-0", sm.cls)}><sm.Icon className="w-[18px] h-[18px]" /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-[13px] text-foreground truncate max-w-[260px]">{b.name}</p>
              {isTemplate && <span className="inline-flex px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[9px] font-bold uppercase tracking-wide shrink-0">Template</span>}
            </div>
            <p className="text-[11.5px] text-muted-foreground truncate max-w-[300px]">{preview}</p>
          </div>
        </div>
      </td>
      {/* Status */}
      <td className="px-4 py-2.5">
        <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide capitalize", sm.cls)}>{b.status}</span>
      </td>
      {/* Audience */}
      <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground whitespace-nowrap">{AUDIENCE_LABEL[b.audience || "all"] ?? "All contacts"}</td>
      {/* Delivery */}
      <td className="px-4 py-2.5">
        <div className="min-w-[130px]">
          <div className="flex items-center gap-1.5 text-[12.5px]">
            <span className="font-bold tabular-nums text-foreground/90">{b.sent_count}</span>
            <span className="text-muted-foreground">/ {b.total_recipients}</span>
            {b.failed_count > 0 && <span className="text-destructive font-semibold tabular-nums">· {b.failed_count} failed</span>}
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[140px]">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </td>
      {/* Created */}
      <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground whitespace-nowrap">{fmtDateTimeShort(b.created_at)}</td>
      {/* Actions */}
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-1">
          {canManage && canSend && (
            <button onClick={stop(onSend)} disabled={busy}
              className="inline-flex items-center gap-1.5 px-2.5 h-8 border border-primary/40 text-primary rounded-md text-[12.5px] font-semibold hover:bg-primary/5 disabled:opacity-50 transition-colors outline-none whitespace-nowrap">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send now
            </button>
          )}
          <Tip label="See details"><button onClick={stop(onOpen)} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors outline-none"><ChevronRight className="w-[18px] h-[18px]" /></button></Tip>
          {canManage && (
            <Tip label="Delete"><button onClick={stop(onDelete)} disabled={busy}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 transition-colors outline-none"><Trash2 className="w-[18px] h-[18px]" /></button></Tip>
          )}
        </div>
      </td>
    </tr>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Wizard
// ════════════════════════════════════════════════════════════════════════════
const STEPS = ["Name", "Channel", "Audience", "Message", "Review"] as const;

function BroadcastWizard({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [step, setStep] = useState(0);

  // form state
  const [name, setName] = useState("");
  const [type, setType] = useState<"template" | "text">("template");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [audienceMode, setAudienceMode] = useState<"all" | "selected">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterTags, setFilterTags] = useState<Set<string>>(new Set());
  const [contactSearch, setContactSearch] = useState("");
  const [textMessage, setTextMessage] = useState("");
  const [testContactId, setTestContactId] = useState<string | null>(null);
  const [sendNow, setSendNow] = useState(true);

  // data
  const [channels, setChannels] = useState<Channel[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all([
      api.listChannels().catch(() => []),
      api.listTemplates().catch(() => []),
      api.listContacts().catch(() => []),
    ]).then(([ch, tpl, cts]) => {
      setChannels((ch as Channel[]).filter((c) => c.type === "whatsapp" || !c.type));
      setTemplates(tpl as Template[]);
      setContacts(cts as Contact[]);
    });
  }, []);

  const channel = channels.find((c) => c.id === channelId) || null;
  const template = templates.find((t) => t.id === templateId) || null;

  const approvedTemplates = useMemo(
    () => templates.filter((t) => t.status === "APPROVED" && (!t.channel_id || t.channel_id === channelId)),
    [templates, channelId],
  );

  const allTags = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => (c.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [contacts]);

  const withPhone = useMemo(() => contacts.filter((c) => (c.phone || "").trim()), [contacts]);

  const estRecipients = useMemo(() => {
    if (audienceMode === "selected") return selectedIds.size;
    if (filterTags.size === 0) return withPhone.length;
    return withPhone.filter((c) => (c.tags || []).some((t) => filterTags.has(t))).length;
  }, [audienceMode, selectedIds, filterTags, withPhone]);

  const costEstimate = useMemo(() => {
    const n = estRecipients;
    return type === "template"
      ? `~$${(n * 0.0466).toFixed(2)} USD (${n} x $0.0466/template)`
      : `~$${(n * 0.0118).toFixed(2)} USD (${n} x $0.0118/session)`;
  }, [estRecipients, type]);

  // test candidates = contacts with phone, scoped to selection in 'selected' mode
  const testCandidates = useMemo(() => {
    const base = audienceMode === "selected" ? withPhone.filter((c) => selectedIds.has(c.id)) : withPhone;
    return base;
  }, [audienceMode, withPhone, selectedIds]);

  useEffect(() => {
    if (testContactId && testCandidates.some((c) => c.id === testContactId)) return;
    setTestContactId(testCandidates[0]?.id ?? null);
  }, [testCandidates]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => (c.full_name || c.phone || "").toLowerCase().includes(q));
  }, [contacts, contactSearch]);

  const previewBody = type === "template"
    ? (template?.body?.trim() || (template ? `Template: ${template.name}` : "Select a template to preview it here."))
    : (textMessage.trim() || "Your message preview will appear here.");

  const canProceed = (() => {
    switch (step) {
      case 0: return name.trim().length > 0;
      case 1: return !!channelId;
      case 2: return audienceMode === "selected" ? selectedIds.size > 0 : true;
      case 3: return type === "template" ? !!templateId : textMessage.trim().length > 0;
      default: return true;
    }
  })();

  const canTest = !!channelId && !!testContactId && (type === "template" ? !!templateId : textMessage.trim().length > 0);

  function toggleContact(id: string) {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function sendTest() {
    if (!canTest || sendingTest) return;
    setSendingTest(true); setErr("");
    try {
      await api.testSendBroadcast({
        channel_id: channelId!, contact_id: testContactId!,
        template_id: type === "template" ? templateId! : undefined,
        body: type === "text" ? textMessage.trim() : undefined,
      });
      setErr(""); flashTest("Test message sent");
    } catch (e) { setErr(`Test failed: ${e}`); }
    finally { setSendingTest(false); }
  }
  const [testFlash, setTestFlash] = useState("");
  function flashTest(m: string) { setTestFlash(m); setTimeout(() => setTestFlash(""), 2500); }

  async function submit() {
    setSaving(true); setErr("");
    try {
      const r = await api.createBroadcast({
        name: name.trim(),
        channel_id: channelId || undefined,
        template_id: type === "template" ? templateId || undefined : undefined,
        body: type === "text" ? textMessage.trim() : undefined,
        audience: audienceMode,
        tags: audienceMode === "all" && filterTags.size ? Array.from(filterTags) : undefined,
        contact_ids: audienceMode === "selected" ? Array.from(selectedIds) : undefined,
        send_now: sendNow,
      });
      onDone(r.status === "scheduled" ? "Broadcast scheduled"
        : r.status === "queued" ? `Broadcast sending to ${r.total_recipients} recipient${r.total_recipients === 1 ? "" : "s"}`
        : "Broadcast saved as draft");
    } catch (e) { setErr(`Failed to create: ${e}`); setSaving(false); }
  }

  return (
    <>
    <SidePanel
      open
      onClose={onClose}
      title="New broadcast"
      description={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}
      width="lg"
      footer={
        <div className="flex items-center gap-2 w-full">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="inline-flex items-center gap-1.5 px-4 h-9 rounded-md border border-border text-sm font-semibold text-foreground/80 hover:bg-muted transition-colors outline-none">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          )}
          <div className="flex-1" />
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep(step + 1)} disabled={!canProceed}
              className="px-5 h-9 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow-brand-md transition-all outline-none">
              Continue
            </button>
          ) : (
            <button onClick={submit} disabled={saving}
              className={cn("inline-flex items-center gap-2 px-5 h-9 rounded-md text-sm font-semibold text-white disabled:opacity-50 transition-all outline-none shadow-sm",
                sendNow ? "bg-primary hover:bg-primary-dark hover:shadow-brand-md" : "bg-muted-foreground hover:opacity-90")}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {sendNow ? "Create & send" : "Save as draft"}
            </button>
          )}
        </div>
      }
    >
        {/* Step dots */}
        <div className="flex items-center gap-3 pb-5">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0"><Speaker className="w-5 h-5" /></div>
          <div className="flex items-center flex-1">
            {STEPS.map((s, i) => {
              const done = i < step, active = i === step;
              return (
                <div key={s} className="flex items-center flex-1 last:flex-none">
                  <div className={cn("w-7 h-7 rounded-full grid place-items-center text-[12px] font-bold shrink-0 transition-colors",
                    done ? "bg-success text-white" : active ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
                    {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  {i < STEPS.length - 1 && <div className={cn("h-0.5 flex-1 mx-1.5 rounded-full", done ? "bg-success" : "bg-border")} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div>
          {step === 0 && <NameStep name={name} setName={setName} />}
          {step === 1 && <ChannelStep {...{ type, setType, channels, channelId, setChannelId, setTemplateId }} />}
          {step === 2 && <AudienceStep {...{ audienceMode, setAudienceMode, allTags, filterTags, setFilterTags, estRecipients, contacts: filteredContacts, selectedIds, toggleContact, contactSearch, setContactSearch, onImport: () => setImportOpen(true) }} />}
          {step === 3 && (
            <MessageStep {...{ type, textMessage, setTextMessage, approvedTemplates, templateId, setTemplateId, template, previewBody,
              testCandidates, testContactId, setTestContactId, canTest, sendTest, sendingTest, testFlash, audienceMode }} />
          )}
          {step === 4 && (
            <ReviewStep {...{ name, type, channelName: channel?.name ?? null, audienceMode, filterTags, selectedCount: selectedIds.size,
              template, textMessage, previewBody, costEstimate, sendNow, setSendNow }} />
          )}
          {err && <div className="mt-4 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-[13px] font-medium">{err}</div>}
        </div>
    </SidePanel>

    {importOpen && (
      <ImportContactsDialog contacts={contacts}
        onClose={() => setImportOpen(false)}
        onMatched={(ids, count, total) => {
          setSelectedIds((prev) => { const n = new Set(prev); ids.forEach((i) => n.add(i)); return n; });
          setImportOpen(false);
          flashTest(`${count} contact${count === 1 ? "" : "s"} matched from ${total} numbers`);
        }} />
    )}
    </>
  );
}

// ── Step 0: Name ───────────────────────────────────────────────────────────
function NameStep({ name, setName }: { name: string; setName: (v: string) => void }) {
  return (
    <div>
      <StepHead title="Broadcast name" hint="Give your broadcast a recognizable name for internal reference." />
      <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Promo Ramadan 2026"
        className="w-full h-11 px-3.5 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20" />
    </div>
  );
}

// ── Step 1: Type + Channel ─────────────────────────────────────────────────
function ChannelStep({ type, setType, channels, channelId, setChannelId, setTemplateId }: {
  type: "template" | "text"; setType: (v: "template" | "text") => void; channels: Channel[];
  channelId: string | null; setChannelId: (v: string) => void; setTemplateId: (v: null) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[13px] font-bold text-foreground mb-2.5">Message type</p>
        <div className="grid grid-cols-2 gap-3">
          <OptionCard selected={type === "template"} onClick={() => { setType("template"); setTemplateId(null); }}
            Icon={FileText} title="WhatsApp template" subtitle="Use pre-approved templates" />
          <OptionCard selected={type === "text"} onClick={() => { setType("text"); setTemplateId(null); }}
            Icon={MessageSquare} title="Text message" subtitle="Send a plain text message" />
        </div>
      </div>
      <div>
        <StepHead title="WhatsApp channel" hint="Select the number to send from." sm />
        {channels.length === 0 ? (
          <Notice>No WhatsApp channels configured.</Notice>
        ) : (
          <div className="space-y-2">
            {channels.map((ch) => {
              const sel = channelId === ch.id;
              return (
                <button key={ch.id} onClick={() => { setChannelId(ch.id); setTemplateId(null); }}
                  className={cn("w-full flex items-center gap-3 p-3.5 rounded-md border text-left transition-colors outline-none",
                    sel ? "border-primary bg-primary/[0.06] ring-1 ring-primary/30" : "border-border hover:bg-muted/50")}>
                  <Smartphone className={cn("w-5 h-5 shrink-0", sel ? "text-primary" : "text-muted-foreground")} />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-semibold truncate", sel && "text-primary")}>{ch.name}</p>
                    {ch.display_id && ch.display_id !== ch.name && <p className="text-[11px] text-muted-foreground">{ch.display_id}</p>}
                  </div>
                  {sel && <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 2: Audience ───────────────────────────────────────────────────────
function AudienceStep(p: {
  audienceMode: "all" | "selected"; setAudienceMode: (v: "all" | "selected") => void;
  allTags: string[]; filterTags: Set<string>; setFilterTags: (s: Set<string>) => void; estRecipients: number;
  contacts: Contact[]; selectedIds: Set<string>; toggleContact: (id: string) => void;
  contactSearch: string; setContactSearch: (v: string) => void; onImport: () => void;
}) {
  const toggleTag = (t: string) => { const n = new Set(p.filterTags); n.has(t) ? n.delete(t) : n.add(t); p.setFilterTags(n); };
  return (
    <div>
      <StepHead title="Audience" hint="Target all contacts or pick specific contacts only." />
      <div className="grid grid-cols-2 gap-3">
        <OptionCard selected={p.audienceMode === "all"} onClick={() => p.setAudienceMode("all")}
          Icon={Users} title="All contacts" subtitle="Every contact with a phone" />
        <OptionCard selected={p.audienceMode === "selected"} onClick={() => p.setAudienceMode("selected")}
          Icon={UserPlus} title="Selected contacts" subtitle="Pick specific contacts" />
      </div>

      {p.audienceMode === "all" && (
        <div className="mt-6">
          <p className="text-[13px] font-bold text-foreground">Filter by labels <span className="text-muted-foreground font-medium">(optional)</span></p>
          <p className="text-[12px] text-muted-foreground mt-0.5 mb-3">Only send to contacts with any selected label. Leave empty to send to all.</p>
          {p.allTags.length === 0 ? (
            <div className="px-3 py-2.5 rounded-md bg-muted/50 text-[12px] text-muted-foreground">No labels found across contacts.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {p.allTags.map((t) => {
                const on = p.filterTags.has(t);
                return (
                  <button key={t} onClick={() => toggleTag(t)}
                    className={cn("inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[12px] font-semibold border transition-colors outline-none",
                      on ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-foreground/70 hover:bg-muted")}>
                    {on ? <Check className="w-3 h-3" /> : <TagIcon className="w-3 h-3" />}{t}
                  </button>
                );
              })}
            </div>
          )}
          {p.filterTags.size > 0 && (
            <p className="text-[12px] font-semibold text-primary mt-2.5">
              {p.filterTags.size} tag{p.filterTags.size === 1 ? "" : "s"} selected - ~{p.estRecipients} recipients
            </p>
          )}
        </div>
      )}

      {p.audienceMode === "selected" && (
        <div className="mt-6">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input value={p.contactSearch} onChange={(e) => p.setContactSearch(e.target.value)} placeholder="Search by name or phone"
              className="w-full h-10 pl-9 pr-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </div>
          <div className="rounded-md border border-border max-h-[240px] overflow-y-auto divide-y divide-border">
            {p.contacts.length === 0 ? (
              <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">No contacts found.</div>
            ) : p.contacts.map((c) => {
              const phone = (c.phone || "").trim();
              const can = phone.length > 0;
              const sel = p.selectedIds.has(c.id);
              return (
                <button key={c.id} disabled={!can} onClick={() => p.toggleContact(c.id)}
                  className={cn("w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors outline-none disabled:opacity-60",
                    can && "hover:bg-muted/50")}>
                  <span className={cn("w-4 h-4 rounded border grid place-items-center shrink-0",
                    sel ? "bg-primary border-primary" : "border-input")}>
                    {sel && <Check className="w-3 h-3 text-white" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate">{c.full_name || c.phone || "Unknown"}</p>
                    <p className={cn("text-[11.5px]", can ? "text-muted-foreground" : "text-destructive")}>{phone || "No phone number"}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <button onClick={p.onImport}
            className="inline-flex items-center gap-1.5 px-3 h-8 mt-3 rounded-md border border-border text-[13px] font-semibold text-foreground/80 hover:bg-muted transition-colors outline-none">
            <Upload className="w-4 h-4" /> Import phone numbers
          </button>
          <p className="text-[12px] text-muted-foreground mt-2.5">{p.selectedIds.size} contact{p.selectedIds.size === 1 ? "" : "s"} selected</p>
        </div>
      )}
    </div>
  );
}

// ── Step 3: Message ────────────────────────────────────────────────────────
function MessageStep(p: {
  type: "template" | "text"; textMessage: string; setTextMessage: (v: string) => void;
  approvedTemplates: Template[]; templateId: string | null; setTemplateId: (v: string) => void; template: Template | null;
  previewBody: string; testCandidates: Contact[]; testContactId: string | null; setTestContactId: (v: string) => void;
  canTest: boolean; sendTest: () => void; sendingTest: boolean; testFlash: string; audienceMode: "all" | "selected";
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-6">
      <div className="min-w-0">
        {p.type === "text" ? (
          <>
            <StepHead title="Message content" hint="Write your broadcast message and send a test first." />
            <textarea value={p.textMessage} onChange={(e) => p.setTextMessage(e.target.value)} rows={6} autoFocus placeholder="Type your message here..."
              className="w-full px-3.5 py-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/70 outline-none resize-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </>
        ) : (
          <>
            <StepHead title="Select template" hint="Choose a pre-approved WhatsApp template to send." />
            {p.approvedTemplates.length === 0 ? (
              <Notice>No approved templates found for this channel.</Notice>
            ) : (
              <div className="space-y-2.5">
                {p.approvedTemplates.map((t) => {
                  const sel = p.templateId === t.id;
                  return (
                    <button key={t.id} onClick={() => p.setTemplateId(t.id)}
                      className={cn("w-full text-left p-3.5 rounded-md border transition-colors outline-none",
                        sel ? "border-primary bg-primary/[0.06] ring-1 ring-primary/30" : "border-border hover:bg-muted/50")}>
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-bold text-foreground flex-1 truncate">{t.name}</p>
                        <span className="px-1.5 py-0.5 rounded bg-success/12 text-success text-[10px] font-bold uppercase">{t.language}</span>
                        {sel && <CheckCircle2 className="w-4 h-4 text-primary" />}
                      </div>
                      {t.body && <p className="text-[12px] text-muted-foreground mt-1.5 line-clamp-2">{t.body}</p>}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Test section */}
        <div className="mt-5 rounded-md border border-border p-4">
          <p className="text-[13px] font-bold text-foreground">Test message</p>
          <p className="text-[12px] text-muted-foreground mt-0.5 mb-3">Send a test to one contact before launching the full broadcast.</p>
          <div className="mb-3">
            <Select
              value={p.testContactId ?? ""}
              onChange={p.setTestContactId}
              disabled={p.testCandidates.length === 0}
              placeholder={p.testCandidates.length === 0 ? "No contacts available" : "Select a contact"}
              options={p.testCandidates.map((c) => ({ value: c.id, label: `${c.full_name || "Contact"} - ${c.phone}` }))}
            />
          </div>
          <button onClick={p.sendTest} disabled={!p.canTest || p.sendingTest}
            className="w-full inline-flex items-center justify-center gap-2 h-9 rounded-md border border-border text-[13px] font-semibold text-foreground/80 hover:bg-muted disabled:opacity-50 transition-colors outline-none">
            {p.sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {p.sendingTest ? "Sending test..." : "Send test message"}
          </button>
          {p.testFlash && <p className="text-[12px] font-semibold text-success mt-2">{p.testFlash}</p>}
          {p.testCandidates.length === 0 && (
            <p className="text-[11.5px] text-destructive mt-2">
              {p.audienceMode === "selected" ? "Select at least one contact with a phone number." : "No contacts with a phone number available."}
            </p>
          )}
        </div>
      </div>

      <DevicePreview title={p.type === "template" ? "Template preview" : "Live preview"} content={p.previewBody}
        footer={p.type === "template" && p.template ? `Template - ${p.template.name} (${p.template.language})` : undefined} />
    </div>
  );
}

// ── Step 4: Review ─────────────────────────────────────────────────────────
function ReviewStep(p: {
  name: string; type: "template" | "text"; channelName: string | null; audienceMode: "all" | "selected";
  filterTags: Set<string>; selectedCount: number; template: Template | null; textMessage: string;
  previewBody: string; costEstimate: string; sendNow: boolean; setSendNow: (v: boolean) => void;
}) {
  const audienceLabel = p.audienceMode === "selected"
    ? `Selected (${p.selectedCount} contacts)`
    : p.filterTags.size > 0 ? `All with tags: ${Array.from(p.filterTags).join(", ")}` : "All contacts with a phone";
  const rows: [string, string][] = [
    ["Name", p.name.trim()],
    ["Type", p.type === "template" ? "WhatsApp template" : "Text message"],
    ["Channel", p.channelName ?? "Not selected"],
    ["Audience", audienceLabel],
    ...(p.type === "template" ? [["Template", p.template?.name ?? "None"] as [string, string]] : []),
    ...(p.type === "text" ? [["Message", p.textMessage.length > 80 ? p.textMessage.slice(0, 80) + "..." : (p.textMessage || "-")] as [string, string]] : []),
  ];
  return (
    <div className="grid grid-cols-[1fr_auto] gap-6">
      <div className="min-w-0">
        <StepHead title="Review & confirm" />
        <div className="rounded-md border border-border divide-y divide-border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-3 px-4 py-2.5">
              <span className="w-20 shrink-0 text-[13px] text-muted-foreground">{k}</span>
              <span className="text-[13px] font-semibold text-foreground break-words min-w-0">{v}</span>
            </div>
          ))}
        </div>

        {/* Cost estimate */}
        <div className="mt-4 flex items-start gap-3 p-3.5 rounded-md bg-warning/10 border border-warning/25">
          <Info className="w-[18px] h-[18px] text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-bold text-foreground">Estimated cost</p>
            <p className="text-[12.5px] font-semibold text-warning mt-0.5">{p.costEstimate}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Based on Meta WhatsApp Business pricing. Actual cost may vary.</p>
          </div>
        </div>

        {/* Send now toggle */}
        <div className="mt-4 flex items-center gap-3 p-3.5 rounded-md border border-border">
          <button onClick={() => p.setSendNow(!p.sendNow)}
            className={cn("relative w-10 h-6 rounded-full transition-colors shrink-0 outline-none", p.sendNow ? "bg-primary" : "bg-muted")}>
            <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform", p.sendNow && "translate-x-4")} />
          </button>
          <div>
            <p className="text-[14px] font-semibold text-foreground">Send immediately</p>
            <p className="text-[12px] text-muted-foreground">Toggle off to save as a draft first.</p>
          </div>
        </div>
      </div>

      <DevicePreview title="Final preview" content={p.previewBody}
        footer={p.type === "template" && p.template ? `Template - ${p.template.name} (${p.template.language})` : undefined} />
    </div>
  );
}

// ── Import dialog ──────────────────────────────────────────────────────────
function ImportContactsDialog({ contacts, onClose, onMatched }: {
  contacts: Contact[]; onClose: () => void; onMatched: (ids: string[], matched: number, total: number) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState("");
  function doImport() {
    const raw = ref.current?.value ?? "";
    const phones = Array.from(new Set(
      raw.replace(/[,;]/g, "\n").split(/\s+/).map((p) => p.trim().replace(/[^0-9+]/g, "")).filter((p) => p.length >= 8),
    ));
    if (phones.length === 0) { setError("No valid phone numbers found."); return; }
    const ids: string[] = [];
    for (const c of contacts) {
      const cp = (c.phone || "").replace(/[^0-9+]/g, "");
      if (!cp) continue;
      const tail = cp.length > 5 ? cp.slice(-8) : cp;
      if (phones.some((p) => { const pt = p.length > 5 ? p.slice(-8) : p; return cp.endsWith(pt) || p.endsWith(tail); })) ids.push(c.id);
    }
    onMatched(ids, ids.length, phones.length);
  }
  return (
    <div className="absolute inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative w-[440px] rounded-lg border border-border bg-card shadow-2xl animate-scale-in">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
          <Upload className="w-[18px] h-[18px] text-primary" />
          <p className="font-bold text-[15px] text-foreground flex-1">Import phone numbers</p>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted outline-none"><X className="w-[18px] h-[18px]" /></button>
        </div>
        <div className="p-5">
          <p className="text-[12.5px] text-muted-foreground mb-3">Paste phone numbers separated by commas, newlines, or spaces. Matching contacts are auto-selected.</p>
          <textarea ref={ref} rows={6} placeholder={"+628123456789, +628987654321\nor one per line..."}
            className="w-full px-3 py-2.5 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/70 outline-none resize-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          {error && <p className="text-[12px] text-destructive font-medium mt-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm font-semibold text-foreground/70 hover:bg-muted outline-none">Cancel</button>
          <button onClick={doImport} className="px-4 py-1.5 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary-dark outline-none">Import & match</button>
        </div>
      </div>
    </div>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────────
function StepHead({ title, hint, sm }: { title: string; hint?: string; sm?: boolean }) {
  return (
    <div className="mb-3">
      <p className={cn("font-bold text-foreground", sm ? "text-[13px]" : "text-[14px]")}>{title}</p>
      {hint && <p className="text-[12px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function OptionCard({ selected, onClick, Icon, title, subtitle }: { selected: boolean; onClick: () => void; Icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <button onClick={onClick}
      className={cn("text-left p-3.5 rounded-md border transition-colors outline-none",
        selected ? "border-primary bg-primary/[0.06] ring-1 ring-primary/30" : "border-border hover:bg-muted/50")}>
      <Icon className={cn("w-5 h-5", selected ? "text-primary" : "text-muted-foreground")} />
      <p className={cn("text-[13px] font-bold mt-2", selected && "text-primary")}>{title}</p>
      <p className="text-[11.5px] text-muted-foreground mt-0.5">{subtitle}</p>
    </button>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3.5 py-3 rounded-md bg-warning/10 border border-warning/25 text-[13px] text-foreground/80">
      <AlertCircle className="w-[18px] h-[18px] text-warning shrink-0" />{children}
    </div>
  );
}

function DevicePreview({ title, content, footer }: { title: string; content: string; footer?: string }) {
  const now = new Date();
  const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
  return (
    <div className="w-[244px] shrink-0">
      <p className="text-[13px] font-bold text-foreground mb-3">{title}</p>
      <div className="rounded-[26px] border-[3px] border-[#2D2D44] bg-[#1A1A2E] p-1.5 shadow-xl">
        <div className="w-12 h-1 rounded-full bg-[#333355] mx-auto my-1.5" />
        <div className="rounded-[18px] overflow-hidden bg-[#ECE5DD]">
          {/* WA header */}
          <div className="flex items-center gap-2 px-2.5 py-2 bg-[#075E54]">
            <ArrowLeft className="w-3.5 h-3.5 text-white" />
            <div className="w-6 h-6 rounded-full bg-[#128C7E] grid place-items-center"><Users className="w-3.5 h-3.5 text-white" /></div>
            <div className="leading-tight">
              <p className="text-[11px] font-semibold text-white">Contact</p>
              <p className="text-[8.5px] text-white/70">online</p>
            </div>
          </div>
          {/* chat */}
          <div className="min-h-[180px] p-2.5 flex flex-col items-end justify-start" style={{ background: "#ECE5DD" }}>
            <div className="max-w-[180px] rounded-lg rounded-tr-sm bg-[#DCF8C6] px-2.5 pt-2 pb-1.5 shadow-sm">
              <p className="text-[11.5px] leading-relaxed text-[#303030] whitespace-pre-wrap break-words">{content.length > 320 ? content.slice(0, 320) + "..." : content}</p>
              {footer && <p className="mt-1.5 inline-block px-1.5 py-0.5 rounded bg-[#075E54]/10 text-[9px] font-medium text-[#075E54]">{footer}</p>}
              <div className="flex items-center justify-end gap-1 mt-1">
                <span className="text-[8.5px] text-[#8D9A9E]">{time}</span>
                <Check className="w-3 h-3 text-[#53BDEB]" />
              </div>
            </div>
          </div>
          {/* input bar */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[#F0F0F0]">
            <div className="flex-1 h-6 rounded-full bg-white px-2.5 flex items-center"><span className="text-[10px] text-[#B0B6BA]">Type a message</span></div>
            <div className="w-6 h-6 rounded-full bg-[#075E54] grid place-items-center"><Send className="w-3 h-3 text-white" /></div>
          </div>
        </div>
        <div className="w-24 h-1 rounded-full bg-[#444466] mx-auto my-1.5" />
      </div>
    </div>
  );
}
