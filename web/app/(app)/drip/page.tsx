"use client";
// Drip campaigns (a.k.a. sequences): a timed series of follow-up messages that
// auto-send after a trigger (no reply / new lead). Lives under Broadcasts.
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Loader2, Repeat, Clock, Pencil, X, Search, RefreshCw, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import type { Sequence, SequenceStep, Campaign } from "@/lib/types";
import { Select } from "@/components/Select";
import { Tip } from "@/components/ui/tooltip";
import SidePanel from "@/components/SidePanel";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";

const TRIGGERS = [
  { value: "no_reply", label: "No reply", hint: "Starts when a lead goes quiet." },
  { value: "new_lead", label: "New lead", hint: "Starts as soon as a lead enters." },
];

// Present delay_minutes as value + unit for a friendly editor.
function splitDelay(mins: number): { val: number; unit: "minutes" | "hours" | "days" } {
  if (mins > 0 && mins % 1440 === 0) return { val: mins / 1440, unit: "days" };
  if (mins > 0 && mins % 60 === 0) return { val: mins / 60, unit: "hours" };
  return { val: mins, unit: "minutes" };
}
const toMins = (val: number, unit: string) => (unit === "days" ? val * 1440 : unit === "hours" ? val * 60 : val);

export default function DripPage() {
  const { can } = usePermissions();
  const canEdit = can("menu_broadcasts");
  const [rows, setRows] = useState<Sequence[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const load = () => { setLoading(true); api.listSequences().then((s) => setRows(s || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); api.listCampaigns().then((c) => setCampaigns(c || [])).catch(() => {}); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2500); return () => clearTimeout(t); }, [toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q) || (r.campaign_name || "").toLowerCase().includes(q)) : rows;
  }, [rows, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  useEffect(() => { setPage(1); }, [query, perPage]);

  const toggleActive = async (s: Sequence) => {
    setRows((r) => r.map((x) => (x.id === s.id ? { ...x, is_active: !x.is_active } : x)));
    try { await api.updateSequence(s.id, { is_active: !s.is_active }); } catch { load(); }
  };
  const remove = async (s: Sequence) => {
    if (!confirm(`Delete drip campaign "${s.name}"? Active enrollments will stop.`)) return;
    try { await api.deleteSequence(s.id); setRows((r) => r.filter((x) => x.id !== s.id)); setToast("Drip campaign deleted"); } catch (e) { setToast(String(e)); }
  };

  return (
    <div className="px-4 pt-4 pb-4 h-full flex flex-col min-h-0">
      <div className="bg-card rounded-lg border border-border shadow-xs overflow-hidden flex flex-col flex-1 min-h-0">
        {/* Toolbar */}
        <div className="p-3 flex items-center gap-3 border-b border-border shrink-0">
          <div className="relative w-[300px] max-w-[45vw]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search drip campaigns"
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </div>
          <Tip label="Refresh"><button onClick={load} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors outline-none">
            <RefreshCw className={cn("w-[18px] h-[18px]", loading && "animate-spin")} />
          </button></Tip>
          <div className="flex-1" />
          {canEdit && (
            <button onClick={() => setEditing("new")}
              className="inline-flex items-center gap-2 px-3.5 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm hover:shadow-brand-md transition-all outline-none">
              <Repeat className="w-4 h-4" /> New drip
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Name", "Trigger", "Campaign", "Steps", "Active leads", "Status", ""].map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{h || <span className="sr-only">Actions</span>}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? Array(6).fill(0).map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-2.5"><div className="h-10 skeleton rounded-md" /></td></tr>
              )) : paged.length === 0 ? (
                <tr><td colSpan={7} className="py-16">
                  {rows.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 text-center">
                      <Repeat className="w-8 h-8 text-muted-foreground/40" />
                      <p className="text-[14px] font-semibold text-foreground">No drip campaigns yet</p>
                      <p className="text-[13px] text-muted-foreground">Create one to auto-nurture leads with timed messages.</p>
                      {canEdit && <button onClick={() => setEditing("new")} className="mt-1 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-primary text-white text-[13px] font-semibold hover:bg-primary-dark"><Plus className="w-4 h-4" /> New drip</button>}
                    </div>
                  ) : <p className="text-center text-sm text-muted-foreground">No drip campaigns match your search.</p>}
                </td></tr>
              ) : paged.map((s) => (
                <tr key={s.id} className="border-b border-border/60 hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">{s.name}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap"><span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold bg-muted text-foreground/70">{TRIGGERS.find((t) => t.value === s.trigger)?.label || s.trigger}</span></td>
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{s.campaign_name || "All campaigns"}</td>
                  <td className="px-4 py-2.5 text-left tabular-nums text-foreground/80">{s.steps}</td>
                  <td className="px-4 py-2.5 text-left tabular-nums text-foreground/80">{s.active_enrollments}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => canEdit && toggleActive(s)} disabled={!canEdit}
                      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors outline-none ${s.is_active ? "bg-primary" : "bg-muted"}`}>
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${s.is_active ? "translate-x-[18px] ml-0.5" : "translate-x-0.5"}`} />
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {canEdit && (
                      <span className="inline-flex items-center gap-1">
                        <button onClick={() => setEditing(s.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Edit"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => remove(s)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center py-3 px-4 border-t border-border shrink-0">
          <span className="text-[13px] font-semibold text-muted-foreground tabular-nums">{filtered.length} drip campaign{filtered.length === 1 ? "" : "s"}</span>
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
        <DripEditor id={editing === "new" ? null : editing} campaigns={campaigns}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); setToast(msg); load(); }} />
      )}

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg bg-foreground text-background text-[13px] font-medium shadow-lg">{toast}</div>}
    </div>
  );
}

function DripEditor({ id, campaigns, onClose, onSaved }: { id: string | null; campaigns: Campaign[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const isEdit = !!id;
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("no_reply");
  const [campaignId, setCampaignId] = useState("");
  const [steps, setSteps] = useState<SequenceStep[]>([{ delay_minutes: 60, body: "" }]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (!id) return;
    api.getSequence(id).then((d) => {
      setName(d.name); setTrigger(d.trigger); setCampaignId(d.campaign_id || "");
      setSteps(d.steps.length ? d.steps : [{ delay_minutes: 60, body: "" }]);
    }).catch((e) => setErr(String(e))).finally(() => setLoading(false));
  }, [id]);

  const campaignOptions = useMemo(() => [{ value: "", label: "All campaigns" }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))], [campaigns]);
  const patchStep = (i: number, patch: Partial<SequenceStep>) => setSteps((s) => s.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const addStep = () => setSteps((s) => [...s, { delay_minutes: s.length ? 1440 : 60, body: "" }]);
  const removeStep = (i: number) => setSteps((s) => (s.length > 1 ? s.filter((_, idx) => idx !== i) : s));

  const save = async () => {
    if (!name.trim()) { setErr("Name is required"); return; }
    const clean = steps.filter((s) => s.body.trim());
    if (clean.length === 0) { setErr("Add at least one message"); return; }
    setSaving(true); setErr("");
    try {
      const payload = { name: name.trim(), trigger, campaign_id: campaignId || "__null__", steps: clean };
      if (isEdit) await api.updateSequence(id!, payload);
      else await api.createSequence({ name: name.trim(), trigger, campaign_id: campaignId || undefined, steps: clean });
      onSaved(isEdit ? "Drip campaign updated" : "Drip campaign created");
    } catch (e) { setErr(String(e)); setSaving(false); }
  };

  return (
    <SidePanel
      open
      onClose={onClose}
      title={isEdit ? "Edit drip campaign" : "New drip campaign"}
      description="Automated message sequence triggered per lead."
      width="lg"
      busy={saving}
      onApply={save}
      applyLabel={isEdit ? "Save changes" : "Create"}
      applyDisabled={loading}
    >
        {loading ? (
          <div className="p-10 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-[12px] font-semibold text-foreground/80">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. XFORCE nurture"
                className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-semibold text-foreground/80">Trigger</label>
                <Select value={trigger} onChange={setTrigger} searchable={false} options={TRIGGERS.map((t) => ({ value: t.value, label: t.label }))} />
                <p className="mt-1 text-[11px] text-muted-foreground">{TRIGGERS.find((t) => t.value === trigger)?.hint}</p>
              </div>
              <div>
                <label className="text-[12px] font-semibold text-foreground/80">Campaign</label>
                <Select value={campaignId} onChange={setCampaignId} searchable options={campaignOptions} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[12px] font-semibold text-foreground/80">Messages</label>
                <button onClick={addStep} className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"><Plus className="w-3.5 h-3.5" /> Add step</button>
              </div>
              <div className="flex flex-col gap-3">
                {steps.map((s, i) => {
                  const d = splitDelay(s.delay_minutes);
                  return (
                    <div key={i} className="rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="grid place-items-center w-5 h-5 rounded bg-primary/10 text-primary text-[11px] font-bold">{i + 1}</span>
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[12px] text-muted-foreground">Wait</span>
                        <input type="number" min={0} value={d.val}
                          onChange={(e) => patchStep(i, { delay_minutes: toMins(Math.max(0, Number(e.target.value) || 0), d.unit) })}
                          className="w-16 h-7 px-2 rounded-md border border-input bg-background text-[13px] tabular-nums outline-none focus:border-primary" />
                        <div className="w-28">
                          <Select value={d.unit} searchable={false} onChange={(u) => patchStep(i, { delay_minutes: toMins(d.val, u) })}
                            options={[{ value: "minutes", label: "minutes" }, { value: "hours", label: "hours" }, { value: "days", label: "days" }]} />
                        </div>
                        <span className="text-[12px] text-muted-foreground">{i === 0 ? "after trigger" : "after previous"}</span>
                        {steps.length > 1 && <button onClick={() => removeStep(i)} className="ml-auto p-1 rounded text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>}
                      </div>
                      <textarea value={s.body} onChange={(e) => patchStep(i, { body: e.target.value })} rows={2} placeholder="Message text. Use {first_name}, {full_name} for personalization."
                        className="w-full px-3 py-2 rounded-md border border-input bg-background text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-y" />
                    </div>
                  );
                })}
              </div>
            </div>

            {err && <p className="text-[12px] text-destructive">{err}</p>}
          </div>
        )}
    </SidePanel>
  );
}
