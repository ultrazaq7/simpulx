"use client";
// Advertising — folded into Channel & Integrations as the "Advertising" tab.
// SETUP ONLY: connect Meta / TikTok / Google ad accounts, edit a connection, and
// map its ad campaigns to ours. Reporting (spend, cost-per-lead) lives on the Dashboard.
import { useEffect, useMemo, useState } from "react";
import {
  Plus, RefreshCw, Trash2, Loader2, BarChart3, AlertTriangle, Link2, Search, Pencil, KeyRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { MultiSelect } from "@/components/ui/multi-select";
import SidePanel from "@/components/SidePanel";
import { Toast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { cn, fmtDateTimeShort } from "@/lib/utils";
import type { AdAccount, AdCampaignRow, Campaign } from "@/lib/types";
import { AdWizard } from "./AdWizard";

const PLATFORMS: Record<string, { label: string }> = {
  meta: { label: "Meta (Facebook/Instagram)" },
  tiktok: { label: "TikTok" },
  google: { label: "Google Ads" },
};

export function AdvertisingTab({ embedded }: { embedded?: boolean } = {}) {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [adCampaigns, setAdCampaigns] = useState<AdCampaignRow[]>([]);
  const [ourCampaigns, setOurCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { confirm, ConfirmHost } = useConfirm();
  const [search, setSearch] = useState("");

  async function loadAll() {
    const [acc, adc, oc] = await Promise.all([
      api.listAdAccounts().catch(() => []),
      api.listAdCampaigns().catch(() => []),
      api.listCampaigns().catch(() => []),
    ]);
    setAccounts(acc as AdAccount[]); setAdCampaigns(adc as AdCampaignRow[]);
    setOurCampaigns(oc as Campaign[]);
    setLoading(false);
  }
  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function sync(id: string) {
    setSyncing(id);
    try { await api.syncAdAccount(id); setToast("Synced"); await loadAll(); }
    catch (e: any) { setToast(e?.message || "Sync failed"); }
    finally { setSyncing(null); }
  }
  async function remove(a: AdAccount) {
    if (!(await confirm({ title: "Disconnect ad account?", message: `Disconnect ${a.name || a.external_account_id}? Its metrics will be removed.`, danger: true, confirmLabel: "Disconnect" }))) return;
    try { await api.deleteAdAccount(a.id); setToast("Disconnected"); setManageId(null); await loadAll(); }
    catch { setToast("Failed"); }
  }
  async function map(adCampId: string, campaignIds: string[]) {
    setAdCampaigns((p) => p.map((x) => (x.id === adCampId ? { ...x, campaign_ids: campaignIds, campaign_id: campaignIds[0] || null } : x)));
    try { await api.mapAdCampaign(adCampId, campaignIds); await loadAll(); }
    catch { setToast("Could not map"); }
  }

  const q = search.trim().toLowerCase();
  const visible = useMemo(
    () => accounts.filter((a) => !q || (a.name || a.external_account_id).toLowerCase().includes(q)),
    [accounts, q],
  );
  const managed = accounts.find((a) => a.id === manageId) || null;

  return (
    <div className={cn("px-6 py-6 w-full", !embedded && "h-full flex flex-col min-h-0")}>
      <div className={cn("bg-card border border-border rounded-lg shadow-xs overflow-hidden flex flex-col", !embedded && "flex-1 min-h-0")}>
        {/* Toolbar */}
        <div className="p-3 flex items-center gap-2.5 border-b border-border flex-wrap shrink-0">
          <div className="relative w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input type="text" placeholder="Search accounts" value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-muted text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </div>
          <div className="flex-1" />
          <button onClick={() => setConnectOpen(true)} className="inline-flex items-center gap-2 px-3.5 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm transition-all outline-none">
            <Plus className="w-4 h-4" />Connect ad account
          </button>
        </div>

        <div className={cn("p-4", !embedded && "overflow-auto flex-1 min-h-0")}>
        {loading ? (
          <div className="h-40 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : accounts.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-xl bg-muted grid place-items-center mx-auto mb-3"><BarChart3 className="w-6 h-6 text-muted-foreground/50" /></div>
            <p className="font-semibold text-foreground mb-0.5">No ad account connected</p>
            <p className="text-sm text-muted-foreground mb-4">Connect a Meta ad account, then map its campaigns. Spend and results show on the Dashboard.</p>
            <button onClick={() => setConnectOpen(true)} className="inline-flex items-center gap-2 px-4 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm outline-none"><Plus className="w-4 h-4" />Connect ad account</button>
          </div>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            {visible.map((a) => {
              const mapped = adCampaigns.filter((c) => c.account_name === a.name && c.campaign_id).length;
              return (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors">
                  <div className="min-w-0 w-[220px] shrink-0">
                    <p className="font-semibold text-foreground truncate">{a.name || a.external_account_id}</p>
                    <p className="text-[11.5px] text-muted-foreground truncate">{PLATFORMS[a.platform]?.label || a.platform}{a.currency ? ` · ${a.currency}` : ""}</p>
                  </div>
                  <div className="min-w-0 flex-1 hidden md:block">
                    {a.last_error ? (
                      <button onClick={() => setManageId(a.id)} className="text-left text-[11.5px] text-red-600 flex items-start gap-1 hover:underline outline-none max-w-full">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /><span className="line-clamp-1">{a.last_error} — fix the token</span>
                      </button>
                    ) : (
                      <span className="text-[11.5px] text-muted-foreground">
                        {a.campaign_count > 0 ? `${a.campaign_count} campaign${a.campaign_count === 1 ? "" : "s"}${mapped ? ` · ${mapped} mapped` : ""}` : (a.last_synced_at ? "No campaigns" : "Never synced")}
                      </span>
                    )}
                  </div>
                  <div className="hidden lg:flex flex-col items-end shrink-0 text-[11px] text-muted-foreground leading-tight whitespace-nowrap">
                    <span>Created {fmtDateTimeShort(a.created_at)}</span>
                    {a.updated_at && <span>Updated {fmtDateTimeShort(a.updated_at)}</span>}
                  </div>
                  <span className={cn("px-2 py-0.5 rounded-md text-[11px] font-semibold shrink-0", a.status === "error" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600")}>{a.status}</span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => setManageId(a.id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground outline-none transition-colors" title="Edit / map"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => sync(a.id)} disabled={syncing === a.id} className="p-1.5 rounded-md hover:bg-muted text-primary outline-none disabled:opacity-50 transition-colors" title="Sync now"><RefreshCw className={cn("w-4 h-4", syncing === a.id && "animate-spin")} /></button>
                    <button onClick={() => remove(a)} className="p-1.5 rounded-md hover:bg-muted text-destructive outline-none transition-colors" title="Disconnect"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>

      {connectOpen && <AdWizard onClose={() => { setConnectOpen(false); loadAll(); }} onConnected={(msg) => { setConnectOpen(false); setToast(msg); loadAll(); }} />}
      {managed && (
        <AdAccountDialog
          account={managed}
          adCampaigns={adCampaigns.filter((c) => c.account_name === managed.name)}
          ourCampaigns={ourCampaigns}
          onMap={map}
          onSync={() => sync(managed.id)}
          syncing={syncing === managed.id}
          onClose={() => setManageId(null)}
          onSaved={(m) => { setToast(m); loadAll(); }}
          onError={(m) => setToast(m)}
        />
      )}
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
      {ConfirmHost}
    </div>
  );
}

// Manage one connection: edit name / account id / access token, and map its ad
// campaigns to our campaigns. Replaces the old global mapping table.
export function AdAccountDialog({ account, adCampaigns, ourCampaigns, onMap, onSync, syncing, onClose, onSaved, onError }: {
  account: AdAccount; adCampaigns: AdCampaignRow[]; ourCampaigns: Campaign[];
  onMap: (adCampId: string, campaignIds: string[]) => void; onSync: () => void; syncing: boolean;
  onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const [name, setName] = useState(account.name || "");
  const [extId, setExtId] = useState(account.external_account_id || "");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  const ourCampOptions = useMemo(() => ourCampaigns.map((c) => ({ value: c.id, label: c.name })), [ourCampaigns]);

  async function save() {
    setSaving(true);
    try {
      await api.updateAdAccount(account.id, {
        name: name.trim() || undefined,
        external_account_id: extId.trim() || undefined,
        access_token: token.trim() || undefined,
      });
      onSaved(token.trim() ? "Connection updated — syncing" : "Connection updated");
      if (token.trim()) onSync();
      onClose();
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  const F = "w-full h-10 px-3 rounded-md border border-input bg-background text-[13.5px] text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20";
  const L = "block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5";

  return (
    <SidePanel
      open
      onClose={onClose}
      title={account.name || account.external_account_id}
      description={PLATFORMS[account.platform]?.label || account.platform}
      width="lg"
      busy={saving}
      onApply={save}
      applyLabel="Save changes"
    >
      <div className="flex flex-col gap-5">
        {account.last_error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-[12px] text-red-600">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /><span>{account.last_error}</span>
          </div>
        )}

        {/* Connection */}
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Connection</p>
          <div><label className={L}>Display name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Meta account" className={F} /></div>
          <div><label className={L}>Account ID</label><input value={extId} onChange={(e) => setExtId(e.target.value)} placeholder="e.g. 1234567890" className={F} /></div>
          <div>
            <label className={L}>Access token</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Leave blank to keep current" className={cn(F, "pl-9")} autoComplete="off" />
            </div>
          </div>
        </div>

        {/* Campaign mapping */}
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Map campaigns</p>
            <button onClick={onSync} disabled={syncing} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline outline-none disabled:opacity-50">
              <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />Sync
            </button>
          </div>
          {adCampaigns.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground py-3 text-center bg-muted/40 rounded-md">No campaigns yet. Sync this account to pull them.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border/60 rounded-md border border-border overflow-hidden">
              {adCampaigns.map((ac) => (
                <div key={ac.id} className="flex items-center gap-2 px-3 py-2.5">
                  <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[13px] font-medium text-foreground flex-1 truncate">{ac.name}</span>
                  <MultiSelect
                    value={ac.campaign_ids || (ac.campaign_id ? [ac.campaign_id] : [])}
                    onChange={(v) => onMap(ac.id, v)}
                    options={ourCampOptions}
                    placeholder="Not mapped"
                    className="w-[220px]"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SidePanel>
  );
}
