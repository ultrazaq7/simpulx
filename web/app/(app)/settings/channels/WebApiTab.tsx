"use client";
import { useI18n } from "@/lib/i18n";
// Web API lead sources — folded into Channel & Integrations as the "Web API" tab.
// Captures leads from ad platforms / external systems via an API key; each lead
// opens a conversation in the inbox attributed to its source.
import { useEffect, useState } from "react";
import { Plus, RefreshCw, Pencil, Trash2, RotateCw, Plug, Key, Search } from "lucide-react";
import { api } from "@/lib/api";
import { Select } from "@/components/Select";
import SidePanel from "@/components/SidePanel";
import { cn, fmtDateTimeShort } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";
import type { WebApiSource, Campaign, SourcePlatform } from "@/lib/types";
import { usePermissions } from "@/lib/permissions";
import { useToast, FieldLabel, INPUT_CLASS, PrimaryButton } from "../_shared";
import { WebApiWizard } from "./WebApiWizard";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Same vocabulary as ad_accounts.platform, so a source's platform reads the
// same way everywhere (contacts, exports, logs).
const PLATFORM_LABELS: Record<SourcePlatform, string> = {
  meta: "Meta Ads", tiktok: "TikTok Ads", google: "Google Ads", other: "Other",
};
const PLATFORM_COLORS: Record<SourcePlatform, string> = {
  meta: "#1877F2", tiktok: "#111111", google: "#EA4335", other: "#8B5CF6",
};

export function WebApiTab() {
  const { t } = useI18n();
  const { notify, confirm, ToastHost } = useToast();
  // POST/PATCH/DELETE on web-api-sources are gated server-side on
  // manage_channels, so show the controls only to callers who actually have it.
  const { can } = usePermissions();
  const canManage = can("manage_channels");
  const [rows, setRows] = useState<WebApiSource[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState<{ open: boolean; editing: WebApiSource | null }>({ open: false, editing: null });
  const [wizardOpen, setWizardOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = rows.filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()) || (p.slug ?? "").toLowerCase().includes(query.toLowerCase()));

  async function load() {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([api.listWebApiSources(), api.listCampaigns().catch(() => [])]);
      setRows(p); setCampaigns(c as Campaign[]);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function copy(text: string, label = "Copied") { navigator.clipboard.writeText(text); notify(label); }
  async function toggle(p: WebApiSource) {
    try { await api.updateWebApiSource(p.id, { is_active: !p.is_active }); load(); } catch (e) { notify(String(e), "error"); }
  }
  async function regen(p: WebApiSource) {
    if (!(await confirm({ title: "Regenerate API key?", message: `Regenerate the API key for "${p.name}"? The current key stops working.`, danger: true, confirmLabel: "Regenerate" }))) return;
    try { const r = await api.regenerateWebApiKey(p.id); notify(t("settings.apiKeyRegenerated")); copy(r.api_key, "New key copied"); load(); }
    catch (e) { notify(String(e), "error"); }
  }
  async function remove(p: WebApiSource) {
    if (!(await confirm({ title: "Delete API source?", message: `Delete "${p.name}"? This can't be undone.`, danger: true, confirmLabel: "Delete" }))) return;
    try { await api.deleteWebApiSource(p.id); notify(t("settings.apiSourceDeleted")); load(); }
    catch (e) { notify(String(e), "error"); }
  }

  return (
    <div className="px-6 py-6 w-full h-full flex flex-col min-h-0">
      {ToastHost}
      <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 flex items-center gap-3 border-b border-border flex-wrap shrink-0">
          <div className="relative w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input type="text" placeholder={t("settings.searchApiSources")} value={query} onChange={(e) => setQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-muted text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary" />
          </div>
          <Tip label={t("broadcasts.refresh")}><button onClick={load} className="p-1.5 rounded-md hover:bg-muted transition-colors outline-none">
            <RefreshCw className="w-[18px] h-[18px] text-muted-foreground" />
          </button></Tip>
          <div className="flex-1" />
          {canManage && (
            <PrimaryButton onClick={() => setWizardOpen(true)}>
              <Plus className="w-4 h-4" />{t("settings.addApiSource")}
            </PrimaryButton>
          )}
        </div>

        <div className="overflow-auto flex-1 min-h-0 p-4">


          {/* List (rows) */}
          {loading ? (
            <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-14 rounded-lg skeleton" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 rounded-lg bg-card">
              <Plug className="w-11 h-11 text-muted-foreground/30 mx-auto mb-2" />
              <p className="font-bold text-foreground mb-1">{t("settings.noApiSourcesYet")}</p>
              <p className="text-[13px] text-muted-foreground mb-4">{t("settings.connectAnAdPlatformOr")}</p>
              {canManage && (
                <PrimaryButton onClick={() => setWizardOpen(true)}>
                  <Plus className="w-4 h-4" />{t("settings.addApiSource")}
                </PrimaryButton>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {filtered.map((p) => (
                <div key={p.id} className={cn("flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors", !p.is_active && "opacity-65")}>
                  <div className="w-9 h-9 rounded-lg grid place-items-center bg-[#8B5CF6]/[0.12] text-[#8B5CF6] shrink-0"><Plug className="w-[18px] h-[18px]" /></div>
                  <div className="min-w-0 w-[210px] shrink-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13.5px] font-bold text-foreground truncate">{p.name}</p>
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white" style={{ backgroundColor: PLATFORM_COLORS[p.platform] }}>
                        {PLATFORM_LABELS[p.platform]}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-muted-foreground truncate">{p.slug ? `slug: ${p.slug}` : ""}{p.campaign_name ? ` · → ${p.campaign_name}` : ""} · {p.lead_count} leads</p>
                  </div>
                  <div className="min-w-0 flex-1 hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/50">
                    <Key className="w-[15px] h-[15px] text-muted-foreground shrink-0" />
                    {/* The key is stored hashed and shown in full only once at
                        create/regenerate — here we can only show its masked hint. */}
                    <span className="text-xs text-muted-foreground flex-1 truncate">{p.key_hint || `pk_${"•".repeat(14)}`}</span>
                    <Tip label={t("settings.regenerateKey")}><button onClick={() => regen(p)} className="p-1 outline-none text-muted-foreground hover:text-foreground transition-colors"><RotateCw className="w-[15px] h-[15px]" /></button></Tip>
                  </div>
                  <div className="hidden lg:flex flex-col items-end shrink-0 text-[11px] text-muted-foreground leading-tight whitespace-nowrap">
                    <span>{t("contacts.created")} {fmtDateTimeShort(p.created_at)}</span>
                    {p.updated_at && <span>{t("dashboard.updated")} {fmtDateTimeShort(p.updated_at)}</span>}
                  </div>
                  {canManage && (
                    <>
                      <Tip label={p.is_active ? t("dashboard.active") : t("settings.disabled")}>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input type="checkbox" checked={p.is_active} onChange={() => toggle(p)} className="sr-only peer" />
                          <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                        </label>
                      </Tip>
                      <Tip label={t("common.edit")}><button onClick={() => setDlg({ open: true, editing: p })} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors shrink-0"><Pencil className="w-[18px] h-[18px] text-muted-foreground" /></button></Tip>
                      <Tip label={t("common.delete")}><button onClick={() => remove(p)} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors shrink-0"><Trash2 className="w-[18px] h-[18px] text-destructive" /></button></Tip>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <WebApiDialog state={dlg} campaigns={campaigns}
        onClose={() => setDlg({ open: false, editing: null })}
        onSaved={(m) => { setDlg({ open: false, editing: null }); notify(m); load(); }}
        onError={(m) => notify(m, "error")} />

      {wizardOpen && (
        <WebApiWizard campaigns={campaigns}
          onClose={() => { setWizardOpen(false); load(); }}
          onCreated={(m) => { setWizardOpen(false); notify(m); load(); }} />
      )}
    </div>
  );
}

function WebApiDialog({ state, campaigns, onClose, onSaved, onError }: {
  state: { open: boolean; editing: WebApiSource | null }; campaigns: Campaign[];
  onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const { t } = useI18n();
  const isEdit = !!state.editing;
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [template, setTemplate] = useState("");
  const [webhook, setWebhook] = useState("");
  const [platform, setPlatform] = useState<SourcePlatform>("other");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const p = state.editing;
    setName(p?.name ?? ""); setSlug(p?.slug ?? "");
    setCampaignId(p?.campaign_id ?? "");
    setTemplate(p?.auto_template_name ?? ""); setWebhook(p?.webhook_url ?? "");
    setPlatform(p?.platform ?? "other");
  }, [state.open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!name.trim()) { onError(t("account.name_required")); return; }
    setSaving(true);
    const payload = { name: name.trim(), slug: slug.trim() || undefined, auto_template_name: template.trim() || undefined, webhook_url: webhook.trim() || undefined, campaign_id: campaignId, platform };
    try {
      if (isEdit) { await api.updateWebApiSource(state.editing!.id, payload); onSaved(t("settings.apiSourceUpdated")); }
      else { await api.createWebApiSource(payload); onSaved(t("settings.apiSourceCreated")); }
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  const fields = [
    { label: "Name", value: name, set: setName, placeholder: "e.g. Meta Ads", autoFocus: true },
    { label: "Slug (optional)", value: slug, set: setSlug, placeholder: "auto-generated from name" },
    { label: "Auto template (optional)", value: template, set: setTemplate },
    { label: "Webhook URL (optional)", value: webhook, set: setWebhook, placeholder: "https://..." },
  ];

  return (
    <SidePanel
      open={state.open}
      onClose={onClose}
      title={isEdit ? t("settings.editApiSource") : t("settings.newApiSource")}
      width="sm"
      busy={saving}
      onApply={save}
      applyLabel={isEdit ? "Save" : "Create"}
    >
      <div className="flex flex-col gap-4">
        {fields.map((f) => (
          <div key={f.label}>
            <FieldLabel>{t(f.label)}</FieldLabel>
            <input type="text" value={f.value} onChange={(e) => f.set(e.target.value)} autoFocus={f.autoFocus} placeholder={f.placeholder}
              className={INPUT_CLASS} />
          </div>
        ))}
        <div>
          <FieldLabel>{t("settings.platform")}</FieldLabel>
          <Select value={platform} onChange={(v) => setPlatform(v as SourcePlatform)} searchable={false}
            options={(Object.keys(PLATFORM_LABELS) as SourcePlatform[]).map((k) => ({ value: k, label: PLATFORM_LABELS[k] }))} />
        </div>
        <div>
          <FieldLabel>{t("settings.routeToCampaign")}</FieldLabel>
          <Select value={campaignId} onChange={setCampaignId} placeholder={t("settings.noCampaign")}
            options={[{ value: "", label: "No campaign" }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} />
        </div>
      </div>
    </SidePanel>
  );
}
