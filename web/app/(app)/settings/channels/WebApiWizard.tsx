"use client";
// Add API Source — 3-step wizard (Source type > Details > Done). The final step
// reveals the generated API key + a ready-to-copy curl snippet, so connecting an
// external lead source feels like a guided enterprise onboarding.
import { useState } from "react";
import { Plug, Loader2, Copy, Check, CheckCircle2, Key } from "lucide-react";
import { api } from "@/lib/api";
import { Select } from "@/components/Select";
import type { Campaign, SourcePlatform } from "@/lib/types";
import { WizardModal, WizardCard, WizardField, BackButton, ContinueButton } from "./WizardModal";
import { FieldLabel, PrimaryButton } from "../_shared";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const STEPS = ["Source type", "Details", "Done"];

const PRESETS = [
  { key: "meta",   label: "Meta Lead Ads",     sub: "Facebook / Instagram lead forms", color: "#1877F2", name: "Meta Ads",   slug: "meta-ads" },
  { key: "tiktok", label: "TikTok Lead Gen",   sub: "TikTok instant forms",            color: "#111111", name: "TikTok Ads", slug: "tiktok-ads" },
  { key: "google", label: "Google Lead Forms", sub: "Google lead form extensions",     color: "#EA4335", name: "Google Ads", slug: "google-ads" },
  { key: "custom", label: "Custom / Other",    sub: "Any external system via API",     color: "#8B5CF6", name: "",           slug: "" },
];

function Tile({ color }: { color: string }) {
  return <div className="w-10 h-10 rounded-lg grid place-items-center text-white shrink-0" style={{ background: color }}><Plug className="w-5 h-5" /></div>;
}

function CopyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-muted/50">
        <span className={`flex-1 truncate text-[12px] text-foreground/80 ${mono ? "font-mono" : ""}`}>{value}</span>
        <button onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="shrink-0 text-muted-foreground hover:text-foreground outline-none transition-colors">
          {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export function WebApiWizard({ campaigns, onClose, onCreated }: {
  campaigns: Campaign[]; onClose: () => void; onCreated: (msg: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [preset, setPreset] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [template, setTemplate] = useState("");
  const [webhook, setWebhook] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [created, setCreated] = useState<{ apiKey: string } | null>(null);

  function choosePreset(p: typeof PRESETS[number]) {
    setPreset(p.key);
    if (p.key !== "custom") { setName(p.name); setSlug(p.slug); }
  }

  async function create() {
    if (!name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr("");
    try {
      // The preset picked in step 0 IS the platform - send it, instead of
      // discarding it after prefilling name/slug. Without this every Web API
      // lead showed up as a generic "Ad"/"web" everywhere downstream (contacts,
      // exports, logs), even though the admin told us right here which
      // platform (Meta/TikTok/Google) the source is for.
      const platform: SourcePlatform = preset === "custom" || preset === "" ? "other" : (preset as SourcePlatform);
      const r = await api.createWebApiSource({
        name: name.trim(), slug: slug.trim() || undefined,
        auto_template_name: template.trim() || undefined, webhook_url: webhook.trim() || undefined,
        campaign_id: campaignId || undefined, platform,
      });
      // The create response carries only the id; fetch the row to reveal its key.
      const all = await api.listWebApiSources().catch(() => []);
      const row = all.find((x) => x.id === r.id);
      setCreated({ apiKey: row?.api_key ?? "" });
      setStep(2);
    } catch (e) { setErr(String(e)); }
    finally { setSaving(false); }
  }

  const httpSample = `POST ${API}/v1/leads\nX-API-Key: ${created?.apiKey || "<KEY>"}\n{ "phone": "+62812...", "name": "Lead name", "message": "Interested in a Brio" }`;

  const footer =
    step === 0 ? (<><div className="flex-1" /><ContinueButton onClick={() => preset && setStep(1)} disabled={!preset} /></>)
    : step === 1 ? (<><BackButton onClick={() => { setErr(""); setStep(0); }} /><div className="flex-1" />
        <PrimaryButton onClick={create} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Create</PrimaryButton></>)
    : (<><div className="flex-1" /><PrimaryButton onClick={() => onCreated("API source created")}>Done</PrimaryButton></>);

  return (
    <WizardModal title="Add API source" icon={<Plug className="w-5 h-5" />} steps={STEPS} step={step} onClose={onClose} footer={footer}>
      {step === 0 && (
        <div>
          <p className="text-[13.5px] text-muted-foreground mb-4">Pick where the leads come from. We generate an API key you point that source to.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {PRESETS.map((p) => (
              <WizardCard key={p.key} icon={<Tile color={p.color} />} title={p.label} desc={p.sub} active={preset === p.key} onClick={() => choosePreset(p)} />
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          {err && <div className="px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-[13px] font-medium">{err}</div>}
          <WizardField label="Name" value={name} onChange={setName} placeholder="e.g. Meta Ads" autoFocus />
          <WizardField label="Slug (optional)" value={slug} onChange={setSlug} placeholder="auto-generated from name" />
          <div>
            <FieldLabel>Route to campaign (optional)</FieldLabel>
            <Select value={campaignId} onChange={setCampaignId} placeholder="No campaign"
              options={[{ value: "", label: "No campaign" }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} />
            <p className="text-[11.5px] text-muted-foreground mt-1">Leads from this source are attributed to the campaign and round-robin assigned to its agents.</p>
          </div>
          <WizardField label="Auto template (optional)" value={template} onChange={setTemplate} />
          <WizardField label="Webhook URL (optional)" value={webhook} onChange={setWebhook} placeholder="https://..." />
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div className="text-center">
            <div className="inline-flex mb-3"><Tile color={PRESETS.find((p) => p.key === preset)?.color || "#8B5CF6"} /></div>
            <div className="flex items-center justify-center gap-2 mb-1">
              <CheckCircle2 className="w-5 h-5 text-success" />
              <p className="font-bold text-[16px] text-foreground">{name} is ready</p>
            </div>
            <p className="text-[13px] text-muted-foreground max-w-[460px] mx-auto">Point your lead source at the endpoint below using this API key. Each lead opens a conversation in the inbox.</p>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 text-[12px] text-foreground/80">
            <Key className="w-4 h-4 shrink-0 text-warning" />Copy your API key now. You can always view it again from the source card.
          </div>

          <CopyField label="API key" value={created?.apiKey || ""} mono />
          <CopyField label="Endpoint" value={`POST ${API}/v1/leads`} mono />

          <div>
            <FieldLabel>Sample payload</FieldLabel>
            <div className="relative bg-sidebar text-[#D1FAE5] rounded-lg p-3 font-mono text-[11.5px] overflow-x-auto">
              <button onClick={() => navigator.clipboard.writeText(httpSample)} className="absolute top-2 right-2 p-1 text-white/60 hover:text-white outline-none"><Copy className="w-[15px] h-[15px]" /></button>
              <pre className="m-0 whitespace-pre-wrap">{httpSample}</pre>
            </div>
          </div>
        </div>
      )}
    </WizardModal>
  );
}
