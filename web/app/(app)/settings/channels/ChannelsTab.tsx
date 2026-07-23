"use client";
import { useI18n } from "@/lib/i18n";
// Channels tab — the enterprise card list of connected messaging accounts plus
// the Create Channel wizard. Platform selection lives inside the wizard (Step 1),
// so this view is a clean, searchable, filterable list of real connections.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus, RefreshCw, Pencil, Trash2, CheckCircle, Loader2, X, Search, MoreVertical, FileText, Power,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import ChannelIcon, { CHANNEL_CATALOG, channelMeta } from "@/components/ChannelIcon";
import { api } from "@/lib/api";
import { cn, fmtDateTimeShort } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";
import type { Channel } from "@/lib/types";
import { useToast, FieldLabel, INPUT_CLASS, PrimaryButton, GhostButton } from "../_shared";
import { usePermissions } from "@/lib/permissions";
import { ChannelWizard } from "./ChannelWizard";

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  connected:    { label: "Connected",     color: "text-success",          bg: "bg-success" },
  pending:      { label: "Pending setup", color: "text-warning",          bg: "bg-warning" },
  disconnected: { label: "Disconnected",  color: "text-muted-foreground", bg: "bg-muted-foreground/40" },
  error:        { label: "Error",         color: "text-destructive",      bg: "bg-destructive" },
};

function isSandbox(c: Channel) { return c.type === "whatsapp" && Boolean((c.config as Record<string, any>)?.is_sandbox); }

function StatusDot({ status }: { status: string }) {
  const { t } = useI18n();
  const s = STATUS[status] ?? STATUS.disconnected;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("w-[7px] h-[7px] rounded-full", s.bg)} />
      <span className={cn("text-xs font-semibold", s.color)}>{t(s.label)}</span>
    </span>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange}
      className={cn("relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 outline-none", checked ? "bg-primary" : "bg-muted")}>
      <span className={cn("pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 mt-0.5", checked ? "translate-x-[18px] ml-0.5" : "translate-x-0.5")} />
    </button>
  );
}

export function ChannelsTab() {
  const { t } = useI18n();
  const { notify, confirm, ToastHost } = useToast();
  // Every channel mutation is gated server-side on manage_channels, so without it
  // the API answers 403. Hiding the controls is what makes that legible: before,
  // the buttons rendered for everyone and a manager could open the wizard, fill
  // it in and only discover on save that they were never allowed.
  const { can } = usePermissions();
  const canManage = can("manage_channels");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [page, setPage] = useState(1);
  const perPage = 12;

  async function load() {
    setLoading(true);
    try { setChannels(await api.listChannels()); }
    catch { /* unauthenticated handled in api */ }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(1); }, [query, filter]);

  async function test(c: Channel) {
    try {
      const r = await api.testChannel(c.id);
      // Warning = connected locally but a Meta step failed (e.g. webhook
      // subscribe); hiding it would leave an inbox that silently receives nothing.
      if (r.warning) notify(`${t("settings.connectionVerified")} — ${r.warning}`, "error");
      else notify(t("settings.connectionVerified"));
      load();
    }
    catch (e) { notify(String(e), "error"); }
  }
  async function toggleActive(c: Channel) {
    try { await api.updateChannel(c.id, { is_active: !c.is_active }); load(); }
    catch (e) { notify(String(e), "error"); }
  }
  async function remove(c: Channel) {
    if (!(await confirm({ title: "Delete channel?", message: `Delete "${c.name}"? This cannot be undone.`, danger: true, confirmLabel: "Delete" }))) return;
    try { await api.deleteChannel(c.id); notify(t("settings.channelDeleted")); load(); }
    catch (e) { notify(String(e), "error"); }
  }

  // Filter chips: platforms that have at least one channel, plus Testing.
  const platforms = useMemo(() => {
    const present = new Set<string>();
    channels.forEach((c) => present.add(isSandbox(c) ? "testing" : c.type));
    return CHANNEL_CATALOG.filter((m) => present.has(m.type));
  }, [channels]);

  const q = query.trim().toLowerCase();
  const visible = channels.filter((c) => {
    const key = isSandbox(c) ? "testing" : c.type;
    if (filter !== "all" && key !== filter) return false;
    if (q && !c.name.toLowerCase().includes(q) && !(c.display_id ?? "").toLowerCase().includes(q) && !(c.phone_number_id ?? "").toLowerCase().includes(q)) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(visible.length / perPage));
  const paged = visible.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="px-6 py-6 w-full h-full flex flex-col min-h-0">
      {ToastHost}
      <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col">
        {/* Toolbar */}
        <div className="p-3 flex items-center gap-3 border-b border-border flex-wrap shrink-0">
          <div className="relative w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input type="text" placeholder={t("settings.searchChannels")} value={query} onChange={(e) => setQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-muted text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary" />
          </div>
          <Tip label={t("broadcasts.refresh")}><button onClick={load} className="p-1.5 rounded-md hover:bg-muted transition-colors outline-none">
            <RefreshCw className="w-[18px] h-[18px] text-muted-foreground" />
          </button></Tip>
          <div className="flex-1" />
          {canManage && (
            <PrimaryButton onClick={() => setWizardOpen(true)}>
              <Plus className="w-4 h-4" />{t("settings.createChannel")}
            </PrimaryButton>
          )}
        </div>

        {/* Platform filter chips */}
        {platforms.length > 0 && (
          <div className="px-3 py-2 flex items-center gap-2 flex-wrap border-b border-border/70 bg-muted/30 shrink-0">
            <Chip label={t("broadcasts.all")} active={filter === "all"} onClick={() => setFilter("all")} />
            {platforms.map((m) => (
              <Chip key={m.type} label={m.type === "testing" ? t("settings.testing") : m.name} active={filter === m.type} onClick={() => setFilter(m.type)} />
            ))}
          </div>
        )}

        {/* List (rows) */}
        <div className="overflow-auto flex-1 min-h-0">
          {loading ? (
            <div className="p-4 space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg skeleton" />)}</div>
          ) : visible.length === 0 ? (
            <div className="text-center py-16">
              <div className="inline-flex mb-3 opacity-80"><ChannelIcon type="whatsapp" size={56} radius={16} /></div>
              <p className="font-bold text-foreground mb-1">{channels.length === 0 ? t("settings.noChannelsConnectedYet") : t("settings.noChannelsMatchYourFilters")}</p>
              <p className="text-[13px] text-muted-foreground mb-4">{channels.length === 0 ? t("settings.connectWhatsappMessengerInstagramViber") : t("settings.tryADifferentSearchOr")}</p>
              {channels.length === 0 && canManage && <PrimaryButton onClick={() => setWizardOpen(true)}><Plus className="w-4 h-4" />{t("settings.createChannel")}</PrimaryButton>}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {paged.map((c) => (
                <ChannelRow key={c.id} c={c} canManage={canManage} onTest={test} onToggle={toggleActive} onEdit={setEditing} onDelete={remove} />
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {visible.length > perPage && (
          <div className="flex items-center py-2.5 px-4 border-t border-border shrink-0">
            <span className="text-[13px] font-semibold text-muted-foreground tabular-nums">{visible.length} channel{visible.length === 1 ? "" : "s"}</span>
            <div className="flex-1 flex justify-center items-center gap-1">
              <button disabled={page <= 1} onClick={() => setPage(1)} className="p-1 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30 outline-none"><ChevronsLeft className="w-[18px] h-[18px]" /></button>
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-1 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30 outline-none"><ChevronLeft className="w-[18px] h-[18px]" /></button>
              <span className="px-3 py-1 rounded-md border border-primary/40 text-primary text-[13px] font-bold min-w-[32px] text-center tabular-nums">{page}</span>
              <span className="text-[13px] text-muted-foreground tabular-nums">/ {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="p-1 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30 outline-none"><ChevronRight className="w-[18px] h-[18px]" /></button>
              <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="p-1 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30 outline-none"><ChevronsRight className="w-[18px] h-[18px]" /></button>
            </div>
          </div>
        )}
      </div>

      {wizardOpen && (
        <ChannelWizard
          onClose={() => { setWizardOpen(false); load(); }}
          onDone={(msg) => { setWizardOpen(false); notify(msg); load(); }}
          onError={(msg) => notify(msg, "error")}
        />
      )}
      {editing && (
        <EditChannelDialog channel={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); notify(msg); load(); }}
          onError={(msg) => notify(msg, "error")} />
      )}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={cn("px-3 h-8 rounded-full text-[12.5px] font-semibold transition-colors outline-none border",
        active ? "bg-primary text-white border-primary" : "bg-card text-muted-foreground border-border hover:bg-muted/60 hover:text-foreground")}>
      {label}
    </button>
  );
}

// ── Enterprise channel row ─────────────────────────────────────────────────
function ChannelRow({ c, canManage, onTest, onToggle, onEdit, onDelete }: {
  c: Channel; canManage: boolean; onTest: (c: Channel) => void; onToggle: (c: Channel) => void; onEdit: (c: Channel) => void; onDelete: (c: Channel) => void;
}) {
  const { t } = useI18n();
  const sandbox = isSandbox(c);
  const iconType = sandbox ? "testing" : c.type;
  const typeLabel = sandbox ? "Testing channel" : channelMeta(c.type).name;
  const ref = c.display_id || c.phone_number_id;
  const [menu, setMenu] = useState(false);

  return (
    <div className={cn("flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors", !c.is_active && "opacity-60")}>
      <ChannelIcon type={iconType} size={38} />
      <div className="min-w-0 w-[190px] shrink-0">
        <p className="text-[13.5px] font-bold text-foreground truncate">{c.name}</p>
        <p className="text-[11.5px] text-muted-foreground truncate">{typeLabel}</p>
      </div>
      <div className="min-w-0 flex-1 hidden md:flex items-center gap-2">
        {ref ? (
          <span className="inline-flex items-center px-2.5 h-7 rounded-full border border-success/40 bg-success/[0.07] text-[12px] font-semibold text-success truncate max-w-full">{ref}</span>
        ) : (
          <span className="inline-flex items-center px-2.5 h-7 rounded-full border border-border bg-muted/50 text-[12px] font-medium text-muted-foreground">{t("settings.notConfigured")}</span>
        )}
        {c.connected_at && <span className="text-[11.5px] text-muted-foreground shrink-0">{t("contacts.created")} {fmtDateTimeShort(c.connected_at)}</span>}
      </div>
      <div className="w-[120px] shrink-0 hidden sm:block"><StatusDot status={c.status} /></div>
      {canManage && (
        <>
          <Tip label={c.is_active ? t("dashboard.active") : t("settings.disabled")}><span className="shrink-0"><Toggle checked={c.is_active} onChange={() => onToggle(c)} /></span></Tip>
          <button onClick={() => onTest(c)} className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border border-border text-[12.5px] font-semibold text-foreground hover:bg-muted transition-colors outline-none shrink-0">
            <CheckCircle className="w-3.5 h-3.5" />{t("settings.test")}
          </button>
        </>
      )}
      <div className="relative shrink-0">
        <button onClick={() => setMenu((m) => !m)} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors">
          <MoreVertical className="w-[18px] h-[18px] text-muted-foreground" />
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
            <div className="absolute right-0 top-9 z-20 w-40 rounded-lg border border-border bg-card shadow-xl py-1 animate-scale-in">
              {canManage && <MenuItem icon={Pencil} label={t("common.edit")} onClick={() => { setMenu(false); onEdit(c); }} />}
              <LinkMenuItem icon={FileText} label={t("settings.templates")} href="/settings/templates" onClick={() => setMenu(false)} />
              {canManage && (
                <>
                  <MenuItem icon={Power} label={c.is_active ? t("settings.disable") : t("settings.enable")} onClick={() => { setMenu(false); onToggle(c); }} />
                  <div className="my-1 border-t border-border/60" />
                  <MenuItem icon={Trash2} label={t("common.delete")} danger onClick={() => { setMenu(false); onDelete(c); }} />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LinkMenuItem({ icon: Icon, label, href, onClick }: { icon: any; label: string; href: string; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-left hover:bg-muted transition-colors outline-none text-foreground">
      <Icon className="w-4 h-4" />{label}
    </Link>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-left hover:bg-muted transition-colors outline-none",
        danger ? "text-destructive" : "text-foreground")}>
      <Icon className="w-4 h-4" />{label}
    </button>
  );
}

// ── Edit dialog (name / display / token / WA calling) ──────────────────────
function EditChannelDialog({ channel, onClose, onSaved, onError }: {
  channel: Channel; onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const { t } = useI18n();
  const isWa = channel.type === "whatsapp";
  const [name, setName] = useState(channel.name ?? "");
  const [displayId, setDisplayId] = useState(channel.display_id ?? "");
  const [token, setToken] = useState("");
  const [calling, setCalling] = useState(channel.calling_enabled ?? false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { onError(t("settings.channelNameIsRequired")); return; }
    setSaving(true);
    try {
      await api.updateChannel(channel.id, {
        name: name.trim(), display_id: displayId.trim(),
        ...(token.trim() ? { access_token: token.trim() } : {}),
        ...(isWa ? { calling_enabled: calling } : {}),
      });
      onSaved(t("settings.channelUpdated"));
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative bg-card rounded-lg border border-border shadow-2xl w-full max-w-lg animate-scale-in">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border">
          <ChannelIcon type={isSandbox(channel) ? "testing" : channel.type} size={32} />
          <h2 className="text-[15px] font-bold text-foreground flex-1">{t("common.edit")} {channel.name}</h2>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors"><X className="w-[18px] h-[18px]" /></button>
        </div>
        <div className="px-5 py-5 flex flex-col gap-4">
          <div><FieldLabel>{t("settings.channelName")}</FieldLabel><input value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} autoFocus /></div>
          <div><FieldLabel>{t("settings.displayNumberHandle")}</FieldLabel><input value={displayId} onChange={(e) => setDisplayId(e.target.value)} className={INPUT_CLASS} placeholder="+62 812 3456 7890" /></div>
          <div><FieldLabel>{t("settings.accessTokenLeaveBlankTo")}</FieldLabel><input type="password" value={token} onChange={(e) => setToken(e.target.value)} className={INPUT_CLASS} /></div>
          {isWa && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground">{t("settings.whatsappCalling")}</p>
                <p className="text-[11.5px] text-muted-foreground mt-0.5">{t("settings.showACallButtonIn")}</p>
              </div>
              <Toggle checked={calling} onChange={() => setCalling((v) => !v)} />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-border">
          <GhostButton onClick={onClose}>{t("common.cancel")}</GhostButton>
          <PrimaryButton onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{t("common.save")}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
