"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Plus, RefreshCw, Pencil, Trash2, CheckCircle, Lock, Loader2, X,
} from "lucide-react";
import ChannelIcon, { CHANNEL_CATALOG, channelMeta, type ChannelMeta } from "@/components/ChannelIcon";
import { api } from "@/lib/api";
import { cn, fmtDate } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";
import type { Channel } from "@/lib/types";
import { useToast, FieldLabel, INPUT_CLASS, PrimaryButton, GhostButton } from "../_shared";

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  connected:    { label: "Connected",     color: "text-success",           bg: "bg-success" },
  pending:      { label: "Pending setup", color: "text-warning",           bg: "bg-warning" },
  disconnected: { label: "Disconnected",  color: "text-muted-foreground",  bg: "bg-muted-foreground/40" },
  error:        { label: "Error",         color: "text-destructive",       bg: "bg-destructive" },
};

function StatusDot({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.disconnected;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("w-[7px] h-[7px] rounded-full", s.bg)} />
      <span className={cn("text-xs font-semibold", s.color)}>{s.label}</span>
    </span>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 outline-none",
        checked ? "bg-primary" : "bg-muted",
      )}
    >
      <span className={cn(
        "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 mt-0.5",
        checked ? "translate-x-[18px] ml-0.5" : "translate-x-0.5",
      )} />
    </button>
  );
}

type DialogState = { open: boolean; type: string; editing: Channel | null };

export default function ChannelsPage() {
  const { notify, ToastHost } = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>("whatsapp");
  const [dialog, setDialog] = useState<DialogState>({ open: false, type: "whatsapp", editing: null });

  async function load() {
    setLoading(true);
    try { setChannels(await api.listChannels()); }
    catch { /* unauthenticated handled in api */ }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const meta = channelMeta(selected);
  const countFor = (type: string) => channels.filter((c) => {
    if (type === "testing") return c.type === "whatsapp" && (c.config as Record<string,any>)?.is_sandbox;
    if (type === "whatsapp") return c.type === "whatsapp" && !(c.config as Record<string,any>)?.is_sandbox;
    return c.type === type;
  }).length;

  const ofType = useMemo(() => channels.filter((c) => {
    if (selected === "testing") return c.type === "whatsapp" && (c.config as Record<string,any>)?.is_sandbox;
    if (selected === "whatsapp") return c.type === "whatsapp" && !(c.config as Record<string,any>)?.is_sandbox;
    return c.type === selected;
  }), [channels, selected]);

  async function test(c: Channel) {
    try { await api.testChannel(c.id); notify("Connection verified"); load(); }
    catch (e) { notify(String(e), "error"); }
  }
  async function toggleActive(c: Channel) {
    try { await api.updateChannel(c.id, { is_active: !c.is_active }); load(); }
    catch (e) { notify(String(e), "error"); }
  }
  async function remove(c: Channel) {
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    try { await api.deleteChannel(c.id); notify("Channel deleted"); load(); }
    catch (e) { notify(String(e), "error"); }
  }

  return (
    <div className="flex h-full min-h-0">
      {ToastHost}
      {/* ── Left rail: channel catalog ── */}
      <div className="w-[312px] shrink-0 border-r border-border bg-card overflow-y-auto py-1.5">
        {CHANNEL_CATALOG.map((c) => {
          const active = selected === c.type;
          const n = countFor(c.type);
          return (
            <div
              key={c.type}
              onClick={() => setSelected(c.type)}
              className={cn(
                "flex items-center gap-3 mx-1.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors duration-100",
                active ? "bg-muted" : "hover:bg-muted/50",
              )}
            >
              <ChannelIcon type={c.type} size={34} />
              <div className="min-w-0 flex-1">
                <p className={cn("text-[13.5px] font-semibold leading-tight truncate", active ? "text-primary" : "text-foreground")}>
                  {c.name}
                </p>
                <p className="text-[11.5px] text-muted-foreground truncate">
                  {c.available ? c.blurb : "Coming soon"}
                </p>
              </div>
              {c.type !== "testing" && (n > 0 ? (
                <span className={cn(
                  "min-w-[20px] h-5 px-1.5 rounded-lg grid place-items-center text-[11px] font-bold",
                  active ? "bg-primary text-white" : "bg-muted text-muted-foreground",
                )}>
                  {n}
                </span>
              ) : !c.available ? (
                <Lock className="w-4 h-4 text-muted-foreground/40" />
              ) : null)}
            </div>
          );
        })}
      </div>

      {/* ── Right panel: detail ── */}
      <div className="flex-1 min-w-0 overflow-y-auto p-8 bg-background">
        {selected === "testing"
          ? <TestingPanel
              loading={loading} channels={ofType}
              onAdd={() => setDialog({ open: true, type: selected, editing: null })}
              onEdit={(c) => setDialog({ open: true, type: c.type, editing: c })}
              onTest={test} onToggle={toggleActive} onDelete={remove} onRefresh={load}
            />
          : <ConnectedPanel
              meta={meta} loading={loading} channels={ofType}
              onAdd={() => setDialog({ open: true, type: selected, editing: null })}
              onEdit={(c) => setDialog({ open: true, type: c.type, editing: c })}
              onTest={test} onToggle={toggleActive} onDelete={remove} onRefresh={load}
            />}
      </div>

      <ChannelDialog
        state={dialog}
        onClose={() => setDialog((d) => ({ ...d, open: false }))}
        onSaved={(msg) => { setDialog((d) => ({ ...d, open: false })); notify(msg); load(); }}
        onError={(msg) => notify(msg, "error")}
      />
    </div>
  );
}

// ── Channel card (reused in both panels) ───────────────────────────────
function ChannelCard({ c, iconType, onTest, onToggle, onEdit, onDelete }: {
  c: Channel; iconType?: string;
  onTest: (c: Channel) => void; onToggle: (c: Channel) => void;
  onEdit: (c: Channel) => void; onDelete: (c: Channel) => void;
}) {
  return (
    <div className={cn("flex items-center gap-4 p-4 mb-2.5 rounded-lg bg-card border border-border shadow-xs transition-opacity", !c.is_active && "opacity-60")}>
      <ChannelIcon type={iconType ?? c.type} size={42} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
        <p className="text-[12.5px] text-muted-foreground truncate">
          {c.display_id || c.phone_number_id || "Not configured"}
          {c.connected_at ? ` · since ${fmtDate(c.connected_at)}` : ""}
        </p>
      </div>
      <StatusDot status={c.status} />
      <Toggle checked={c.is_active} onChange={() => onToggle(c)} />
      <button
        onClick={() => onTest(c)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-semibold text-foreground hover:bg-muted transition-colors outline-none"
      >
        <CheckCircle className="w-3.5 h-3.5" />Test
      </button>
      <Tip label="Edit">
        <button onClick={() => onEdit(c)} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors">
          <Pencil className="w-[17px] h-[17px] text-muted-foreground" />
        </button>
      </Tip>
      <Tip label="Delete">
        <button onClick={() => onDelete(c)} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors">
          <Trash2 className="w-[17px] h-[17px] text-destructive" />
        </button>
      </Tip>
    </div>
  );
}

// ── Detail panel for an available / coming-soon platform ───────────────
function ConnectedPanel({ meta, loading, channels, onAdd, onEdit, onTest, onToggle, onDelete, onRefresh }: {
  meta: ChannelMeta; loading: boolean; channels: Channel[];
  onAdd: () => void; onEdit: (c: Channel) => void; onTest: (c: Channel) => void;
  onToggle: (c: Channel) => void; onDelete: (c: Channel) => void; onRefresh: () => void;
}) {
  return (
    <div className="max-w-[880px] mx-auto">
      {/* Hero header */}
      <div className="flex items-start gap-4 p-4 rounded-lg bg-card border border-border shadow-xs">
        <ChannelIcon type={meta.type} size={56} radius={16} />
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-foreground">{meta.name}</h2>
          <p className="text-[13.5px] text-muted-foreground mt-1 max-w-[560px]">{meta.description}</p>
        </div>
        {meta.available && (
          <PrimaryButton onClick={onAdd} className="whitespace-nowrap shrink-0">
            <Plus className="w-4 h-4" />Add channel
          </PrimaryButton>
        )}
      </div>

      {!meta.available ? (
        <div className="text-center py-16">
          <div className="opacity-50 inline-flex mb-3"><ChannelIcon type={meta.type} size={64} radius={18} /></div>
          <p className="font-bold text-base text-foreground">{meta.name} is coming soon</p>
          <p className="text-[13px] text-muted-foreground mt-1">This channel is on the roadmap. We will let you know when it is ready to connect.</p>
        </div>
      ) : (
        <div className="mt-5">
          <div className="flex items-center mb-3">
            <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Connected accounts</p>
            <div className="flex-1" />
            <Tip label="Refresh">
              <button onClick={onRefresh} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors">
                <RefreshCw className="w-[17px] h-[17px] text-muted-foreground" />
              </button>
            </Tip>
          </div>

          {loading ? (
            [0, 1].map((i) => <div key={i} className="h-[72px] rounded-lg skeleton mb-2.5" />)
          ) : channels.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border rounded-lg bg-card">
              <p className="font-semibold text-sm text-foreground">No {meta.name} accounts yet</p>
              <p className="text-[13px] text-muted-foreground mt-1 mb-4">Connect your first account to start messaging.</p>
              <PrimaryButton onClick={onAdd}>
                <Plus className="w-4 h-4" />Add channel
              </PrimaryButton>
            </div>
          ) : (
            channels.map((c) => (
              <ChannelCard key={c.id} c={c} onTest={onTest} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Testing sandbox panel (mock mode explainer) ────────────────────────
function TestingPanel({ loading, channels, onAdd, onEdit, onTest, onToggle, onDelete, onRefresh }: {
  loading: boolean; channels: Channel[];
  onAdd: () => void; onEdit: (c: Channel) => void; onTest: (c: Channel) => void;
  onToggle: (c: Channel) => void; onDelete: (c: Channel) => void; onRefresh: () => void;
}) {
  return (
    <div className="max-w-[880px] mx-auto">
      {/* Hero */}
      <div className="flex items-start gap-4 p-4 rounded-lg bg-card border border-border shadow-xs">
        <ChannelIcon type="testing" size={56} radius={16} />
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-foreground">Testing channel</h2>
          <p className="text-[13.5px] text-muted-foreground mt-1 max-w-[600px]">
            A sandbox WhatsApp number for testing flows without touching your live channels.
          </p>
        </div>
        <PrimaryButton onClick={onAdd} className="whitespace-nowrap shrink-0">
          <Plus className="w-4 h-4" />Add sandbox WABA
        </PrimaryButton>
      </div>

      {/* Sandbox accounts */}
      <div className="mt-6">
        <div className="flex items-center mb-3">
          <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Sandbox accounts</p>
          <div className="flex-1" />
          <Tip label="Refresh">
            <button onClick={onRefresh} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors">
              <RefreshCw className="w-[17px] h-[17px] text-muted-foreground" />
            </button>
          </Tip>
        </div>

        {loading ? (
          <div className="h-[72px] rounded-lg skeleton mb-2.5" />
        ) : channels.length === 0 ? (
          <div className="text-center py-9 border border-dashed border-border rounded-lg bg-card">
            <p className="font-semibold text-sm text-foreground">No sandbox accounts connected</p>
            <p className="text-[13px] text-muted-foreground mt-1 mb-4">Connect a WABA to use for testing.</p>
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-md text-sm font-semibold text-foreground hover:bg-muted transition-colors outline-none"
            >
              <Plus className="w-4 h-4" />Add sandbox WABA
            </button>
          </div>
        ) : (
          channels.map((c) => (
            <ChannelCard key={c.id} c={c} iconType="testing" onTest={onTest} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
          ))
        )}
      </div>

    </div>
  );
}

// ── Add / edit channel dialog ──────────────────────────────────────────
function ChannelDialog({ state, onClose, onSaved, onError }: {
  state: DialogState; onClose: () => void;
  onSaved: (msg: string) => void; onError: (msg: string) => void;
}) {
  const { type, editing } = state;
  const meta = channelMeta(type);
  const isEdit = !!editing;
  const cfg = (editing?.config ?? {}) as Record<string, string>;

  const [name, setName] = useState("");
  const [displayId, setDisplayId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [pageId, setPageId] = useState("");
  const [igId, setIgId] = useState("");
  const [token, setToken] = useState("");
  const [callingEnabled, setCallingEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset fields whenever the dialog (re)opens.
  useEffect(() => {
    if (!state.open) return;
    setName(editing?.name ?? "");
    setDisplayId(editing?.display_id ?? "");
    setPhoneNumberId(editing?.phone_number_id ?? "");
    setWabaId(editing?.waba_id ?? "");
    setPageId((cfg.page_id as string) ?? "");
    setIgId((cfg.instagram_account_id as string) ?? "");
    setToken("");
    setCallingEnabled(editing?.calling_enabled ?? false);
  }, [state.open]); // eslint-disable-line react-hooks/exhaustive-deps

  const isWa = type === "whatsapp" || type === "testing";
  const isIg = type === "instagram";
  const isMsgr = type === "messenger";

  async function save() {
    if (!name.trim()) { onError("Channel name is required"); return; }
    setSaving(true);
    const config: Record<string, unknown> = {};
    if (isMsgr || isIg) config.page_id = pageId.trim();
    if (isIg) config.instagram_account_id = igId.trim();
    if (type === "testing") config.is_sandbox = true;
    try {
      if (isEdit) {
        await api.updateChannel(editing!.id, {
          name: name.trim(), display_id: displayId.trim(),
          ...(token.trim() ? { access_token: token.trim() } : {}),
          config,
          ...(isWa ? { calling_enabled: callingEnabled } : {}),
        });
        onSaved("Channel updated");
      } else {
        await api.createChannel({
          type: type === "testing" ? "whatsapp" : type,
          name: name.trim(), display_id: displayId.trim(),
          phone_number_id: isWa ? phoneNumberId.trim() : undefined,
          waba_id: isWa ? wabaId.trim() : undefined,
          access_token: token.trim() || undefined,
          config,
        });
        onSaved("Channel added - run Test to verify the connection");
      }
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  if (!state.open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative bg-card rounded-lg border border-border shadow-2xl w-full max-w-lg animate-scale-in">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border">
          <ChannelIcon type={type} size={32} />
          <h2 className="text-[15px] font-bold text-foreground flex-1">{isEdit ? "Edit" : "Connect"} {meta.name}</h2>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors"><X className="w-[18px] h-[18px]" /></button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <Field label="Channel name" value={name} onChange={setName} placeholder="e.g. Sales WhatsApp" autoFocus />
          {isWa && <>
            <Field label="Display number" value={displayId} onChange={setDisplayId} placeholder="+62 812 3456 7890" />
            <Field label="Phone Number ID (Meta)" value={phoneNumberId} onChange={setPhoneNumberId} />
            <Field label="WABA ID" value={wabaId} onChange={setWabaId} />
          </>}
          {(isMsgr || isIg) && <>
            <Field label="Page ID" value={pageId} onChange={setPageId} />
            {isIg && <Field label="Instagram Account ID" value={igId} onChange={setIgId} />}
            <Field label={isIg ? "Display handle" : "Page name"} value={displayId} onChange={setDisplayId} placeholder={isIg ? "@yourbrand" : "Your Page"} />
          </>}
          <Field label={isEdit ? "Access token (leave blank to keep)" : "Access token"} value={token} onChange={setToken} type="password" />
          {isWa && isEdit && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground">WhatsApp calling</p>
                <p className="text-[11.5px] text-muted-foreground mt-0.5">Show a call button in the inbox (opens WhatsApp and logs the attempt).</p>
              </div>
              <Toggle checked={callingEnabled} onChange={() => setCallingEnabled((v) => !v)} />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-border">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isEdit ? "Save" : "Connect"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; autoFocus?: boolean;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={INPUT_CLASS}
      />
    </div>
  );
}
