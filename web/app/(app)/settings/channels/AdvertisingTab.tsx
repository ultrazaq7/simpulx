"use client";
// Advertising — folded into Channel & Integrations as the "Advertising" tab.
// SETUP ONLY: connect Meta / TikTok / Google ad accounts and map ad campaigns to
// our campaigns. Reporting (spend, results, cost-per-lead) lives on the Dashboard.
import { useEffect, useMemo, useState } from "react";
import {
  Plus, RefreshCw, Trash2, Loader2, BarChart3, AlertTriangle, Link2, Search,
} from "lucide-react";
import { api } from "@/lib/api";
import { Select } from "@/components/Select";
import { cn } from "@/lib/utils";
import type { AdAccount, AdCampaignRow, Campaign } from "@/lib/types";
import { AdWizard } from "./AdWizard";

const PLATFORMS: Record<string, { label: string; live: boolean }> = {
  meta: { label: "Meta (Facebook/Instagram)", live: true },
  tiktok: { label: "TikTok", live: true },
  google: { label: "Google Ads", live: true },
};

export function AdvertisingTab() {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [adCampaigns, setAdCampaigns] = useState<AdCampaignRow[]>([]);
  const [ourCampaigns, setOurCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [mapPage, setMapPage] = useState(0);
  const MAP_PER = 12;

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
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);

  const ourCampOptions = useMemo(
    () => [{ value: "", label: "Not mapped" }, ...ourCampaigns.map((c) => ({ value: c.id, label: c.name }))],
    [ourCampaigns]);

  async function sync(id: string) {
    setSyncing(id);
    try { await api.syncAdAccount(id); setToast("Synced"); await loadAll(); }
    catch (e: any) { setToast(e?.message || "Sync failed"); }
    finally { setSyncing(null); }
  }
  async function remove(a: AdAccount) {
    if (!confirm(`Disconnect ${a.name || a.external_account_id}? Its metrics will be removed.`)) return;
    try { await api.deleteAdAccount(a.id); setToast("Disconnected"); await loadAll(); }
    catch { setToast("Failed"); }
  }
  async function map(adCampId: string, campaignId: string) {
    setAdCampaigns((p) => p.map((x) => (x.id === adCampId ? { ...x, campaign_id: campaignId || null } : x)));
    try { await api.mapAdCampaign(adCampId, campaignId || null); await loadAll(); }
    catch { setToast("Could not map"); }
  }

  // Filters (search + platform + account narrow the mapping list)
  const platformOptions = useMemo(() => [{ value: "", label: "All platforms" }, ...Array.from(new Set(accounts.map((a) => a.platform))).map((p) => ({ value: p, label: PLATFORMS[p]?.label || p }))], [accounts]);
  const accountOptions = useMemo(() => [{ value: "", label: "All accounts" }, ...accounts.map((a) => ({ value: a.id, label: a.name || a.external_account_id }))], [accounts]);
  const q = search.trim().toLowerCase();
  const filteredMap = useMemo(() => adCampaigns.filter((ac) =>
    (!platformFilter || ac.platform === platformFilter) &&
    (!accountFilter || (ac.account_name && accounts.find((a) => a.id === accountFilter)?.name === ac.account_name)) &&
    (!q || ac.name.toLowerCase().includes(q) || (ac.campaign_name || "").toLowerCase().includes(q))
  ), [adCampaigns, platformFilter, accountFilter, accounts, q]);
  const mapPaged = filteredMap.slice(mapPage * MAP_PER, mapPage * MAP_PER + MAP_PER);
  const mapPages = Math.max(1, Math.ceil(filteredMap.length / MAP_PER));
  useEffect(() => { setMapPage(0); }, [platformFilter, accountFilter, q]);

  const TH = ({ children, className }: { children?: React.ReactNode; className?: string }) =>
    <th className={cn("px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap", className)}>{children}</th>;

  return (
    <div className="px-6 py-6 w-full h-full flex flex-col min-h-0">
      <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col">
        {/* Toolbar */}
        <div className="p-3 flex items-center gap-2.5 border-b border-border flex-wrap shrink-0">
          <div className="relative w-[260px] max-w-[45vw]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input type="text" placeholder="Search campaigns" value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-muted text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </div>
          {accounts.length > 0 && <Select value={platformFilter} onChange={setPlatformFilter} options={platformOptions} className="min-w-[150px]" />}
          {accounts.length > 1 && <Select value={accountFilter} onChange={setAccountFilter} options={accountOptions} className="min-w-[160px]" />}
          <div className="flex-1" />
          <button onClick={() => setConnectOpen(true)} className="inline-flex items-center gap-2 px-3.5 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm transition-all outline-none">
            <Plus className="w-4 h-4" />Connect ad account
          </button>
        </div>

        <div className="overflow-auto flex-1 min-h-0 p-4 space-y-6">
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
          <>
            {/* Connected accounts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {accounts.map((a) => (
                <div key={a.id} className="bg-card border border-border rounded-lg p-4 shadow-xs">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate">{a.name || a.external_account_id}</p>
                      <p className="text-[12px] text-muted-foreground">{PLATFORMS[a.platform]?.label || a.platform}{a.currency ? ` · ${a.currency}` : ""}</p>
                    </div>
                    <span className={cn("px-2 py-0.5 rounded-md text-[11px] font-semibold shrink-0", a.status === "error" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600")}>{a.status}</span>
                  </div>
                  {a.last_error && <p className="mt-2 text-[11px] text-red-600 flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{a.last_error}</p>}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/60">
                    <span className="text-[11px] text-muted-foreground">{a.last_synced_at ? `Synced ${new Date(a.last_synced_at).toLocaleString()}` : "Never synced"}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => sync(a.id)} disabled={syncing === a.id} className="p-1.5 rounded-md hover:bg-muted text-primary outline-none disabled:opacity-50" title="Sync now"><RefreshCw className={cn("w-4 h-4", syncing === a.id && "animate-spin")} /></button>
                      <button onClick={() => remove(a)} className="p-1.5 rounded-md hover:bg-muted text-destructive outline-none" title="Disconnect"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Mapping (setup) */}
            <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="font-bold text-[14px] text-foreground">Map ad campaigns to your campaigns</p>
                <p className="text-[12px] text-muted-foreground">Mapping ties each ad campaign to one of your campaigns. Cost-per-lead and results appear on the Dashboard.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border bg-muted/40"><TH>Ad campaign</TH><TH>Account</TH><TH>Mapped to</TH></tr></thead>
                  <tbody>
                    {filteredMap.length === 0 ? (
                      <tr><td colSpan={3} className="text-center py-10 text-muted-foreground text-sm">No ad campaigns yet. Connect an account and sync.</td></tr>
                    ) : mapPaged.map((ac) => (
                      <tr key={ac.id} className="border-b border-border/60 hover:bg-muted/40">
                        <td className="px-4 py-2.5 font-medium text-foreground"><span className="inline-flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5 text-muted-foreground" />{ac.name}</span></td>
                        <td className="px-4 py-2.5 text-muted-foreground">{ac.account_name}</td>
                        <td className="px-4 py-2.5"><Select value={ac.campaign_id || ""} onChange={(v) => map(ac.id, v)} options={ourCampOptions} className="w-[220px]" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredMap.length > MAP_PER && (
                <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border text-sm">
                  <span className="text-muted-foreground mx-2 tabular-nums">Page {mapPage + 1} of {mapPages}</span>
                  <button disabled={mapPage <= 0} onClick={() => setMapPage(mapPage - 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none transition-colors">Prev</button>
                  <button disabled={mapPage >= mapPages - 1} onClick={() => setMapPage(mapPage + 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none transition-colors">Next</button>
                </div>
              )}
            </div>
          </>
        )}
        </div>
      </div>

      {connectOpen && <AdWizard onClose={() => setConnectOpen(false)} onConnected={(msg) => { setConnectOpen(false); setToast(msg); loadAll(); }} />}
      {toast && <div className="fixed bottom-6 left-6 z-[110] animate-scale-in"><div className="px-4 py-2.5 rounded-lg bg-[#2D8B73] text-white text-sm font-semibold shadow-xl">{toast}</div></div>}
    </div>
  );
}
