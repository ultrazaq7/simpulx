"use client";
import { useEffect, useState } from "react";
import { Plus, RefreshCw, Pencil, Trash2, Copy, RotateCw, Plug, Key, Loader2, X, Search } from "lucide-react";
import { api } from "@/lib/api";
import { Select } from "@/components/Select";
import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";
import type { WebApiSource, Department } from "@/lib/types";
import { useToast, PageBody, SettingsCard, FieldLabel, INPUT_CLASS, PrimaryButton, GhostButton } from "../_shared";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function IntegrationsPage() {
  const { notify, ToastHost } = useToast();
  const [rows, setRows] = useState<WebApiSource[]>([]);
  const [depts, setDepts] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState<{ open: boolean; editing: WebApiSource | null }>({ open: false, editing: null });
  const [query, setQuery] = useState("");
  const filtered = rows.filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()) || (p.slug ?? "").toLowerCase().includes(query.toLowerCase()));

  async function load() {
    setLoading(true);
    try {
      const [p, d] = await Promise.all([api.listWebApiSources(), api.listDepartments().catch(() => [])]);
      setRows(p); setDepts(d as Department[]);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function copy(text: string, label = "Copied") { navigator.clipboard.writeText(text); notify(label); }
  async function toggle(p: WebApiSource) {
    try { await api.updateWebApiSource(p.id, { is_active: !p.is_active }); load(); } catch (e) { notify(String(e), "error"); }
  }
  async function regen(p: WebApiSource) {
    if (!confirm(`Regenerate the API key for "${p.name}"? The current key stops working.`)) return;
    try { const r = await api.regenerateWebApiKey(p.id); notify("API key regenerated"); copy(r.api_key, "New key copied"); load(); }
    catch (e) { notify(String(e), "error"); }
  }
  async function remove(p: WebApiSource) {
    if (!confirm(`Delete API source "${p.name}"?`)) return;
    try { await api.deleteWebApiSource(p.id); notify("API source deleted"); load(); }
    catch (e) { notify(String(e), "error"); }
  }

  return (
    <PageBody fill>
      {ToastHost}
      <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col">
      <div className="p-3 flex items-center gap-3 border-b border-border flex-wrap shrink-0">
        <div className="relative w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input type="text" placeholder="Search API sources" value={query} onChange={(e) => setQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-muted text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary" />
        </div>
        <Tip label="Refresh"><button onClick={load} className="p-1.5 rounded-md hover:bg-muted transition-colors outline-none">
          <RefreshCw className="w-[18px] h-[18px] text-muted-foreground" />
        </button></Tip>
        <div className="flex-1" />
        <PrimaryButton onClick={() => setDlg({ open: true, editing: null })}>
          <Plus className="w-4 h-4" />Add API source
        </PrimaryButton>
      </div>

      <div className="overflow-auto flex-1 min-h-0 p-4">
      {/* How it works */}
      <div className="p-5 mb-5 rounded-lg bg-muted/50 border border-border">
        <p className="text-[13.5px] font-bold text-foreground mb-1">Capture leads via API</p>
        <p className="text-[12.5px] text-muted-foreground mb-3">
          Send leads from ad platforms or external systems with the integration&apos;s API key. Each lead opens a conversation in the inbox, attributed to its source.
        </p>
        <div className="relative bg-sidebar text-[#D1FAE5] rounded-lg p-3 font-mono text-[11.5px] overflow-x-auto">
          <button onClick={() => copy(`curl -X POST ${API}/v1/leads -H "X-API-Key: <KEY>" -H "Content-Type: application/json" -d '{"phone":"+62812...","name":"Lead","message":"Interested in a Brio"}'`)}
            className="absolute top-2 right-2 p-1 text-white/60 hover:text-white outline-none transition-opacity"><Copy className="w-[15px] h-[15px]" /></button>
          <pre className="m-0 whitespace-pre-wrap">{`POST ${API}/v1/leads\nX-API-Key: <your integration key>\n{ "phone": "+62812...", "name": "Lead name", "message": "Interested in a Brio" }`}</pre>
        </div>
      </div>

      {/* List */}
      {loading ? (
        [0, 1].map((i) => <div key={i} className="h-24 mb-3 rounded-lg skeleton" />)
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg bg-card">
          <Plug className="w-11 h-11 text-muted-foreground/30 mx-auto mb-2" />
          <p className="font-bold text-foreground mb-1">No API sources yet</p>
          <p className="text-[13px] text-muted-foreground mb-4">Connect an ad platform or external system to capture leads via the Web API.</p>
          <PrimaryButton onClick={() => setDlg({ open: true, editing: null })}>
            <Plus className="w-4 h-4" />Add API source
          </PrimaryButton>
        </div>
      ) : filtered.map((p) => (
        <SettingsCard key={p.id} className={cn("p-5 mb-3", !p.is_active && "opacity-65")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg grid place-items-center bg-[#8B5CF6]/[0.12] text-[#8B5CF6] shrink-0">
              <Plug className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14.5px] font-bold text-foreground">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.slug ? `slug: ${p.slug}` : ""}{p.department ? ` · ${p.department}` : ""} · {p.lead_count} leads</p>
            </div>
            <Tip label={p.is_active ? "Active" : "Disabled"}>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={p.is_active} onChange={() => toggle(p)} className="sr-only peer" />
                <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
              </label>
            </Tip>
            <Tip label="Edit"><button onClick={() => setDlg({ open: true, editing: p })} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors"><Pencil className="w-[18px] h-[18px] text-muted-foreground" /></button></Tip>
            <Tip label="Delete"><button onClick={() => remove(p)} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors"><Trash2 className="w-[18px] h-[18px] text-destructive" /></button></Tip>
          </div>
          <div className="flex items-center gap-2 mt-3 px-2.5 py-1.5 rounded-lg bg-muted/50">
            <Key className="w-[15px] h-[15px] text-muted-foreground shrink-0" />
            <span className="font-mono text-xs text-muted-foreground flex-1 truncate">{p.api_key.slice(0, 10)}{"•".repeat(18)}</span>
            <Tip label="Copy key"><button onClick={() => copy(p.api_key, "API key copied")} className="p-1 outline-none text-muted-foreground hover:text-foreground transition-colors"><Copy className="w-[15px] h-[15px]" /></button></Tip>
            <Tip label="Regenerate key"><button onClick={() => regen(p)} className="p-1 outline-none text-muted-foreground hover:text-foreground transition-colors"><RotateCw className="w-[15px] h-[15px]" /></button></Tip>
          </div>
        </SettingsCard>
      ))}
      </div>
      </div>

      <WebApiDialog state={dlg} depts={depts}
        onClose={() => setDlg({ open: false, editing: null })}
        onSaved={(m) => { setDlg({ open: false, editing: null }); notify(m); load(); }}
        onError={(m) => notify(m, "error")} />
    </PageBody>
  );
}

function WebApiDialog({ state, depts, onClose, onSaved, onError }: {
  state: { open: boolean; editing: WebApiSource | null }; depts: Department[];
  onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const isEdit = !!state.editing;
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [deptId, setDeptId] = useState("");
  const [template, setTemplate] = useState("");
  const [webhook, setWebhook] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const p = state.editing;
    setName(p?.name ?? ""); setSlug(p?.slug ?? ""); setDeptId(p?.auto_assign_dept_id ?? "");
    setTemplate(p?.auto_template_name ?? ""); setWebhook(p?.webhook_url ?? "");
  }, [state.open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!name.trim()) { onError("Name is required"); return; }
    setSaving(true);
    const payload = { name: name.trim(), slug: slug.trim() || undefined, auto_assign_dept_id: deptId || undefined, auto_template_name: template.trim() || undefined, webhook_url: webhook.trim() || undefined };
    try {
      if (isEdit) { await api.updateWebApiSource(state.editing!.id, payload); onSaved("API source updated"); }
      else { await api.createWebApiSource(payload); onSaved("API source created"); }
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  if (!state.open) return null;

  const fields = [
    { label: "Name", value: name, set: setName, placeholder: "e.g. Meta Ads", autoFocus: true },
    { label: "Slug (optional)", value: slug, set: setSlug, placeholder: "auto-generated from name" },
    { label: "Auto template (optional)", value: template, set: setTemplate },
    { label: "Webhook URL (optional)", value: webhook, set: setWebhook, placeholder: "https://..." },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative bg-card rounded-lg border border-border shadow-2xl w-full max-w-sm animate-scale-in">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-[15px] font-bold text-foreground">{isEdit ? "Edit API source" : "New API source"}</h2>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors"><X className="w-[18px] h-[18px]" /></button>
        </div>
        <div className="px-5 py-5 flex flex-col gap-4">
          {fields.map((f) => (
            <div key={f.label}>
              <FieldLabel>{f.label}</FieldLabel>
              <input type="text" value={f.value} onChange={(e) => f.set(e.target.value)} autoFocus={f.autoFocus} placeholder={f.placeholder}
                className={INPUT_CLASS} />
            </div>
          ))}
          <div>
            <FieldLabel>Auto-assign department</FieldLabel>
            <Select value={deptId} onChange={setDeptId} placeholder="None"
              options={[{ value: "", label: "None" }, ...depts.map((d) => ({ value: d.id, label: d.name }))]} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-border">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isEdit ? "Save" : "Create"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
