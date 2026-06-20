"use client";
// Connect Ad Account — 3-step wizard (Select platform > Credentials > Done).
// Wraps the real createAdAccount endpoint; mirrors the Create Channel wizard.
import { useState } from "react";
import { BarChart3, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { WizardModal, WizardCard, WizardField, BackButton, ContinueButton } from "./WizardModal";
import { PrimaryButton } from "../_shared";

const PLATFORMS: Record<string, { label: string; sub: string; color: string }> = {
  meta:   { label: "Meta", sub: "Facebook / Instagram Ads", color: "#1877F2" },
  tiktok: { label: "TikTok", sub: "TikTok for Business", color: "#111111" },
  google: { label: "Google Ads", sub: "Google Ads API", color: "#EA4335" },
};

const STEPS = ["Select platform", "Credentials", "Done"];

function Tile({ color }: { color: string }) {
  return <div className="w-10 h-10 rounded-lg grid place-items-center text-white shrink-0" style={{ background: color }}><BarChart3 className="w-5 h-5" /></div>;
}

export function AdWizard({ onClose, onConnected }: { onClose: () => void; onConnected: (msg: string) => void }) {
  const [step, setStep] = useState(0);
  const [platform, setPlatform] = useState("");
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [devToken, setDevToken] = useState("");
  const [loginCid, setLoginCid] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ syncError?: string } | null>(null);

  const accountLabel = platform === "meta" ? "Ad account id (act_...)" : platform === "tiktok" ? "Advertiser id" : "Customer id";
  const accountPlaceholder = platform === "meta" ? "e.g. 1234567890 (without act_)" : platform === "tiktok" ? "TikTok advertiser id" : "e.g. 123-456-7890";
  const tokenLabel = platform === "google" ? "OAuth refresh token" : "Access token";
  const tokenHint = platform === "meta" ? "A long-lived token (or system-user token) with the ads_read permission."
    : platform === "tiktok" ? "A TikTok for Business access token with reporting access."
      : "An OAuth refresh token for an account with access to this customer.";

  async function connect() {
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
      setResult({ syncError: r?.sync_error }); setStep(2);
    } catch (e: any) { setErr(e?.message || "Failed to connect"); }
    finally { setSaving(false); }
  }

  const footer =
    step === 0 ? (<><div className="flex-1" /><ContinueButton onClick={() => platform && setStep(1)} disabled={!platform} /></>)
    : step === 1 ? (<><BackButton onClick={() => { setErr(""); setStep(0); }} /><div className="flex-1" />
        <PrimaryButton onClick={connect} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Connect</PrimaryButton></>)
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
          <WizardField label={tokenLabel} value={token} onChange={setToken} type="password" hint={tokenHint} />
          {platform === "google" && (
            <div className="flex flex-col gap-3 pt-1 border-t border-border">
              <p className="text-[12px] font-bold text-foreground/80 pt-2">Google Ads credentials</p>
              <WizardField label="Developer token" value={devToken} onChange={setDevToken} />
              <WizardField label="OAuth client id" value={clientId} onChange={setClientId} />
              <WizardField label="OAuth client secret" value={clientSecret} onChange={setClientSecret} type="password" />
              <WizardField label="Login customer id (manager account, optional)" value={loginCid} onChange={setLoginCid} />
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="text-center py-6">
          <div className="inline-flex mb-4"><Tile color={PLATFORMS[platform]?.color || "#1877F2"} /></div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <CheckCircle2 className={result?.syncError ? "w-5 h-5 text-warning" : "w-5 h-5 text-success"} />
            <p className="font-bold text-[16px] text-foreground">{PLATFORMS[platform]?.label} account connected</p>
          </div>
          <p className="text-[13px] text-muted-foreground max-w-[460px] mx-auto">
            {result?.syncError ? "Connected, but the first sync failed. You can retry sync from the account card." : "Spend, results and campaigns will appear after the first sync."}
          </p>
          {result?.syncError && (
            <div className="mt-4 mx-auto max-w-[480px] px-3 py-2 rounded-md bg-warning/10 border border-warning/30 text-[12px] text-left text-foreground/80 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px text-warning" />{result.syncError}
            </div>
          )}
        </div>
      )}
    </WizardModal>
  );
}
