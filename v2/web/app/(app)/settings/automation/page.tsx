"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, RefreshCw, GitBranch, Pencil, Trash2, Zap, Sparkles, Loader2, X } from "lucide-react";
import { api } from "@/lib/api";
import { Select } from "@/components/Select";
import { usePermissions } from "@/lib/permissions";
import { fmtDate, cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";
import { TRIGGERS, ACTIONS, TRIGGER_KEYS, triggerLabel } from "@/lib/automationMeta";
import type { Automation, Channel } from "@/lib/types";
import { useToast, PageBody, FieldLabel, INPUT_CLASS, PrimaryButton, GhostButton } from "../_shared";

export default function AutomationPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const canManage = can("manage_automation");
  const { notify, ToastHost } = useToast();
  const [rows, setRows] = useState<Automation[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [triggerFilter, setTriggerFilter] = useState("");
  const [editing, setEditing] = useState<Automation | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function load() {
    setLoading(true);
    try { const [a, c] = await Promise.all([api.listAutomations(), api.listChannels().catch(() => [])]); setRows(a); setChannels(c as Channel[]); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((r) =>
    (!query || r.name.toLowerCase().includes(query.toLowerCase())) &&
    (!triggerFilter || r.trigger_type === triggerFilter)
  ), [rows, query, triggerFilter]);

  async function toggle(r: Automation) {
    try { await api.updateAutomation(r.id, { is_active: !r.is_active }); load(); }
    catch (e) { notify(String(e), "error"); }
  }
  async function remove(r: Automation) {
    if (!confirm(`Delete automation "${r.name}"?`)) return;
    try { await api.deleteAutomation(r.id); notify("Automation deleted"); load(); }
    catch (e) { notify(String(e), "error"); }
  }

  return (
    <PageBody>
      {ToastHost}
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input type="text" placeholder="Search automations" value={query} onChange={(e) => setQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-card text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary" />
        </div>
        <Select value={triggerFilter} onChange={setTriggerFilter} placeholder="All triggers" className="min-w-[180px]"
          options={[{ value: "", label: "All triggers" }, ...TRIGGER_KEYS.map((k) => ({ value: k, label: TRIGGERS[k].label }))]} />
        <Tip label="Refresh"><button onClick={load} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors"><RefreshCw className="w-[18px] h-[18px] text-muted-foreground" /></button></Tip>
        <div className="flex-1" />
        {canManage && (
          <PrimaryButton onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4" />New automation
          </PrimaryButton>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-[184px] rounded-lg skeleton" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-[88px] h-[88px] rounded-full bg-primary/10 grid place-items-center mx-auto mb-5">
            <Sparkles className="w-11 h-11 text-primary" />
          </div>
          <p className="font-bold text-lg text-foreground">{query || triggerFilter ? "No matching automations" : "No automations yet"}</p>
          <p className="text-[13.5px] text-muted-foreground mt-1 mb-5">Create your first automation to route messages and reply automatically.</p>
          {canManage && (
            <PrimaryButton onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4" />New automation
            </PrimaryButton>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-4">
          {filtered.map((r) => (
            <div key={r.id} onClick={() => router.push(`/automation/${r.id}/flow`)}
              className={cn(
                "p-5 rounded-lg bg-card border border-border cursor-pointer flex flex-col min-h-[184px] transition-all hover:shadow-md hover:border-primary/20",
                !r.is_active && "opacity-[0.68]",
              )}>
              <div className="flex items-start">
                <div className={cn("w-10 h-10 rounded-lg grid place-items-center", r.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  <GitBranch className="w-5 h-5" />
                </div>
                <div className="flex-1" />
                {canManage && (
                  <div onClick={(e) => e.stopPropagation()} className="flex items-center">
                    <Tip label={r.is_active ? "Active" : "Paused"}>
                      <label className="relative inline-flex items-center cursor-pointer mr-1">
                        <input type="checkbox" checked={r.is_active} onChange={() => toggle(r)} className="sr-only peer" />
                        <div className="w-8 h-[18px] bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-[14px] after:w-[14px] after:transition-all peer-checked:after:translate-x-[14px]" />
                      </label>
                    </Tip>
                    <Tip label="Edit"><button onClick={() => { setEditing(r); setDialogOpen(true); }} className="p-1 rounded-md hover:bg-muted outline-none transition-colors"><Pencil className="w-[18px] h-[18px] text-muted-foreground" /></button></Tip>
                    <Tip label="Delete"><button onClick={() => remove(r)} className="p-1 rounded-md hover:bg-muted outline-none transition-colors"><Trash2 className="w-[18px] h-[18px] text-destructive" /></button></Tip>
                  </div>
                )}
              </div>
              <p className="font-bold text-[15.5px] mt-3 leading-tight truncate text-foreground">{r.name}</p>
              {r.description && <p className="text-[12.5px] text-muted-foreground mt-0.5 truncate">{r.description}</p>}
              <div className="inline-flex items-center gap-1 mt-3 px-2 py-1 rounded-lg bg-muted/50 self-start">
                <Zap className="w-3.5 h-3.5 text-amber" />
                <span className="text-xs font-semibold text-foreground">{triggerLabel(r.trigger_type)}</span>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-2 mt-4">
                <span className="text-[11.5px] text-muted-foreground">{(r.actions?.length ?? 0)} action{(r.actions?.length ?? 0) === 1 ? "" : "s"} · {r.run_count} runs</span>
                <div className="flex-1" />
                <span className="text-[11.5px] text-primary font-semibold inline-flex items-center gap-0.5">Open flow <GitBranch className="w-3.5 h-3.5" /></span>
              </div>
            </div>
          ))}
        </div>
      )}

      <EditDialog open={dialogOpen} editing={editing} channels={channels}
        onClose={() => setDialogOpen(false)}
        onSaved={(msg) => { setDialogOpen(false); notify(msg); load(); }}
        onError={(msg) => notify(msg, "error")} />
    </PageBody>
  );
}

function EditDialog({ open, editing, channels, onClose, onSaved, onError }: {
  open: boolean; editing: Automation | null; channels: Channel[];
  onClose: () => void; onSaved: (msg: string) => void; onError: (msg: string) => void;
}) {
  const isEdit = !!editing;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("new_message");
  const [channelId, setChannelId] = useState("");
  const [keywords, setKeywords] = useState("");
  const [idleMinutes, setIdleMinutes] = useState("30");
  const [callback, setCallback] = useState("");
  const [action, setAction] = useState("send_message");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const r = editing;
    setName(r?.name ?? ""); setDescription(r?.description ?? "");
    setTrigger(r?.trigger_type ?? "new_message"); setChannelId(r?.channel_id ?? "");
    const tc = (r?.trigger_config ?? {}) as Record<string, unknown>;
    setKeywords(Array.isArray(tc.keywords) ? (tc.keywords as string[]).join(", ") : "");
    setIdleMinutes(tc.idle_minutes ? String(tc.idle_minutes) : "30");
    setCallback(typeof tc.callback === "string" ? tc.callback : "");
    const first = r?.actions?.[0];
    setAction(first?.type ?? "send_message");
    setMessage(String(first?.params?.message ?? first?.params?.template_name ?? ""));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const needsKeywords = trigger === "keyword_match";
  const needsIdle = trigger === "conversation_idle";
  const needsCallback = trigger === "button_click";
  const needsMessage = action === "send_message" || action === "send_template" || action === "webhook_notify";

  async function save() {
    if (!name.trim()) { onError("Automation name is required"); return; }
    setSaving(true);
    const triggerConfig: Record<string, unknown> = {};
    if (needsKeywords) triggerConfig.keywords = keywords.split(",").map((k) => k.trim()).filter(Boolean);
    if (needsIdle) triggerConfig.idle_minutes = Number(idleMinutes) || 30;
    if (needsCallback && callback.trim()) triggerConfig.callback = callback.trim();
    const params: Record<string, unknown> = {};
    if (action === "send_message") params.message = message;
    if (action === "send_template") params.template_name = message;
    if (action === "webhook_notify") params.url = message;
    const actions = [{ type: action, params }];
    try {
      if (isEdit) {
        await api.updateAutomation(editing!.id, { name: name.trim(), description, trigger_type: trigger, trigger_config: triggerConfig, channel_id: channelId, actions });
        onSaved("Automation updated");
      } else {
        await api.createAutomation({ name: name.trim(), description, trigger_type: trigger, trigger_config: triggerConfig, channel_id: channelId || undefined, actions });
        onSaved("Automation created");
      }
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative bg-card rounded-lg border border-border shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-scale-in">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <h2 className="text-[15px] font-bold text-foreground">{isEdit ? "Edit automation" : "New automation"}</h2>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors"><X className="w-[18px] h-[18px]" /></button>
        </div>
        <div className="px-5 py-5 flex flex-col gap-4 overflow-y-auto flex-1 min-h-0">
          <Lbl label="Name"><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Welcome new chats" autoFocus className={INPUT_CLASS} /></Lbl>
          <Lbl label="Description"><input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" className={INPUT_CLASS} /></Lbl>
          <div className="flex gap-4">
            <Lbl label="Trigger" className="flex-1">
              <Select value={trigger} onChange={setTrigger} options={TRIGGER_KEYS.map((k) => ({ value: k, label: TRIGGERS[k].label }))} />
            </Lbl>
            <Lbl label="Channel" className="flex-1">
              <Select value={channelId} onChange={setChannelId} placeholder="All channels"
                options={[{ value: "", label: "All channels" }, ...channels.map((c) => ({ value: c.id, label: c.name }))]} />
            </Lbl>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">{TRIGGERS[trigger]?.desc}</p>
          {needsKeywords && <Lbl label="Keywords (comma separated)"><input type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="price, harga, quote" className={INPUT_CLASS} /></Lbl>}
          {needsIdle && <Lbl label="Idle minutes"><input type="number" value={idleMinutes} onChange={(e) => setIdleMinutes(e.target.value)} className={INPUT_CLASS} /></Lbl>}
          {needsCallback && <Lbl label="Callback id contains (optional)"><input type="text" value={callback} onChange={(e) => setCallback(e.target.value)} placeholder="e.g. daftar (blank = any button)" className={INPUT_CLASS} /></Lbl>}
          <div className="border-t border-border pt-3"><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">THEN</p></div>
          <Lbl label="Action">
            <Select value={action} onChange={setAction} options={Object.entries(ACTIONS).map(([k, v]) => ({ value: k, label: (v as { label: string }).label }))} />
          </Lbl>
          {needsMessage && (
            <Lbl label={action === "send_template" ? "Template name" : action === "webhook_notify" ? "Webhook URL" : "Message"}>
              {action === "send_message" ? (
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Type the auto reply..."
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm text-foreground outline-none resize-none transition-shadow focus:border-primary" />
              ) : (
                <input type="text" value={message} onChange={(e) => setMessage(e.target.value)}
                  placeholder={action === "send_template" ? "welcome_v1" : "https://..."}
                  className={INPUT_CLASS} />
              )}
            </Lbl>
          )}
          <p className="text-xs text-muted-foreground">Add more steps and branching in the visual flow builder after saving.</p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-border shrink-0">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{isEdit ? "Save" : "Create"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function Lbl({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}
