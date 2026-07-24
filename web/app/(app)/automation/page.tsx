"use client";
import { useI18n } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, RefreshCw, GitBranch, Pencil, Trash2, Zap, Sparkles, Copy } from "lucide-react";
import { api } from "@/lib/api";
import { Select } from "@/components/Select";
import { MultiSelect } from "@/components/ui/multi-select";
import { FilterButton, FilterDrawer, FilterField } from "@/components/FilterDrawer";
import { usePermissions } from "@/lib/permissions";
import { fmtDate, cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";
import { EVENT_GROUPS, EVENT_LIVE, eventLabel } from "@/lib/automationMeta";
import type { Automation, Channel } from "@/lib/types";
import SidePanel from "@/components/SidePanel";
import { useToast, PageBody, FieldLabel, INPUT_CLASS, PrimaryButton } from "../settings/_shared";

export default function AutomationPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { can } = usePermissions();
  const canManage = can("manage_automation");
  const { notify, confirm, ToastHost } = useToast();
  const [rows, setRows] = useState<Automation[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [triggerFilter, setTriggerFilter] = useState<string[]>([]);
  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const activeFilters = triggerFilter.length + channelFilter.length;
  const clearFilters = () => { setTriggerFilter([]); setChannelFilter([]); };
  const [editing, setEditing] = useState<Automation | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function load() {
    setLoading(true);
    try { const [a, c] = await Promise.all([api.listAutomations(), api.listChannels().catch(() => [])]); setRows(a); setChannels(c as Channel[]); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((r) =>
    (!query || r.name.toLowerCase().includes(query.toLowerCase())) &&
    (!triggerFilter.length || triggerFilter.includes(r.trigger_type)) &&
    // Channel-less automations apply to every channel, so they always pass.
    (!channelFilter.length || !r.channel_id || channelFilter.includes(r.channel_id))
  ), [rows, query, triggerFilter, channelFilter]);

  async function toggle(r: Automation) {
    try { await api.updateAutomation(r.id, { is_active: !r.is_active }); load(); }
    catch (e) { notify(String(e), "error"); }
  }
  async function clone(r: Automation) {
    try { await api.cloneAutomation(r.id); notify(`Cloned "${r.name}"`); load(); }
    catch (e) { notify(String(e), "error"); }
  }
  async function remove(r: Automation) {
    if (!(await confirm({ title: "Delete automation?", message: `Delete "${r.name}"? This can't be undone.`, danger: true, confirmLabel: "Delete" }))) return;
    try { await api.deleteAutomation(r.id); notify(t("settings.automationDeleted")); load(); }
    catch (e) { notify(String(e), "error"); }
  }

  return (
    <PageBody fill>
      {ToastHost}
      <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col">
      {/* Toolbar */}
      <div className="p-3 flex items-center gap-3 border-b border-border flex-wrap shrink-0">
        <div className="relative w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input type="text" placeholder={t("settings.searchAutomations")} value={query} onChange={(e) => setQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-muted text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary" />
        </div>
        <FilterButton count={activeFilters} onClick={() => setFilterOpen(true)} />
        {activeFilters > 0 && <button onClick={clearFilters} className="text-[11px] font-semibold text-primary hover:underline outline-none">{t("common.clear")}</button>}
        <FilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)} onClear={clearFilters} canClear={activeFilters > 0}>
          <FilterField label={t("settings.events")}><MultiSelect value={triggerFilter} onChange={setTriggerFilter} placeholder={t("settings.allEvents")} className="w-full" options={EVENT_GROUPS.flatMap((g) => g.events).map((e) => ({ value: e.value, label: e.label }))} /></FilterField>
          <FilterField label={t("settings.channels")}><MultiSelect value={channelFilter} onChange={setChannelFilter} placeholder={t("common.allChannels")} className="w-full" options={channels.map((c) => ({ value: c.id, label: c.name }))} /></FilterField>
        </FilterDrawer>
        <Tip label={t("broadcasts.refresh")}><button onClick={load} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors"><RefreshCw className="w-[18px] h-[18px] text-muted-foreground" /></button></Tip>
        <div className="flex-1" />
        {canManage && (
          <PrimaryButton onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4" />{t("settings.newAutomation")}
          </PrimaryButton>
        )}
      </div>

      <div className="overflow-auto flex-1 min-h-0 p-4">
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
          <p className="font-bold text-lg text-foreground">{query || triggerFilter.length || channelFilter.length ? t("settings.noMatchingAutomations") : t("settings.noAutomationsYet")}</p>
          <p className="text-[13.5px] text-muted-foreground mt-1 mb-5">{t("settings.createYourFirstAutomationTo")}</p>
          {canManage && (
            <PrimaryButton onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4" />{t("settings.newAutomation")}
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
                    <Tip label={r.is_active ? t("dashboard.active") : t("automation.paused")}>
                      <label className="relative inline-flex items-center cursor-pointer mr-1">
                        <input type="checkbox" checked={r.is_active} onChange={() => toggle(r)} className="sr-only peer" />
                        <div className="w-8 h-[18px] bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-[14px] after:w-[14px] after:transition-all peer-checked:after:translate-x-[14px]" />
                      </label>
                    </Tip>
                    <Tip label={t("common.edit")}><button onClick={() => { setEditing(r); setDialogOpen(true); }} className="p-1 rounded-md hover:bg-muted outline-none transition-colors"><Pencil className="w-[18px] h-[18px] text-muted-foreground" /></button></Tip>
                    <Tip label="Clone"><button onClick={() => clone(r)} className="p-1 rounded-md hover:bg-muted outline-none transition-colors"><Copy className="w-[18px] h-[18px] text-muted-foreground" /></button></Tip>
                    <Tip label={t("common.delete")}><button onClick={() => remove(r)} className="p-1 rounded-md hover:bg-muted outline-none transition-colors"><Trash2 className="w-[18px] h-[18px] text-destructive" /></button></Tip>
                  </div>
                )}
              </div>
              <p className="font-bold text-[15.5px] mt-3 leading-tight truncate text-foreground">{r.name}</p>
              {r.description && <p className="text-[12.5px] text-muted-foreground mt-0.5 truncate">{r.description}</p>}
              <div className="inline-flex items-center gap-1 mt-3 px-2 py-1 rounded-lg bg-muted/50 self-start">
                <Zap className="w-3.5 h-3.5 text-amber" />
                <span className="text-xs font-semibold text-foreground">{t(eventLabel(r.trigger_type))}</span>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-2 mt-4">
                <span className="text-[11.5px] text-muted-foreground">{(r.actions?.length ?? 0)} action{(r.actions?.length ?? 0) === 1 ? "" : "s"} · {r.run_count} runs</span>
                <div className="flex-1" />
                <span className="text-[11.5px] text-primary font-semibold inline-flex items-center gap-0.5">{t("settings.openFlow")} <GitBranch className="w-3.5 h-3.5" /></span>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
      </div>

      <EditDialog open={dialogOpen} editing={editing} channels={channels}
        onClose={() => setDialogOpen(false)}
        onSaved={(msg) => { setDialogOpen(false); notify(msg); load(); }}
        onCreated={(id) => { setDialogOpen(false); router.push(`/automation/${id}/flow`); }}
        onError={(msg) => notify(msg, "error")} />
    </PageBody>
  );
}

function EditDialog({ open, editing, channels, onClose, onSaved, onCreated, onError }: {
  open: boolean; editing: Automation | null; channels: Channel[];
  onClose: () => void; onSaved: (msg: string) => void; onCreated: (id: string) => void; onError: (msg: string) => void;
}) {
  const { t } = useI18n();
  const isEdit = !!editing;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState("new_message");
  const [channelId, setChannelId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const r = editing;
    setName(r?.name ?? ""); setDescription(r?.description ?? "");
    setEventType(r?.trigger_type ?? "new_message"); setChannelId(r?.channel_id ?? "");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!name.trim()) { onError(t("settings.automationNameIsRequired")); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await api.updateAutomation(editing!.id, { name: name.trim(), description, trigger_type: eventType, channel_id: channelId });
        onSaved(t("settings.automationUpdated"));
      } else {
        // Actions + condition refinements are built in the flow after create.
        const { id } = await api.createAutomation({ name: name.trim(), description, trigger_type: eventType, channel_id: channelId || undefined, actions: [] });
        onCreated(id);
      }
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <SidePanel open={open} onClose={onClose} title={isEdit ? t("settings.editAutomation") : t("settings.newAutomation")}
      description={isEdit ? undefined : t("settings.pickTheEventThatStarts")}
      onApply={save} applyLabel={isEdit ? "Save" : "Create"} applyDisabled={!name.trim()} busy={saving}>
      <div className="flex flex-col gap-4">
        <Lbl label={t("inbox.name")}><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("settings.eGWelcomeNewChats")} autoFocus className={INPUT_CLASS} /></Lbl>
        <Lbl label={t("settings.descriptionOptional")}><input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("settings.optional")} className={INPUT_CLASS} /></Lbl>
        <Lbl label={t("components.channel")}>
          <Select value={channelId} onChange={setChannelId} placeholder={t("common.allChannels")}
            options={[{ value: "", label: "All channels" }, ...channels.map((c) => ({ value: c.id, label: c.name }))]} />
        </Lbl>
        <div>
          <FieldLabel>{t("settings.event")}</FieldLabel>
          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            {EVENT_GROUPS.map((g) => (
              <div key={g.group}>
                <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/40">{t(g.group)}</p>
                {g.events.map((ev) => {
                  const sel = eventType === ev.value;
                  return (
                    <button key={ev.value} type="button" onClick={() => setEventType(ev.value)}
                      className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] outline-none transition-colors", sel ? "bg-primary/10 text-primary font-semibold" : "text-foreground hover:bg-muted/60")}>
                      <span className={cn("w-3.5 h-3.5 rounded-full border shrink-0 grid place-items-center", sel ? "border-primary" : "border-muted-foreground/40")}>{sel && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}</span>
                      <span className="flex-1">{t(ev.label)}</span>
                      {!ev.live && <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">soon</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {!EVENT_LIVE[eventType] && <p className="mt-1.5 text-[12px] text-amber-600">{t("settings.selectableButTheEngineDoes")}</p>}
        </div>
      </div>
    </SidePanel>
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
