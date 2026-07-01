"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  FileText, Plus, Send, Trash2, Eye, Download, Loader2, X, GripVertical,
  CheckCircle2, AlertCircle, Rocket, Pencil, ChevronDown, Search, RefreshCw,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Sheet,
} from "lucide-react";
import { api, getToken } from "@/lib/api";
import { Select } from "@/components/Select";
import { Tip } from "@/components/ui/tooltip";
import { cn, fmtDate } from "@/lib/utils";
import type {
  WaFlow, WaFlowDetail, WaFlowResponse, FlowDefinition, FlowScreen,
  FlowComponent, FlowComponentType,
} from "@/lib/types";

// ── Component palette (friendly labels, Meta-Flow component types) ──
const PALETTE: { type: FlowComponentType; label: string; input: boolean }[] = [
  { type: "heading", label: "Large Heading", input: false },
  { type: "body", label: "Body", input: false },
  { type: "caption", label: "Caption", input: false },
  { type: "text_input", label: "Short Answer", input: true },
  { type: "text_area", label: "Paragraph", input: true },
  { type: "dropdown", label: "Drop-Down", input: true },
  { type: "radio", label: "Single Choice", input: true },
  { type: "checkbox", label: "Multiple Choice", input: true },
  { type: "chips", label: "Chip Selector", input: true },
  { type: "date", label: "Date Picker", input: true },
];
const isInput = (t: FlowComponentType) => PALETTE.find((p) => p.type === t)?.input ?? false;
const hasOptions = (t: FlowComponentType) => ["dropdown", "radio", "checkbox", "chips"].includes(t);
const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";

const STATUS_BADGE: Record<string, string> = {
  published: "bg-success/10 text-success",
  draft: "bg-muted text-muted-foreground",
  deprecated: "bg-destructive/10 text-destructive",
};

export default function WaFormsPage() {
  const [tab, setTab] = useState<"forms" | "responses">("forms");
  const [flows, setFlows] = useState<WaFlow[] | null>(null);
  const [responses, setResponses] = useState<WaFlowResponse[] | null>(null);
  const [editing, setEditing] = useState<WaFlowDetail | null>(null);
  const [viewing, setViewing] = useState<WaFlowResponse | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const flash = (ok: boolean, text: string) => {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    try {
      setFlows(await api.listFlows());
    } catch {
      setFlows([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (tab === "responses") api.listFlowResponses().then(setResponses).catch(() => setResponses([]));
  }, [tab]);

  async function createForm() {
    setBusy("create");
    try {
      const { id } = await api.createFlow({
        name: "Untitled form",
        definition: { screens: [{ title: "Your details", components: [{ type: "heading", text: "Your details" }] }] },
      });
      const detail = await api.getFlow(id);
      setEditing(detail);
      load();
    } catch (e) {
      flash(false, (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function openEditor(id: string) {
    try {
      setEditing(await api.getFlow(id));
    } catch (e) {
      flash(false, (e as Error).message);
    }
  }

  async function publish(id: string) {
    setBusy(id);
    try {
      const r = await api.publishFlow(id);
      flash(true, r.status === "published" ? "Form published to WhatsApp" : "Saved");
      load();
    } catch (e) {
      flash(false, "Publish failed: " + (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function send(f: WaFlow) {
    const to = window.prompt("Send this form to which WhatsApp number? (with country code, no +)");
    if (!to) return;
    setBusy(f.id);
    try {
      await api.sendFlow(f.id, to.replace(/[^0-9]/g, ""));
      flash(true, "Form sent");
    } catch (e) {
      flash(false, "Send failed: " + (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this form?")) return;
    try {
      await api.deleteFlow(id);
      load();
    } catch (e) {
      flash(false, (e as Error).message);
    }
  }

  function exportCsv() {
    const url = (process.env.NEXT_PUBLIC_API_URL || "") + "/api/wa-flows/responses/export";
    fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.blob())
      .then((b) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = "form-responses.csv";
        a.click();
      })
      .catch(() => flash(false, "Export failed"));
  }

  // Reset to page 1 whenever the tab or search changes.
  useEffect(() => { setPage(1); }, [tab, query]);

  const loadingList = tab === "forms" ? flows === null : responses === null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (tab === "forms") {
      const list = flows || [];
      return q ? list.filter((f) => f.name.toLowerCase().includes(q)) : list;
    }
    const list = responses || [];
    return q ? list.filter((r) => (r.flow_name || "").toLowerCase().includes(q) || (r.contact_name || "").toLowerCase().includes(q) || (r.contact_phone || "").includes(q)) : list;
  }, [tab, query, flows, responses]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  const noun = tab === "forms" ? "form" : "response";

  return (
    <div className="px-4 pt-4 pb-4 h-full flex flex-col min-h-0">
      <div className="bg-card rounded-lg border border-border shadow-xs overflow-hidden flex flex-col flex-1 min-h-0">
        {/* Toolbar: tabs + search + actions */}
        <div className="p-3 flex items-center gap-3 border-b border-border shrink-0">
          <div className="flex items-center gap-1 rounded-md bg-muted/60 p-0.5">
            {(["forms", "responses"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn("px-3 h-8 rounded text-[13px] font-semibold capitalize transition-colors",
                  tab === t ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}>
                {t}
              </button>
            ))}
          </div>
          <div className="relative w-[260px] max-w-[40vw]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${noun}s`}
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </div>
          <Tip label="Refresh"><button onClick={() => { load(); if (tab === "responses") api.listFlowResponses().then(setResponses).catch(() => {}); }}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors outline-none">
            <RefreshCw className="w-[18px] h-[18px]" />
          </button></Tip>
          <div className="flex-1" />
          {tab === "responses" && (
            <button onClick={exportCsv} className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-md border border-border text-sm font-medium text-muted-foreground hover:bg-muted outline-none">
              <Download className="w-4 h-4" /> Export
            </button>
          )}
          <button onClick={createForm} disabled={busy === "create"}
            className="inline-flex items-center gap-2 px-3.5 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm transition-all outline-none disabled:opacity-50">
            {busy === "create" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create WhatsApp Form
          </button>
        </div>

        {/* Content */}
        <div className="overflow-auto flex-1 min-h-0">
          {loadingList ? (
            <div className="py-16 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {tab === "forms" ? "No forms yet. Create your first WhatsApp Form." : "No responses yet."}
            </div>
          ) : tab === "forms" ? (
            <FormsTable flows={paged as WaFlow[]} busy={busy} onEdit={openEditor} onPublish={publish} onSend={send} onDelete={remove} />
          ) : (
            <ResponsesTable responses={paged as WaFlowResponse[]} onView={setViewing} />
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center py-3 px-4 border-t border-border shrink-0">
          <span className="text-[13px] font-semibold text-muted-foreground tabular-nums">{filtered.length} {noun}{filtered.length === 1 ? "" : "s"}</span>
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

      {editing && (
        <FlowBuilder flow={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} onFlash={flash} />
      )}
      {viewing && <ResponseViewer r={viewing} onClose={() => setViewing(null)} />}

      {toast && (
        <div className={cn(
          "fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium",
          toast.ok ? "bg-success text-white" : "bg-destructive text-white"
        )}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ── Forms table ─────────────────────────────────────────────
function FormsTable({ flows, busy, onEdit, onPublish, onSend, onDelete }: {
  flows: WaFlow[]; busy: string;
  onEdit: (id: string) => void; onPublish: (id: string) => void;
  onSend: (f: WaFlow) => void; onDelete: (id: string) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border bg-muted/40 text-left">
          <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Name</th>
          <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
          <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Responses</th>
          <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Updated</th>
          <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground text-right">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
          {flows.map((f) => (
            <tr key={f.id} className="hover:bg-muted/30">
              <td className="px-4 py-3 font-medium text-foreground">
                <button onClick={() => onEdit(f.id)} className="hover:text-primary">{f.name}</button>
                {f.publish_error && <p className="text-[11px] text-destructive mt-0.5 max-w-sm truncate">{f.publish_error}</p>}
              </td>
              <td className="px-4 py-3">
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium capitalize", STATUS_BADGE[f.status] || STATUS_BADGE.draft)}>{f.status}</span>
              </td>
              <td className="px-4 py-3 tabular-nums">{f.response_count ?? 0}</td>
              <td className="px-4 py-3 text-muted-foreground">{fmtDate(f.updated_at || "")}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <IconBtn title="Edit" onClick={() => onEdit(f.id)}><Pencil className="w-4 h-4" /></IconBtn>
                  <IconBtn title="Publish" loading={busy === f.id} onClick={() => onPublish(f.id)}><Rocket className="w-4 h-4" /></IconBtn>
                  <IconBtn title="Send test" disabled={f.status !== "published"} onClick={() => onSend(f)}><Send className="w-4 h-4" /></IconBtn>
                  <IconBtn title="Delete" onClick={() => onDelete(f.id)}><Trash2 className="w-4 h-4 text-destructive" /></IconBtn>
                </div>
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

function IconBtn({ children, title, onClick, disabled, loading }: { children: ReactNode; title: string; onClick: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <Tip label={title}>
      <button onClick={onClick} disabled={disabled || loading}
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 outline-none">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
      </button>
    </Tip>
  );
}

// ── Responses table ─────────────────────────────────────────
function ResponsesTable({ responses, onView }: { responses: WaFlowResponse[]; onView: (r: WaFlowResponse) => void }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border bg-muted/40 text-left">
          <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Form</th>
          <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Contact</th>
          <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Phone</th>
          <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Received</th>
          <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground text-right">View</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {responses.map((r) => (
          <tr key={r.id} className="hover:bg-muted/30">
            <td className="px-4 py-3 font-medium text-foreground">{r.flow_name || "—"}</td>
            <td className="px-4 py-3">{r.contact_name || "—"}</td>
            <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.contact_phone}</td>
            <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.received_at)}</td>
            <td className="px-4 py-3 text-right">
              <IconBtn title="View" onClick={() => onView(r)}><Eye className="w-4 h-4" /></IconBtn>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ResponseViewer({ r, onClose }: { r: WaFlowResponse; onClose: () => void }) {
  return (
    <Modal onClose={onClose} title={r.flow_name || "Response"}>
      <div className="p-5 space-y-3 text-sm">
        <p className="text-muted-foreground">{r.contact_name} · {r.contact_phone} · {fmtDate(r.received_at)}</p>
        <div className="divide-y divide-border rounded-lg border border-border">
          {Object.entries(r.response || {}).map(([k, v]) => (
            <div key={k} className="flex gap-3 px-3 py-2">
              <span className="w-40 shrink-0 text-muted-foreground">{k}</span>
              <span className="font-medium text-foreground">{Array.isArray(v) ? v.join(", ") : String(v)}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ── Wizard: full-screen, stepped form builder ───────────────
const WIZARD_STEPS = ["Setup", "Build", "Review & Publish"];
const CATEGORIES = [
  { v: "LEAD_GENERATION", label: "Lead generation" },
  { v: "SIGN_UP", label: "Sign up" },
  { v: "APPOINTMENT_BOOKING", label: "Appointment" },
  { v: "CONTACT_US", label: "Contact us" },
  { v: "SURVEY", label: "Survey" },
  { v: "OTHER", label: "Other" },
];

function FlowBuilder({ flow, onClose, onSaved, onFlash }: {
  flow: WaFlowDetail; onClose: () => void; onSaved: () => void;
  onFlash: (ok: boolean, t: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(flow.name);
  const [category, setCategory] = useState((flow.categories && flow.categories[0]) || "LEAD_GENERATION");
  const [def, setDef] = useState<FlowDefinition>(flow.definition?.screens ? flow.definition : { screens: [] });
  const [sel, setSel] = useState(0);
  const [saving, setSaving] = useState(false);
  const [sheetEnabled, setSheetEnabled] = useState(!!flow.sheet_enabled);
  const [sheetUrl, setSheetUrl] = useState(flow.sheet_id || "");
  const [sheetTab, setSheetTab] = useState(flow.sheet_tab || "Sheet1");
  const [saEmail, setSaEmail] = useState("");
  const [saCopied, setSaCopied] = useState(false);
  useEffect(() => { api.getGoogleSheetsInfo().then((i) => setSaEmail(i.client_email)).catch(() => {}); }, []);
  const screen: FlowScreen | undefined = def.screens[sel];

  const update = (s: FlowScreen[]) => setDef({ screens: s });
  const patchScreen = (i: number, p: Partial<FlowScreen>) => update(def.screens.map((s, x) => (x === i ? { ...s, ...p } : s)));
  const patchComp = (ci: number, p: Partial<FlowComponent>) =>
    patchScreen(sel, { components: screen!.components.map((c, x) => (x === ci ? { ...c, ...p } : c)) });

  function addScreen() {
    update([...def.screens, { title: "New screen", components: [] }]);
    setSel(def.screens.length);
  }
  function addComponent(type: FlowComponentType) {
    const base: FlowComponent = { type };
    if (isInput(type)) { base.label = "Question"; base.name = slug("question_" + (screen!.components.length + 1)); }
    else base.text = "Text";
    if (hasOptions(type)) base.options = ["Option 1", "Option 2"];
    patchScreen(sel, { components: [...screen!.components, base] });
  }

  const inputs = def.screens.flatMap((s) => s.components.filter((c) => isInput(c.type)));
  const canNext = step === 0 ? name.trim().length > 0 : step === 1 ? inputs.length > 0 : true;

  async function persist(publish: boolean) {
    setSaving(true);
    try {
      await api.updateFlow(flow.id, { name, categories: [category], definition: def, sheet_id: sheetUrl, sheet_tab: sheetTab, sheet_enabled: sheetEnabled });
      if (publish) {
        const r = await api.publishFlow(flow.id);
        onFlash(true, r.status === "published" ? "Published to WhatsApp" : "Saved as draft");
      } else {
        onFlash(true, "Saved as draft");
      }
      onSaved();
    } catch (e) {
      onFlash(false, (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header + stepper */}
      <header className="shrink-0 border-b border-border px-6 h-16 flex items-center gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText className="w-5 h-5 text-primary shrink-0" />
          <span className="text-sm text-muted-foreground truncate">{name || "New form"}</span>
        </div>
        <div className="flex-1 flex items-center justify-center gap-2">
          {WIZARD_STEPS.map((label, i) => (
            <button key={label} onClick={() => i < step && setStep(i)} className="flex items-center gap-2">
              <span className={cn("w-6 h-6 rounded-full grid place-items-center text-xs font-bold transition-colors",
                i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-primary/15 text-primary-text" : "bg-muted text-muted-foreground")}>
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </span>
              <span className={cn("text-sm font-medium hidden md:inline", i === step ? "text-foreground" : "text-muted-foreground")}>{label}</span>
              {i < WIZARD_STEPS.length - 1 && <span className="w-8 h-px bg-border mx-1 hidden md:inline-block" />}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted shrink-0"><X className="w-4 h-4" /></button>
      </header>

      {/* Step body */}
      <div className="flex-1 overflow-hidden">
        {step === 0 && (
          <div className="h-full overflow-y-auto">
            <div className="max-w-xl mx-auto py-10 px-6 space-y-7">
              <div>
                <h2 className="text-lg font-bold text-foreground">Set up your form</h2>
                <p className="text-sm text-muted-foreground">Name it and pick what it&apos;s for. You can change this later.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5">Form name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
                  className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary"
                  placeholder="e.g. Test drive booking" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Category</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => (
                    <button key={c.v} onClick={() => setCategory(c.v)}
                      className={cn("px-3.5 py-1.5 rounded-full text-sm border transition-colors",
                        category === c.v ? "border-primary bg-primary/10 text-primary-text font-medium" : "border-border text-muted-foreground hover:bg-muted")}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-[220px_1fr_320px] h-full">
            {/* Screens */}
            <div className="border-r border-border p-3 overflow-y-auto">
              <p className="text-xs font-semibold text-muted-foreground mb-2">SCREENS</p>
              <div className="space-y-1">
                {def.screens.map((s, i) => (
                  <div key={i} className={cn("group flex items-center gap-1.5 px-2 py-2 rounded-md cursor-pointer text-sm",
                    i === sel ? "bg-primary/10 text-primary-text" : "hover:bg-muted")} onClick={() => setSel(i)}>
                    <GripVertical className="w-3.5 h-3.5 opacity-40" />
                    <span className="flex-1 truncate">{s.title || "Screen"}</span>
                    <button onClick={(e) => { e.stopPropagation(); update(def.screens.filter((_, x) => x !== i)); setSel(0); }}
                      className="opacity-0 group-hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
              <button onClick={addScreen} className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-md border border-dashed border-border text-sm text-primary hover:bg-muted">
                <Plus className="w-3.5 h-3.5" /> Add screen
              </button>
            </div>

            {/* Edit content */}
            <div className="p-5 overflow-y-auto">
              {!screen ? (
                <div className="h-full grid place-items-center text-center">
                  <div>
                    <p className="text-sm text-muted-foreground mb-3">No screens yet.</p>
                    <button onClick={addScreen} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
                      <Plus className="w-4 h-4" /> Add your first screen
                    </button>
                  </div>
                </div>
              ) : (
                <div className="max-w-md">
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Screen title</label>
                  <input value={screen.title} onChange={(e) => patchScreen(sel, { title: e.target.value })}
                    className="w-full mb-4 px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary" />
                  <div className="space-y-3">
                    {screen.components.map((c, ci) => (
                      <CompEditor key={ci} c={c} onChange={(p) => patchComp(ci, p)}
                        onRemove={() => patchScreen(sel, { components: screen.components.filter((_, x) => x !== ci) })} />
                    ))}
                  </div>
                  <AddComponent onAdd={addComponent} />
                </div>
              )}
            </div>

            {/* Preview */}
            <div className="border-l border-border bg-muted/30 p-4 overflow-y-auto">
              <p className="text-xs font-semibold text-muted-foreground mb-3 text-center">Live preview</p>
              <Preview screen={screen} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="h-full overflow-y-auto">
            <div className="max-w-2xl mx-auto py-10 px-6">
              <h2 className="text-lg font-bold text-foreground mb-1">Review &amp; publish</h2>
              <p className="text-sm text-muted-foreground mb-6">Publishing pushes this form to WhatsApp so you can send it to contacts.</p>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <Stat label="Screens" value={def.screens.length} />
                <Stat label="Fields collected" value={inputs.length} />
              </div>
              <div className="rounded-lg border border-border divide-y divide-border">
                {def.screens.map((s, i) => (
                  <div key={i} className="px-4 py-3">
                    <p className="text-sm font-semibold text-foreground mb-1">{i + 1}. {s.title || "Screen"}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {s.components.filter((c) => isInput(c.type)).map((c, x) => (
                        <span key={x} className="px-2 py-0.5 rounded-md bg-muted text-xs text-muted-foreground">{c.label || c.name}</span>
                      ))}
                      {s.components.filter((c) => isInput(c.type)).length === 0 && <span className="text-xs text-muted-foreground">No input fields</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Google Sheets delivery */}
              <div className="mt-6 rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-2.5">
                    <Sheet className="w-5 h-5 text-success mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Send responses to Google Sheets</p>
                      <p className="text-xs text-muted-foreground">Append every submission as a new row.</p>
                    </div>
                  </div>
                  <button onClick={() => setSheetEnabled((v) => !v)}
                    className={cn("relative w-10 h-6 rounded-full transition-colors shrink-0", sheetEnabled ? "bg-primary" : "bg-muted-foreground/30")}>
                    <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all", sheetEnabled ? "left-[18px]" : "left-0.5")} />
                  </button>
                </div>
                {/* Service-account email — always visible so the user knows who to share the sheet with. */}
                {saEmail ? (
                  <div className="mt-3 rounded-md border border-border bg-muted/40 p-2.5">
                    <p className="text-[11px] font-semibold text-muted-foreground mb-1">Share your Google Sheet (Editor) with this account:</p>
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 text-[12px] text-foreground break-all select-all">{saEmail}</code>
                      <button onClick={() => { navigator.clipboard?.writeText(saEmail); setSaCopied(true); setTimeout(() => setSaCopied(false), 1500); }}
                        className="shrink-0 px-2 h-6 rounded border border-border text-[11px] font-medium hover:bg-muted outline-none">{saCopied ? "Copied" : "Copy"}</button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-amber-600">Google Sheets isn&apos;t connected yet. An admin needs to add the service-account key on the server.</p>
                )}
                {sheetEnabled && (
                  <div className="mt-3 space-y-2">
                    <input value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="Paste Google Sheet URL"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary" />
                    <input value={sheetTab} onChange={(e) => setSheetTab(e.target.value)} placeholder="Tab name (default: Sheet1)"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="shrink-0 border-t border-border px-6 h-16 flex items-center justify-between">
        <button onClick={step === 0 ? onClose : () => setStep(step - 1)}
          className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted">
          {step === 0 ? "Cancel" : "Back"}
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => persist(false)} disabled={saving}
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save draft"}
          </button>
          {step < WIZARD_STEPS.length - 1 ? (
            <button onClick={() => setStep(step + 1)} disabled={!canNext}
              className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40">
              Next
            </button>
          ) : (
            <button onClick={() => persist(true)} disabled={saving}
              className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2">
              <Rocket className="w-4 h-4" /> Publish to WhatsApp
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-2xl font-extrabold text-foreground tabular-nums">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function CompEditor({ c, onChange, onRemove }: { c: FlowComponent; onChange: (p: Partial<FlowComponent>) => void; onRemove: () => void }) {
  const label = PALETTE.find((p) => p.type === c.type)?.label || c.type;
  return (
    <div className="rounded-lg border border-border p-3 bg-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <button onClick={onRemove}><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
      </div>
      {isInput(c.type) ? (
        <>
          <input value={c.label || ""} onChange={(e) => onChange({ label: e.target.value, name: c.name || slug(e.target.value) })}
            placeholder="Question / label" className="w-full mb-2 px-2.5 py-1.5 rounded-md border border-border bg-background text-sm outline-none focus:border-primary" />
          {hasOptions(c.type) && (
            <div className="mb-2 space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground">Options</p>
              {(c.options || []).map((opt, oi) => (
                <div key={oi} className="group flex items-center gap-1.5">
                  <span className="grid place-items-center w-5 h-7 text-[11px] text-muted-foreground/60 shrink-0">{oi + 1}</span>
                  <input value={opt} onChange={(e) => onChange({ options: (c.options || []).map((o, x) => (x === oi ? e.target.value : o)) })}
                    placeholder={`Option ${oi + 1}`}
                    className="flex-1 h-8 px-2.5 rounded-md border border-border bg-background text-sm outline-none focus:border-primary" />
                  <button onClick={() => onChange({ options: (c.options || []).filter((_, x) => x !== oi) })}
                    className="p-1 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-muted shrink-0" title="Remove option">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button onClick={() => onChange({ options: [...(c.options || []), ""] })}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-dashed border-border text-sm text-primary hover:bg-muted font-medium">
                <Plus className="w-3.5 h-3.5" /> Add option
              </button>
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={!!c.required} onChange={(e) => onChange({ required: e.target.checked })} /> Required
          </label>
        </>
      ) : (
        <textarea value={c.text || ""} onChange={(e) => onChange({ text: e.target.value })}
          placeholder="Text" rows={2} className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-sm outline-none focus:border-primary" />
      )}
    </div>
  );
}

function AddComponent({ onAdd }: { onAdd: (t: FlowComponentType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative mt-3">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-primary hover:bg-muted">
        <Plus className="w-4 h-4" /> Add Content <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-56 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg p-1">
          {PALETTE.map((p) => (
            <button key={p.type} onClick={() => { onAdd(p.type); setOpen(false); }}
              className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-muted">{p.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// WhatsApp-style preview of a screen.
function Preview({ screen }: { screen?: FlowScreen }) {
  if (!screen) return null;
  return (
    <div className="mx-auto w-[240px] rounded-2xl overflow-hidden border border-border bg-white shadow-sm">
      <div className="h-8 bg-[#075E54]" />
      <div className="p-3 space-y-2.5">
        <p className="font-bold text-[#111B21] text-sm">{screen.title}</p>
        {screen.components.map((c, i) => {
          if (c.type === "heading") return <p key={i} className="font-bold text-[#111B21] text-sm">{c.text}</p>;
          if (c.type === "body") return <p key={i} className="text-[#3B4A54] text-xs">{c.text}</p>;
          if (c.type === "caption") return <p key={i} className="text-[#667781] text-[11px]">{c.text}</p>;
          return (
            <div key={i}>
              <p className="text-[11px] text-[#667781] mb-1">{c.label}{c.required ? " *" : ""}</p>
              {c.type === "text_area" ? (
                <div className="h-12 rounded-md border border-[#D1D7DB] bg-white" />
              ) : hasOptions(c.type) ? (
                <div className="flex flex-wrap gap-1">
                  {(c.options || []).filter((o) => o.trim()).slice(0, 4).map((o, x) => (
                    <span key={x} className="px-2 py-0.5 rounded-full border border-[#D1D7DB] text-[10px] text-[#111B21]">{o}</span>
                  ))}
                </div>
              ) : (
                <div className="h-7 rounded-md border border-[#D1D7DB] bg-white" />
              )}
            </div>
          );
        })}
        <div className="mt-2 rounded-md bg-[#008069] text-white text-center text-xs py-1.5 font-medium">Continue</div>
      </div>
    </div>
  );
}

// ── Generic modal ───────────────────────────────────────────
function Modal({ children, title, footer, onClose, wide }: {
  children: ReactNode; title: ReactNode; footer?: ReactNode; onClose: () => void; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className={cn("bg-card rounded-xl shadow-xl border border-border w-full overflow-hidden", wide ? "max-w-5xl" : "max-w-lg")}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="text-base">{title}</div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        {children}
        {footer && <div className="px-5 py-3.5 border-t border-border">{footer}</div>}
      </div>
    </div>
  );
}

