"use client";
// Connect a data source — ONE wizard for ad accounts AND Google Analytics.
// Step 0 picks the source (Meta / TikTok / Google Ads / GA4); the rest of the flow
// adapts. Ad platforms: Credentials > Map campaigns. GA4: Sign in > Pick property.
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Loader2, CheckCircle2, AlertTriangle, Link2, LineChart, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select } from "@/components/Select";
import type { AdAccount, AdCampaignRow, Campaign, Ga4Property } from "@/lib/types";
import { WizardModal, WizardCard, WizardField, BackButton, ContinueButton } from "./WizardModal";
import { PrimaryButton, FieldLabel, INPUT_CLASS } from "../_shared";

const PLATFORMS: Record<string, { label: string; sub: string; color: string; kind: "ads" | "ga4" }> = {
  meta:   { label: "Meta Ads", sub: "Facebook / Instagram Ads", color: "#1877F2", kind: "ads" },
  tiktok: { label: "TikTok Ads", sub: "TikTok for Business", color: "#111111", kind: "ads" },
  google: { label: "Google Ads", sub: "Google Ads API", color: "#EA4335", kind: "ads" },
  ga4:    { label: "Google Analytics 4", sub: "Landing-page sessions & engagement", color: "#E8710A", kind: "ga4" },
};

// Multicolour Google "G" so the sign-in button reads as the real Google button.
function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function Tile({ color, kind }: { color: string; kind: "ads" | "ga4" }) {
  return <div className="w-10 h-10 rounded-lg grid place-items-center text-white shrink-0" style={{ background: color }}>{kind === "ga4" ? <LineChart className="w-5 h-5" /> : <BarChart3 className="w-5 h-5" />}</div>;
}

// resumeGa4Pick: reopen straight on the GA4 property picker after the Google redirect.
export function AdWizard({ onClose, onConnected, resumeGa4Pick }: { onClose: () => void; onConnected: (msg: string) => void; resumeGa4Pick?: boolean }) {
  const [step, setStep] = useState(resumeGa4Pick ? 2 : 0);
  const [platform, setPlatform] = useState(resumeGa4Pick ? "ga4" : "");
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [manualToken, setManualToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ syncError?: string } | null>(null);
  const [adCampaigns, setAdCampaigns] = useState<AdCampaignRow[]>([]);
  const [ourCampaigns, setOurCampaigns] = useState<Campaign[]>([]);

  // GA4 branch state
  const [gaProps, setGaProps] = useState<Ga4Property[]>([]);
  const [gaProperty, setGaProperty] = useState("");
  const [gaCampaign, setGaCampaign] = useState("");
  const [gaManualOpen, setGaManualOpen] = useState(false);
  const [gaManualToken, setGaManualToken] = useState("");
  const [gaLoadingProps, setGaLoadingProps] = useState(false);

  const isGa4 = platform === "ga4";

  // Campaigns are needed by both branches (ad mapping + GA4 map-to-campaign).
  useEffect(() => { api.listCampaigns().then((c) => setOurCampaigns(c as Campaign[])).catch(() => {}); }, []);

  // Resuming after the Google redirect: fetch the pending GA4 properties.
  useEffect(() => {
    if (!resumeGa4Pick) return;
    setGaLoadingProps(true);
    api.ga4PendingProperties()
      .then((r) => { setGaProps(r.properties || []); if (r.error) setErr(r.error); if (r.properties?.length) setGaProperty(r.properties[0].property_id); })
      .catch(() => {})
      .finally(() => setGaLoadingProps(false));
  }, [resumeGa4Pick]);

  const accountLabel = platform === "meta" ? "Ad account id (act_...)" : platform === "tiktok" ? "Advertiser id" : "Customer id";
  const accountPlaceholder = platform === "meta" ? "e.g. 1234567890 (without act_)" : platform === "tiktok" ? "TikTok advertiser id" : "e.g. 123-456-7890";
  const tokenLabel = platform === "google" ? "OAuth refresh token" : "Access token";
  const tokenHint = platform === "meta" ? "A long-lived token (or system-user token) with the ads_read permission."
    : "A TikTok for Business access token with reporting access.";

  const ourCampOptions = useMemo(() => ourCampaigns.map((c) => ({ value: c.id, label: c.name })), [ourCampaigns]);
  const gaCampaignOptions = useMemo(() => [{ value: "", label: "All campaigns (org-wide)" }, ...ourCampaigns.map((c) => ({ value: c.id, label: c.name }))], [ourCampaigns]);

  const STEPS = isGa4 ? ["Select source", "Sign in", "Pick property"] : ["Select source", "Credentials", "Map campaigns"];

  async function connect() {
    if (platform === "google" || ((platform === "meta" || platform === "tiktok") && !manualToken)) {
      if (!accountId.trim()) { setErr(platform === "google" ? "Customer id is required." : platform === "tiktok" ? "Advertiser id is required." : "Ad account id is required."); return; }
      setSaving(true); setErr("");
      try {
        if (platform === "google") {
          const res = await api.connectGoogleAds(accountId.trim(), name.trim() || undefined);
          window.location.href = res.url;
        } else if (platform === "tiktok") {
          const res = await api.connectTikTokAds(accountId.trim(), name.trim() || undefined);
          window.location.href = res.url;
        } else {
          const res = await api.connectMetaAds(accountId.trim(), name.trim() || undefined);
          window.location.href = res.url;
        }
      } catch (e: any) { setErr(e?.message || `Failed to start ${PLATFORMS[platform]?.label} connection`); setSaving(false); }
      return;
    }
    if (!accountId.trim() || !token.trim()) { setErr("Account id and access token are required."); return; }
    setSaving(true); setErr("");
    try {
      const r = await api.createAdAccount({ platform, external_account_id: accountId.trim(), name: name.trim() || undefined, access_token: token.trim() });
      setResult({ syncError: r?.sync_error });
      // The first sync ran server-side; pull this account's campaigns so they can be mapped now.
      try {
        const [acc, adc] = await Promise.all([api.listAdAccounts().catch(() => []), api.listAdCampaigns().catch(() => [])]);
        const acctName = (acc as AdAccount[]).find((x) => x.id === r.id)?.name || name.trim();
        setAdCampaigns((adc as AdCampaignRow[]).filter((c) => c.account_name === acctName));
      } catch { /* mapping step just shows the empty state */ }
      setStep(2);
    } catch (e: any) { setErr(e?.message || "Failed to connect"); }
    finally { setSaving(false); }
  }

  async function map(adCampId: string, campaignIds: string[]) {
    setAdCampaigns((p) => p.map((x) => (x.id === adCampId ? { ...x, campaign_ids: campaignIds, campaign_id: campaignIds[0] || null } : x)));
    try { await api.mapAdCampaign(adCampId, campaignIds); } catch { /* optimistic; can retry from Edit dialog */ }
  }

  // ── GA4 actions ──
  async function ga4SignIn() {
    setSaving(true); setErr("");
    try { const { url } = await api.ga4OAuthUrl(); window.location.href = url; }
    catch (e: any) { setErr(e?.message || String(e)); setSaving(false); }
  }
  async function ga4ManualConnect() {
    if (!accountId.trim() || !gaManualToken.trim()) { setErr("Property id and refresh token are required."); return; }
    setSaving(true); setErr("");
    try {
      await api.createGa4Connection({ property_id: accountId.trim(), refresh_token: gaManualToken.trim(), campaign_id: gaCampaign || undefined });
      onConnected("Google Analytics connected");
    } catch (e: any) { setErr(e?.message || String(e)); setSaving(false); }
  }
  async function ga4Finish() {
    if (!gaProperty) return;
    setSaving(true); setErr("");
    try {
      const prop = gaProps.find((p) => p.property_id === gaProperty);
      await api.finishGa4Connection({ property_id: gaProperty, name: prop?.display_name, campaign_id: gaCampaign || undefined });
      onConnected("Google Analytics connected");
    } catch (e: any) { setErr(e?.message || String(e)); setSaving(false); }
  }

  const footer =
    step === 0 ? (<><div className="flex-1" /><ContinueButton onClick={() => platform && setStep(1)} disabled={!platform} /></>)
    : step === 1 && isGa4 ? (<><BackButton onClick={() => { setErr(""); setStep(0); }} /><div className="flex-1" /></>)
    : step === 1 ? (<><BackButton onClick={() => { setErr(""); setStep(0); }} /><div className="flex-1" />
        <PrimaryButton onClick={connect} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{platform === "google" ? "Sign in with Google" : (platform === "meta" && !manualToken) ? "Sign in with Facebook" : (platform === "tiktok" && !manualToken) ? "Sign in with TikTok" : "Connect"}</PrimaryButton></>)
    : isGa4 ? (<><div className="flex-1" /><PrimaryButton onClick={ga4Finish} disabled={saving || !gaProperty}>{saving && <Loader2 className="w-4 h-4 animate-spin" />} Connect property</PrimaryButton></>)
    : (<><div className="flex-1" /><PrimaryButton onClick={() => onConnected(result?.syncError ? `Connected, but sync failed: ${result.syncError}` : "Ad account connected")}>Done</PrimaryButton></>);

  return (
    <WizardModal title="Connect a data source" icon={<BarChart3 className="w-5 h-5" />} steps={STEPS} step={step} onClose={onClose} footer={footer}>
      {step === 0 && (
        <div>
          <p className="text-[13.5px] text-muted-foreground mb-4">Choose what to connect. Ad platforms pull spend, results and cost per lead; Google Analytics adds landing-page sessions and engagement.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {Object.entries(PLATFORMS).map(([v, p]) => (
              <WizardCard key={v} icon={<Tile color={p.color} kind={p.kind} />} title={p.label} desc={p.sub} active={platform === v} onClick={() => setPlatform(v)} />
            ))}
          </div>
        </div>
      )}

      {/* Ad-platform credentials */}
      {step === 1 && !isGa4 && (
        <div className="flex flex-col gap-4">
          {err && <div className="px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-[13px] font-medium">{err}</div>}
          <WizardField label={accountLabel} value={accountId} onChange={setAccountId} placeholder={accountPlaceholder} autoFocus />
          <WizardField label="Display name (optional)" value={name} onChange={setName} placeholder="e.g. Main ad account" />
          {(platform === "meta" || platform === "tiktok") && (
            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" checked={manualToken} onChange={(e) => setManualToken(e.target.checked)} className="rounded border-border text-primary focus:ring-primary" />
              <span className="text-[13px] text-muted-foreground">Advanced: Use manual Access Token (Permanent)</span>
            </label>
          )}
          {(platform !== "google" && platform !== "meta" && platform !== "tiktok") || ((platform === "meta" || platform === "tiktok") && manualToken) ? (
            <WizardField label={tokenLabel} value={token} onChange={setToken} type="password" hint={tokenHint} />
          ) : null}
        </div>
      )}

      {/* GA4 sign-in + manual fallback */}
      {step === 1 && isGa4 && (
        <div className="flex flex-col gap-3">
          {err && <div className="px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-[13px] font-medium">{err}</div>}
          <button onClick={ga4SignIn} disabled={saving}
            className="inline-flex items-center justify-center gap-2.5 h-11 px-5 rounded-md border border-border bg-card text-[14px] font-semibold text-foreground hover:bg-muted disabled:opacity-60 outline-none transition-colors shadow-xs">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleG className="w-5 h-5" />} Sign in with Google
          </button>
          <p className="text-[12px] text-muted-foreground">Read-only access (analytics.readonly). We open Google&apos;s consent screen, then bring you back here to pick a property.</p>
          <div>
            <FieldLabel>Map to campaign (optional)</FieldLabel>
            <Select value={gaCampaign} onChange={setGaCampaign} options={gaCampaignOptions} placeholder="All campaigns (org-wide)" />
          </div>
          <button onClick={() => setGaManualOpen((o) => !o)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground outline-none self-start mt-1">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${gaManualOpen ? "rotate-180" : ""}`} /> Enter a property id and refresh token manually
          </button>
          {gaManualOpen && (
            <div className="rounded-lg border border-border p-4 flex flex-col gap-2.5">
              <div><FieldLabel>GA4 property id</FieldLabel><input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="e.g. 123456789" className={INPUT_CLASS} /></div>
              <div><FieldLabel>OAuth refresh token (analytics.readonly)</FieldLabel><input value={gaManualToken} onChange={(e) => setGaManualToken(e.target.value)} placeholder="1//0g..." className={INPUT_CLASS} /></div>
              <div className="flex justify-end"><PrimaryButton onClick={ga4ManualConnect} disabled={saving || !accountId.trim() || !gaManualToken.trim()}>{saving && <Loader2 className="w-4 h-4 animate-spin" />} Connect</PrimaryButton></div>
            </div>
          )}
        </div>
      )}

      {/* GA4 property picker (after the Google redirect) */}
      {step === 2 && isGa4 && (
        <div className="flex flex-col gap-3">
          {err && <div className="px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-[13px] font-medium">{err}</div>}
          {gaLoadingProps ? (
            <div className="h-24 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : gaProps.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No GA4 properties were found for this Google account. Make sure it has access to a GA4 property (and the Analytics Admin API is enabled), then try again.</p>
          ) : (
            <>
              <p className="text-[13px] font-semibold text-foreground">Google connected. Choose the property to sync.</p>
              <div><FieldLabel>GA4 property</FieldLabel>
                <Select value={gaProperty} onChange={setGaProperty} options={gaProps.map((p) => ({ value: p.property_id, label: `${p.display_name} · ${p.account_name} (${p.property_id})` }))} /></div>
              <div><FieldLabel>Map to campaign (optional)</FieldLabel>
                <Select value={gaCampaign} onChange={setGaCampaign} options={gaCampaignOptions} placeholder="All campaigns (org-wide)" /></div>
            </>
          )}
        </div>
      )}

      {/* Ad-platform map-campaigns success step */}
      {step === 2 && !isGa4 && (
        <div className="py-1">
          <div className="text-center mb-5">
            <div className="inline-flex mb-3"><Tile color={PLATFORMS[platform]?.color || "#1877F2"} kind="ads" /></div>
            <div className="flex items-center justify-center gap-2 mb-1">
              <CheckCircle2 className={result?.syncError ? "w-5 h-5 text-warning" : "w-5 h-5 text-success"} />
              <p className="font-bold text-[16px] text-foreground">{PLATFORMS[platform]?.label} account connected</p>
            </div>
            <p className="text-[13px] text-muted-foreground max-w-[460px] mx-auto">
              {result?.syncError ? "Connected, but the first sync failed. Fix the token from the account card, then sync." : "Map this account's campaigns to yours so spend ties to leads on the Dashboard."}
            </p>
          </div>

          {result?.syncError ? (
            <div className="mx-auto max-w-[480px] px-3 py-2 rounded-md bg-warning/10 border border-warning/30 text-[12px] text-left text-foreground/80 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px text-warning" />{result.syncError}
            </div>
          ) : adCampaigns.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground py-3 text-center bg-muted/40 rounded-md">No campaigns synced yet. You can map them later from the account's Edit dialog.</p>
          ) : (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Map campaigns (optional)</p>
              <div className="flex flex-col divide-y divide-border/60 rounded-md border border-border overflow-hidden max-h-[280px] overflow-y-auto">
                {adCampaigns.map((ac) => (
                  <div key={ac.id} className="flex items-center gap-2 px-3 py-2.5">
                    <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[13px] font-medium text-foreground flex-1 truncate">{ac.name}</span>
                    <MultiSelect value={ac.campaign_ids || (ac.campaign_id ? [ac.campaign_id] : [])} onChange={(v) => map(ac.id, v)} options={ourCampOptions} placeholder="Not mapped" className="w-[200px]" />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground/70 mt-2">You can change these anytime from the account's Edit dialog.</p>
            </div>
          )}
        </div>
      )}
    </WizardModal>
  );
}
