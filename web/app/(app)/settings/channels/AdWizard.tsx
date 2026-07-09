"use client";
// Connect Ad Account — 3-step wizard (Select platform > Credentials > Map campaigns).
// Wraps the real createAdAccount endpoint; mirrors the Create Channel wizard.
import { useMemo, useState } from "react";
import { BarChart3, Loader2, CheckCircle2, AlertTriangle, Link2 } from "lucide-react";
import { api } from "@/lib/api";
import { MultiSelect } from "@/components/ui/multi-select";
import type { AdAccount, AdCampaignRow, Campaign } from "@/lib/types";
import { WizardModal, WizardCard, WizardField, BackButton, ContinueButton } from "./WizardModal";
import { PrimaryButton } from "../_shared";

const PLATFORMS: Record<string, { label: string; sub: string; color: string }> = {
  meta:   { label: "Meta", sub: "Facebook / Instagram Ads", color: "#1877F2" },
  tiktok: { label: "TikTok", sub: "TikTok for Business", color: "#111111" },
  google: { label: "Google Ads", sub: "Google Ads API", color: "#EA4335" },
};

const STEPS = ["Select platform", "Credentials", "Map campaigns"];

function Tile({ color }: { color: string }) {
  return <div className="w-10 h-10 rounded-lg grid place-items-center text-white shrink-0" style={{ background: color }}><BarChart3 className="w-5 h-5" /></div>;
}

export function AdWizard({ onClose, onConnected }: { onClose: () => void; onConnected: (msg: string) => void }) {
  const [step, setStep] = useState(0);
  const [platform, setPlatform] = useState("");
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ syncError?: string } | null>(null);
  const [adCampaigns, setAdCampaigns] = useState<AdCampaignRow[]>([]);
  const [ourCampaigns, setOurCampaigns] = useState<Campaign[]>([]);

  const accountLabel = platform === "meta" ? "Ad account id (act_...)" : platform === "tiktok" ? "Advertiser id" : "Customer id";
  const accountPlaceholder = platform === "meta" ? "e.g. 1234567890 (without act_)" : platform === "tiktok" ? "TikTok advertiser id" : "e.g. 123-456-7890";
  const tokenLabel = platform === "google" ? "OAuth refresh token" : "Access token";
  const tokenHint = platform === "meta" ? "A long-lived token (or system-user token) with the ads_read permission."
    : "A TikTok for Business access token with reporting access.";

  const ourCampOptions = useMemo(
    () => ourCampaigns.map((c) => ({ value: c.id, label: c.name })),
    [ourCampaigns]);

  async function connect() {
    if (platform === "google" || platform === "meta") {
      if (!accountId.trim()) { setErr(platform === "google" ? "Customer id is required." : "Ad account id is required."); return; }
      setSaving(true); setErr("");
      try {
        const res = platform === "google" 
          ? await api.connectGoogleAds(accountId.trim(), name.trim() || undefined)
          : await api.connectMetaAds(accountId.trim(), name.trim() || undefined);
        window.location.href = res.url;
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
        const [acc, adc, oc] = await Promise.all([api.listAdAccounts().catch(() => []), api.listAdCampaigns().catch(() => []), api.listCampaigns().catch(() => [])]);
        const acctName = (acc as AdAccount[]).find((x) => x.id === r.id)?.name || name.trim();
        setAdCampaigns((adc as AdCampaignRow[]).filter((c) => c.account_name === acctName));
        setOurCampaigns(oc as Campaign[]);
      } catch { /* mapping step just shows the empty state */ }
      setStep(2);
    } catch (e: any) { setErr(e?.message || "Failed to connect"); }
    finally { setSaving(false); }
  }

  async function map(adCampId: string, campaignIds: string[]) {
    setAdCampaigns((p) => p.map((x) => (x.id === adCampId ? { ...x, campaign_ids: campaignIds, campaign_id: campaignIds[0] || null } : x)));
    try { await api.mapAdCampaign(adCampId, campaignIds); } catch { /* optimistic; can retry from Edit dialog */ }
  }

  const footer =
    step === 0 ? (<><div className="flex-1" /><ContinueButton onClick={() => platform && setStep(1)} disabled={!platform} /></>)
    : step === 1 ? (<><BackButton onClick={() => { setErr(""); setStep(0); }} /><div className="flex-1" />
        <PrimaryButton onClick={connect} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{platform === "google" ? "Sign in with Google" : platform === "meta" ? "Sign in with Facebook" : "Connect"}</PrimaryButton></>)
    : (<><div className="flex-1" /><PrimaryButton onClick={() => onConnected(result?.syncError ? `Connected, but sync failed: ${result.syncError}` : "Ad account connected")}>Done</PrimaryButton></>);

  return (
    <WizardModal title="Connect ad account" icon={<BarChart3 className="w-5 h-5" />} steps={STEPS} step={step} onClose={onClose} footer={footer}>
      {step === 0 && (
        <div>
          <p className="text-[13.5px] text-muted-foreground mb-4">Choose the platform to pull spend, results and cost per lead/sale from.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {Object.entries(PLATFORMS).map(([v, p]) => (
              <WizardCard key={v} icon={<Tile color={p.color} />} title={p.label} desc={p.sub} active={platform === v} onClick={() => setPlatform(v)} />
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          {err && <div className="px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-[13px] font-medium">{err}</div>}
          <WizardField label={accountLabel} value={accountId} onChange={setAccountId} placeholder={accountPlaceholder} autoFocus />
          <WizardField label="Display name (optional)" value={name} onChange={setName} placeholder="e.g. Main ad account" />
          {platform !== "google" && platform !== "meta" && (
            <WizardField label={tokenLabel} value={token} onChange={setToken} type="password" hint={tokenHint} />
          )}
        </div>
      )}

      {step === 2 && (
        <div className="py-1">
          <div className="text-center mb-5">
            <div className="inline-flex mb-3"><Tile color={PLATFORMS[platform]?.color || "#1877F2"} /></div>
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
