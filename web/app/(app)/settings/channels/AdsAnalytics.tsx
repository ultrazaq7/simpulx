"use client";
import { useI18n } from "@/lib/i18n";
// Ads & Analytics — ONE page, ONE connect wizard. Ad accounts (Meta/TikTok/Google Ads)
// and Google Analytics 4 live in a single list; the "Connect" button opens the shared
// AdWizard, whose first step picks the source. Reporting stays on the Dashboard.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus, RefreshCw, Trash2, Loader2, BarChart3, AlertTriangle, Search, Pencil, LineChart,
} from "lucide-react";
import { api } from "@/lib/api";
import { Toast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { cn, fmtDateTimeShort } from "@/lib/utils";
import type { AdAccount, AdCampaignRow, Campaign, Ga4Connection } from "@/lib/types";
import { AdWizard } from "./AdWizard";
import { AdAccountDialog } from "./AdvertisingTab";

const PLATFORM_LABEL: Record<string, string> = {
  meta: "Meta Ads (Facebook/Instagram)", tiktok: "TikTok Ads", google: "Google Ads",
};
const PLATFORM_COLOR: Record<string, string> = { meta: "#1877F2", tiktok: "#111111", google: "#EA4335" };

export function AdsAnalytics() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();

  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [adCampaigns, setAdCampaigns] = useState<AdCampaignRow[]>([]);
  const [ourCampaigns, setOurCampaigns] = useState<Campaign[]>([]);
  const [ga4, setGa4] = useState<Ga4Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [resumeGa4, setResumeGa4] = useState(false);
  const [manageId, setManageId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { confirm, ConfirmHost } = useConfirm();
  const [search, setSearch] = useState("");

  const loadAll = useCallback(async () => {
    const [acc, adc, oc, g] = await Promise.all([
      api.listAdAccounts().catch(() => []),
      api.listAdCampaigns().catch(() => []),
      api.listCampaigns().catch(() => []),
      api.listGa4Connections().catch(() => []),
    ]);
    setAccounts(acc as AdAccount[]); setAdCampaigns(adc as AdCampaignRow[]);
    setOurCampaigns(oc as Campaign[]); setGa4(g as Ga4Connection[]);
    setLoading(false);
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  // Google sign-in return: reopen the wizard on the GA4 property-picker step.
  useEffect(() => {
    const err = params.get("ga4_error");
    const ok = params.get("ga4");
    if (!err && !ok) return;
    if (err) setToast(err);
    if (ok === "connected") { setResumeGa4(true); setConnectOpen(true); }
    router.replace("/settings/ads-analytics", { scroll: false });
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sync(id: string) {
    setSyncing(id);
    try { await api.syncAdAccount(id); setToast(t("settings.synced")); await loadAll(); }
    catch (e: any) { setToast(e?.message || t("settings.syncFailed")); }
    finally { setSyncing(null); }
  }
  async function removeAccount(a: AdAccount) {
    if (!(await confirm({ title: "Disconnect ad account?", message: `Disconnect ${a.name || a.external_account_id}? Its metrics will be removed.`, danger: true, confirmLabel: "Disconnect" }))) return;
    try { await api.deleteAdAccount(a.id); setToast(t("settings.disconnected")); setManageId(null); await loadAll(); }
    catch { setToast(t("broadcasts.failed")); }
  }
  async function removeGa4(c: Ga4Connection) {
    if (!(await confirm({ title: "Disconnect GA4?", message: `Remove the connection to property ${c.property_id}? Reports will stop showing landing-page data.`, danger: true, confirmLabel: "Disconnect" }))) return;
    try { await api.deleteGa4Connection(c.id); setToast(t("settings.disconnected")); await loadAll(); }
    catch { setToast(t("broadcasts.failed")); }
  }
  async function map(adCampId: string, campaignIds: string[]) {
    setAdCampaigns((p) => p.map((x) => (x.id === adCampId ? { ...x, campaign_ids: campaignIds, campaign_id: campaignIds[0] || null } : x)));
    try { await api.mapAdCampaign(adCampId, campaignIds); await loadAll(); }
    catch { setToast(t("settings.couldNotMap")); }
  }

  function closeWizard() { setConnectOpen(false); setResumeGa4(false); loadAll(); }

  const q = search.trim().toLowerCase();
  const visibleAccounts = useMemo(() => accounts.filter((a) => !q || (a.name || a.external_account_id).toLowerCase().includes(q)), [accounts, q]);
  const visibleGa4 = useMemo(() => ga4.filter((c) => !q || (c.name || c.property_id).toLowerCase().includes(q)), [ga4, q]);
  const managed = accounts.find((a) => a.id === manageId) || null;
  const total = accounts.length + ga4.length;

  const connectBtn = (
    <button onClick={() => { setResumeGa4(false); setConnectOpen(true); }} className="inline-flex items-center gap-2 px-3.5 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm transition-all outline-none">
      <Plus className="w-4 h-4" />{t("settings.connect")}
    </button>
  );

  return (
    <div className="px-6 py-6 w-full h-full flex flex-col min-h-0">
      <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col">
        {/* Toolbar */}
        <div className="p-3 flex items-center gap-2.5 border-b border-border flex-wrap shrink-0">
          <div className="relative w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input type="text" placeholder={t("settings.searchSources")} value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-muted text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </div>
          <div className="flex-1" />
          <button onClick={loadAll} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-background text-[12.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted outline-none"><RefreshCw className="w-3.5 h-3.5" /> {t("broadcasts.refresh")}</button>
          {connectBtn}
        </div>

        <div className="p-4 flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="h-40 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : total === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-muted grid place-items-center mx-auto mb-3"><BarChart3 className="w-6 h-6 text-muted-foreground/50" /></div>
              <p className="font-semibold text-foreground mb-0.5">{t("settings.noSourcesConnected")}</p>
              <p className="text-sm text-muted-foreground mb-4">{t("settings.connectAnAdAccountOr")}</p>
              {connectBtn}
            </div>
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {/* Ad accounts */}
              {visibleAccounts.map((a) => {
                const mapped = adCampaigns.filter((c) => c.account_name === a.name && c.campaign_id).length;
                return (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors">
                    <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0 text-white" style={{ background: PLATFORM_COLOR[a.platform] || "#64748b" }}><BarChart3 className="w-[18px] h-[18px]" /></div>
                    <div className="min-w-0 w-[220px] shrink-0">
                      <p className="font-semibold text-foreground truncate">{a.name || a.external_account_id}</p>
                      <p className="text-[11.5px] text-muted-foreground truncate">{PLATFORM_LABEL[a.platform] || a.platform}{a.currency ? ` · ${a.currency}` : ""}</p>
                    </div>
                    <div className="min-w-0 flex-1 hidden md:block">
                      {a.last_error ? (
                        <button onClick={() => setManageId(a.id)} className="text-left text-[11.5px] text-red-600 flex items-start gap-1 hover:underline outline-none max-w-full">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /><span className="line-clamp-1">{a.last_error} {t("settings.fixTheToken")}</span>
                        </button>
                      ) : (
                        <span className="text-[11.5px] text-muted-foreground">
                          {a.campaign_count > 0 ? `${a.campaign_count} campaign${a.campaign_count === 1 ? "" : "s"}${mapped ? ` · ${mapped} mapped` : ""}` : (a.last_synced_at ? t("settings.noCampaigns") : t("settings.neverSynced"))}
                        </span>
                      )}
                    </div>
                    <div className="hidden lg:flex flex-col items-end shrink-0 text-[11px] text-muted-foreground leading-tight whitespace-nowrap">
                      <span>{t("contacts.created")} {fmtDateTimeShort(a.created_at)}</span>
                      {a.updated_at && <span>{t("dashboard.updated")} {fmtDateTimeShort(a.updated_at)}</span>}
                    </div>
                    <span className={cn("px-2 py-0.5 rounded-md text-[11px] font-semibold shrink-0", a.status === "error" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600")}>{a.status}</span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => setManageId(a.id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground outline-none transition-colors" title={t("settings.editMap")}><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => sync(a.id)} disabled={syncing === a.id} className="p-1.5 rounded-md hover:bg-muted text-primary outline-none disabled:opacity-50 transition-colors" title={t("settings.syncNow")}><RefreshCw className={cn("w-4 h-4", syncing === a.id && "animate-spin")} /></button>
                      <button onClick={() => removeAccount(a)} className="p-1.5 rounded-md hover:bg-muted text-destructive outline-none transition-colors" title={t("settings.disconnect")}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                );
              })}

              {/* GA4 connections */}
              {visibleGa4.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors">
                  <div className="w-9 h-9 rounded-lg grid place-items-center shrink-0 text-white" style={{ background: "#E8710A" }}><LineChart className="w-[18px] h-[18px]" /></div>
                  <div className="min-w-0 w-[220px] shrink-0">
                    <p className="font-semibold text-foreground truncate">{c.name || `Property ${c.property_id}`}</p>
                    <p className="text-[11.5px] text-muted-foreground truncate">{t("settings.googleAnalytics4Id")} {c.property_id}</p>
                  </div>
                  <div className="min-w-0 flex-1 hidden md:block">
                    {c.last_error ? (
                      <span className="text-[11.5px] text-red-600 flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /><span className="line-clamp-1">{c.last_error}</span></span>
                    ) : (
                      <span className="text-[11.5px] text-muted-foreground">{c.campaign_name ? `Campaign: ${c.campaign_name}` : t("settings.allCampaignsOrgWide")}</span>
                    )}
                  </div>
                  <div className="hidden lg:flex flex-col items-end shrink-0 text-[11px] text-muted-foreground leading-tight whitespace-nowrap">
                    {c.last_synced_at && <span>{t("settings.synced")} {fmtDateTimeShort(c.last_synced_at)}</span>}
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold shrink-0 bg-emerald-50 text-emerald-600">connected</span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => removeGa4(c)} className="p-1.5 rounded-md hover:bg-muted text-destructive outline-none transition-colors" title={t("settings.disconnect")}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {connectOpen && (
        <AdWizard
          resumeGa4Pick={resumeGa4}
          onClose={closeWizard}
          onConnected={(msg) => { setConnectOpen(false); setResumeGa4(false); setToast(msg); loadAll(); }}
        />
      )}
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
