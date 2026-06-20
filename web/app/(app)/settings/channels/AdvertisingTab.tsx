"use client";
// Advertising — folded into Channel & Integrations as the "Advertising" tab.
// Connects Meta / TikTok / Google ad accounts, syncs spend + results, and maps
// ad campaigns to our campaigns for cost-per-lead / cost-per-sale.
import { useEffect, useMemo, useState } from "react";
import {
  Plus, RefreshCw, Trash2, X, Loader2, BarChart3, TrendingUp, AlertTriangle, Link2, Search,
} from "lucide-react";
import { api } from "@/lib/api";
import { Select } from "@/components/Select";
import { cn } from "@/lib/utils";
import type { AdAccount, AdCampaignRow, AdPerformance, Campaign } from "@/lib/types";

const PLATFORMS: Record<string, { label: string; live: boolean }> = {
  meta: { label: "Meta (Facebook/Instagram)", live: true },
  tiktok: { label: "TikTok", live: true },
  google: { label: "Google Ads", live: true },
};
const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const fmtNum = (n: number) => Math.round(n || 0).toLocaleString();
const fmtMoney = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function dateNDaysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

export function AdvertisingTab() {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [adCampaigns, setAdCampaigns] = useState<AdCampaignRow[]>([]);
  const [ourCampaigns, setOurCampaigns] = useState<Campaign[]>([]);
  const [perf, setPerf] = useState<AdPerformance | null>(null);
  const [range, setRange] = useState("30");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [dailyPage, setDailyPage] = useState(0);
  const [mapPage, setMapPage] = useState(0);
  const DAILY_PER = 12, MAP_PER = 10;

  const currency = accounts.find((a) => a.currency)?.currency || "";

  async function loadAll() {
    const to = new Date().toISOString().slice(0, 10);
    const from = dateNDaysAgo(Number(range));
    const [acc, adc, oc, p] = await Promise.all([
      api.listAdAccounts().catch(() => []),
      api.listAdCampaigns().catch(() => []),
      api.listCampaigns().catch(() => []),
      api.adPerformance(from, to).catch(() => null),
    ]);
    setAccounts(acc as AdAccount[]); setAdCampaigns(adc as AdCampaignRow[]);
    setOurCampaigns(oc as Campaign[]); setPerf(p as AdPerformance | null);
    setLoading(false);
  }
  useEffect(() => { loadAll(); }, [range]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const camps = perf?.campaigns || [];
  const daily = perf?.daily || [];
  const totals = useMemo(() => daily.reduce((a, d) => ({
    impressions: a.impressions + d.impressions, reach: a.reach + d.reach, clicks: a.clicks + d.clicks,
    results: a.results + d.results, spend: a.spend + d.spend,
  }), { impressions: 0, reach: 0, clicks: 0, results: 0, spend: 0 }), [daily]);
  const totalLeads = camps.reduce((a, c) => a + c.leads, 0);
  const totalSales = camps.reduce((a, c) => a + c.sales, 0);

  // Filters
  const platformOptions = useMemo(() => [{ value: "", label: "All platforms" }, ...Array.from(new Set(accounts.map((a) => a.platform))).map((p) => ({ value: p, label: PLATFORMS[p]?.label || p }))], [accounts]);
  const accountOptions = useMemo(() => [{ value: "", label: "All accounts" }, ...accounts.map((a) => ({ value: a.id, label: a.name || a.external_account_id }))], [accounts]);
  const q = search.trim().toLowerCase();
  const filteredCamps = useMemo(() => camps.filter((c) => !q || c.campaign_name.toLowerCase().includes(q)), [camps, q]);
  const filteredMap = useMemo(() => adCampaigns.filter((ac) =>
    (!platformFilter || ac.platform === platformFilter) &&
    (!accountFilter || (ac.account_name && accounts.find((a) => a.id === accountFilter)?.name === ac.account_name)) &&
    (!q || ac.name.toLowerCase().includes(q) || (ac.campaign_name || "").toLowerCase().includes(q))
  ), [adCampaigns, platformFilter, accountFilter, accounts, q]);
  const dailyPaged = daily.slice(dailyPage * DAILY_PER, dailyPage * DAILY_PER + DAILY_PER);
  const dailyPages = Math.max(1, Math.ceil(daily.length / DAILY_PER));
  const mapPaged = filteredMap.slice(mapPage * MAP_PER, mapPage * MAP_PER + MAP_PER);
  const mapPages = Math.max(1, Math.ceil(filteredMap.length / MAP_PER));
  useEffect(() => { setDailyPage(0); }, [daily.length]);
  useEffect(() => { setMapPage(0); }, [platformFilter, accountFilter, q]);

  const TH = ({ children, className }: { children?: React.ReactNode; className?: string }) =>
    <th className={cn("px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap", className)}>{children}</th>;
  const Stat = ({ label, value, icon: Icon }: { label: string; value: string; icon: any }) => (
    <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3 shadow-xs">
      <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center shrink-0"><Icon className="w-5 h-5 text-primary" /></div>
      <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className="text-lg font-bold text-foreground tabular-nums truncate">{value}</p></div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-6 max-w-[1280px] mx-auto w-full space-y-6">
        {/* Toolbar */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative w-[260px] max-w-[45vw]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input type="text" placeholder="Search campaigns" value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-card text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </div>
          {accounts.length > 0 && <Select value={platformFilter} onChange={setPlatformFilter} options={platformOptions} className="min-w-[150px]" />}
          {accounts.length > 1 && <Select value={accountFilter} onChange={setAccountFilter} options={accountOptions} className="min-w-[160px]" />}
          <Select value={range} onChange={setRange} options={RANGES} className="w-[150px]" searchable={false} />
          <div className="flex-1" />
          <button onClick={() => setConnectOpen(true)} className="inline-flex items-center gap-2 px-3.5 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm transition-all outline-none">
            <Plus className="w-4 h-4" />Connect ad account
          </button>
        </div>

        {loading ? (
          <div className="h-40 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : accounts.length === 0 ? (
          <div className="bg-card border border-border rounded-lg shadow-xs py-16 text-center">
            <div className="w-12 h-12 rounded-xl bg-muted grid place-items-center mx-auto mb-3"><BarChart3 className="w-6 h-6 text-muted-foreground/50" /></div>
            <p className="font-semibold text-foreground mb-0.5">No ad account connected</p>
            <p className="text-sm text-muted-foreground mb-4">Connect a Meta ad account to see spend, results and cost per lead/sale.</p>
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

            {/* Stat tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Spend" value={`${currency ? currency + " " : ""}${fmtMoney(totals.spend)}`} icon={TrendingUp} />
              <Stat label="Leads" value={fmtNum(totalLeads)} icon={BarChart3} />
              <Stat label="Cost / Lead" value={totalLeads ? `${currency ? currency + " " : ""}${fmtMoney(totals.spend / totalLeads)}` : "-"} icon={TrendingUp} />
              <Stat label="Cost / Sale" value={totalSales ? `${currency ? currency + " " : ""}${fmtMoney(totals.spend / totalSales)}` : "-"} icon={TrendingUp} />
            </div>

            {/* Campaign performance */}
            <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden">
              <div className="px-4 py-3 border-b border-border"><p className="font-bold text-[14px] text-foreground">Campaign performance</p></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border bg-muted/40">
                    <TH>Campaign</TH><TH className="text-right">Spend</TH><TH className="text-right">Leads</TH><TH className="text-right">Sales</TH>
                    <TH className="text-right">Cost/Lead</TH><TH className="text-right">Cost/Sale</TH><TH className="text-right">Impressions</TH><TH className="text-right">Clicks</TH><TH className="text-right">Results</TH>
                  </tr></thead>
                  <tbody>
                    {filteredCamps.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-10 text-muted-foreground text-sm">No data yet. Map ad campaigns below, then sync.</td></tr>
                    ) : filteredCamps.map((c) => (
                      <tr key={c.campaign_id} className="border-b border-border/60 hover:bg-muted/40">
                        <td className="px-4 py-2.5 font-semibold text-foreground">{c.campaign_name}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{currency ? currency + " " : ""}{fmtMoney(c.spend)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(c.leads)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-600">{fmtNum(c.sales)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{c.leads ? fmtMoney(c.spend / c.leads) : "-"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{c.sales ? fmtMoney(c.spend / c.sales) : "-"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmtNum(c.impressions)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmtNum(c.clicks)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmtNum(c.results)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Daily performance */}
            <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden">
              <div className="px-4 py-3 border-b border-border"><p className="font-bold text-[14px] text-foreground">Daily performance</p></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40"><tr className="border-b border-border">
                    <TH>Day</TH><TH className="text-right">Impressions</TH><TH className="text-right">Reach</TH><TH className="text-right">Link clicks</TH><TH className="text-right">Results</TH><TH className="text-right">CTR</TH><TH className="text-right">CPC</TH><TH className="text-right">Spend</TH>
                  </tr></thead>
                  <tbody>
                    {daily.length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">No metrics for this range.</td></tr>
                    ) : dailyPaged.map((d) => (
                      <tr key={d.date} className="border-b border-border/60 hover:bg-muted/40">
                        <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">{new Date(d.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(d.impressions)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(d.reach)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(d.clicks)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(d.results)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{d.impressions ? (d.clicks / d.impressions * 100).toFixed(2) + "%" : "-"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{d.clicks ? fmtMoney(d.spend / d.clicks) : "-"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{currency ? currency + " " : ""}{fmtMoney(d.spend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {daily.length > DAILY_PER && (
                <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border text-sm">
                  <span className="text-muted-foreground mx-2 tabular-nums">Page {dailyPage + 1} of {dailyPages}</span>
                  <button disabled={dailyPage <= 0} onClick={() => setDailyPage(dailyPage - 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none transition-colors">Prev</button>
                  <button disabled={dailyPage >= dailyPages - 1} onClick={() => setDailyPage(dailyPage + 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none transition-colors">Next</button>
                </div>
              )}
            </div>

            {/* Mapping */}
            <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="font-bold text-[14px] text-foreground">Map ad campaigns to your campaigns</p>
                <p className="text-[12px] text-muted-foreground">Mapping ties ad spend to your leads and sales for cost-per-lead / cost-per-sale.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border bg-muted/40"><TH>Ad campaign</TH><TH>Account</TH><TH className="text-right">Spend</TH><TH className="text-right">Impressions</TH><TH>Mapped to</TH></tr></thead>
                  <tbody>
                    {filteredMap.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">No ad campaigns yet. Connect an account and sync.</td></tr>
                    ) : mapPaged.map((ac) => (
                      <tr key={ac.id} className="border-b border-border/60 hover:bg-muted/40">
                        <td className="px-4 py-2.5 font-medium text-foreground"><span className="inline-flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5 text-muted-foreground" />{ac.name}</span></td>
                        <td className="px-4 py-2.5 text-muted-foreground">{ac.account_name}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{currency ? currency + " " : ""}{fmtMoney(ac.spend)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{fmtNum(ac.impressions)}</td>
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

      {connectOpen && <ConnectModal onClose={() => setConnectOpen(false)} onConnected={(msg) => { setConnectOpen(false); setToast(msg); loadAll(); }} />}
      {toast && <div className="fixed bottom-6 left-6 z-[110] animate-scale-in"><div className="px-4 py-2.5 rounded-lg bg-[#2D8B73] text-white text-sm font-semibold shadow-xl">{toast}</div></div>}
    </div>
  );
}

function ConnectModal({ onClose, onConnected }: { onClose: () => void; onConnected: (msg: string) => void }) {
  const [platform, setPlatform] = useState("meta");
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  // Google-only extras.
  const [devToken, setDevToken] = useState("");
  const [loginCid, setLoginCid] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const INP = "w-full h-10 px-3 rounded-md border border-input bg-background text-[13.5px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  const accountLabel = platform === "meta" ? "Ad account id (act_…)" : platform === "tiktok" ? "Advertiser id" : "Customer id";
  const accountPlaceholder = platform === "meta" ? "e.g. 1234567890 (without act_)" : platform === "tiktok" ? "TikTok advertiser id" : "e.g. 123-456-7890";
  const tokenLabel = platform === "google" ? "OAuth refresh token" : "Access token";
  const tokenHint = platform === "meta" ? "A long-lived token (or system-user token) with the ads_read permission."
    : platform === "tiktok" ? "A TikTok for Business access token with reporting access."
      : "An OAuth refresh token for an account with access to this customer.";

  async function save() {
    if (!accountId.trim() || !token.trim()) { setErr("Account id and access token are required."); return; }
    if (platform === "google" && (!devToken.trim() || !clientId.trim() || !clientSecret.trim())) {
      setErr("Google needs a developer token, client id and client secret."); return;
    }
    setSaving(true); setErr("");
    try {
      const config = platform === "google"
        ? { developer_token: devToken.trim(), login_customer_id: loginCid.trim(), client_id: clientId.trim(), client_secret: clientSecret.trim() }
        : undefined;
      const r = await api.createAdAccount({ platform, external_account_id: accountId.trim(), name: name.trim() || undefined, access_token: token.trim(), config });
      onConnected(r?.sync_error ? `Connected, but sync failed: ${r.sync_error}` : "Ad account connected");
    } catch (e: any) { setErr(e?.message || "Failed to connect"); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative w-[460px] rounded-lg border border-border bg-card shadow-2xl animate-scale-in">
        <div className="flex items-center px-5 py-3.5 border-b border-border">
          <p className="font-bold text-[15px] text-foreground flex-1">Connect ad account</p>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none"><X className="w-[18px] h-[18px]" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-red-600 text-[13px] font-medium">{err}</div>}
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-foreground/80">Platform</label>
            <Select value={platform} onChange={setPlatform} searchable={false}
              options={Object.entries(PLATFORMS).map(([v, p]) => ({ value: v, label: p.label }))} className="w-full" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-foreground/80">{accountLabel}</label>
            <input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder={accountPlaceholder} className={INP} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-foreground/80">Display name <span className="font-normal text-muted-foreground">(optional)</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main ad account" className={INP} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-foreground/80">{tokenLabel}</label>
            <input value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder={tokenLabel} className={INP} />
            <p className="text-[11.5px] text-muted-foreground">{tokenHint}</p>
          </div>
          {platform === "google" && (
            <div className="space-y-3 pt-1 border-t border-border">
              <p className="text-[12px] font-bold text-foreground/80 pt-2">Google Ads credentials</p>
              <input value={devToken} onChange={(e) => setDevToken(e.target.value)} placeholder="Developer token" className={INP} />
              <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="OAuth client id" className={INP} />
              <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} type="password" placeholder="OAuth client secret" className={INP} />
              <input value={loginCid} onChange={(e) => setLoginCid(e.target.value)} placeholder="Login customer id (manager account, optional)" className={INP} />
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm font-semibold text-foreground/70 hover:bg-muted outline-none">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-1.5 rounded-md text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-60 outline-none inline-flex items-center gap-2"> {saving && <Loader2 className="w-4 h-4 animate-spin" />}Connect</button>
        </div>
      </div>
    </div>
  );
}
