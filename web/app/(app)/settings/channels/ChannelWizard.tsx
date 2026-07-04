"use client";
// Create Channel — a real 3-step wizard (Select channel > Channel details >
// Setting up channel). Each platform connects through its actual backend:
//   - WhatsApp: Meta Embedded Signup (real FB popup -> auto-provision) OR Direct
//     Cloud API (manual credentials).
//   - Viber: Public Account auth token (verified + webhook registered server-side).
//   - Messenger / Instagram / Testing: createChannel with the right config.
import { useState } from "react";
import {
  X, Check, ArrowLeft, Loader2, Copy, Lock, LogIn as FbIcon, KeyRound, CheckCircle2, RadioTower,
} from "lucide-react";
import ChannelIcon, { CHANNEL_CATALOG, channelMeta } from "@/components/ChannelIcon";
import { api, getUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { isMetaSignupConfigured, launchWhatsAppSignup } from "@/lib/fbSignup";
import { FieldLabel, INPUT_CLASS, PrimaryButton } from "../_shared";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const WA_WEBHOOK_URL = `${API}/webhook/whatsapp`;
const WA_VERIFY_TOKEN = process.env.NEXT_PUBLIC_META_VERIFY_TOKEN || "";

const STEPS = ["Select channel", "Channel details", "Setting up channel"];

type Result = { name: string; status: string; warning?: string };

export function ChannelWizard({ onClose, onDone, onError }: {
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const meta = type ? channelMeta(type) : null;

  function finish(res: Result) { setResult(res); setStep(2); }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-[760px] max-h-[88vh] rounded-xl border border-border bg-card shadow-2xl animate-scale-in flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center"><RadioTower className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[16px] text-foreground leading-tight">Create channel</p>
            <p className="text-[12px] text-muted-foreground">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none"><X className="w-5 h-5" /></button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center px-6 pt-4 shrink-0">
          {STEPS.map((s, i) => {
            const done = i < step, active = i === step;
            return (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-2">
                  <div className={cn("w-7 h-7 rounded-full grid place-items-center text-[12px] font-bold shrink-0 transition-colors",
                    done ? "bg-success text-white" : active ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
                    {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={cn("text-[12.5px] font-semibold whitespace-nowrap hidden sm:block", active ? "text-foreground" : "text-muted-foreground")}>{s}</span>
                </div>
                {i < STEPS.length - 1 && <div className={cn("h-0.5 flex-1 mx-3 rounded-full", done ? "bg-success" : "bg-border")} />}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 min-h-0">
          {step === 0 && <SelectStep selected={type} onSelect={setType} />}
          {step === 1 && meta && (
            <DetailsStep
              type={type} saving={saving} setSaving={setSaving}
              onConnected={finish} onError={onError}
            />
          )}
          {step === 2 && result && meta && <DoneStep meta={meta} result={result} />}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-border shrink-0">
          {step === 1 && (
            <button onClick={() => setStep(0)} className="inline-flex items-center gap-1.5 px-4 h-9 rounded-md border border-border text-sm font-semibold text-foreground/80 hover:bg-muted transition-colors outline-none">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          )}
          <div className="flex-1" />
          {step === 0 && (
            <button onClick={() => type && setStep(1)} disabled={!type}
              className="px-5 h-9 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow-brand-md transition-all outline-none">
              Continue
            </button>
          )}
          {step === 2 && (
            <PrimaryButton onClick={() => onDone(result?.status === "connected" ? "Channel connected" : "Channel added")}>
              Done
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 0: pick a platform ────────────────────────────────────────────────
function SelectStep({ selected, onSelect }: { selected: string; onSelect: (t: string) => void }) {
  // Testing (sandbox) is Owner-only: managers/agents/dealers never see it in the
  // wizard. Each org keeps a single testing channel, provisioned by its Owner.
  const isOwner = getUser()?.role === "owner";
  const catalog = CHANNEL_CATALOG.filter((c) => c.type !== "testing" || isOwner);
  return (
    <div>
      <p className="text-[13.5px] text-muted-foreground mb-4">Choose the platform you want to connect. You can add more channels any time.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {catalog.map((c) => {
          const active = selected === c.type;
          return (
            <button
              key={c.type}
              disabled={!c.available}
              onClick={() => onSelect(c.type)}
              className={cn(
                "flex items-center gap-3 p-3.5 rounded-lg border text-left transition-all outline-none",
                !c.available ? "opacity-55 cursor-not-allowed border-border bg-muted/30"
                  : active ? "border-primary ring-2 ring-primary/20 bg-primary/[0.04]"
                    : "border-border hover:border-primary/40 hover:bg-muted/40",
              )}
            >
              <ChannelIcon type={c.type} size={40} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-foreground truncate">{c.name}</p>
                <p className="text-[11.5px] text-muted-foreground truncate">{c.available ? c.blurb : "Coming soon"}</p>
              </div>
              {active ? <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                : !c.available ? <Lock className="w-4 h-4 text-muted-foreground/40 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 1: details per platform ───────────────────────────────────────────
function DetailsStep({ type, saving, setSaving, onConnected, onError }: {
  type: string; saving: boolean; setSaving: (v: boolean) => void;
  onConnected: (r: Result) => void; onError: (m: string) => void;
}) {
  if (type === "whatsapp") return <WhatsAppStep saving={saving} setSaving={setSaving} onConnected={onConnected} onError={onError} />;
  if (type === "viber") return <ViberStep saving={saving} setSaving={setSaving} onConnected={onConnected} onError={onError} />;
  if (type === "testing") return <TestingStep saving={saving} setSaving={setSaving} onConnected={onConnected} onError={onError} />;
  return <MetaStep type={type} saving={saving} setSaving={setSaving} onConnected={onConnected} onError={onError} />;
}

function Field({ label, value, onChange, placeholder, type = "text", hint, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; hint?: string; autoFocus?: boolean;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} className={INPUT_CLASS} />
      {hint && <p className="text-[11.5px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-muted/50">
        <span className="flex-1 truncate font-mono text-[12px] text-muted-foreground">{value}</span>
        <button onClick={copy} className="shrink-0 text-muted-foreground hover:text-foreground outline-none transition-colors">
          {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// WhatsApp: method selector (Embedded Signup + Direct Cloud API).
function WhatsAppStep({ saving, setSaving, onConnected, onError }: {
  saving: boolean; setSaving: (v: boolean) => void; onConnected: (r: Result) => void; onError: (m: string) => void;
}) {
  const [method, setMethod] = useState<"facebook" | "manual">(isMetaSignupConfigured() ? "facebook" : "manual");
  const [name, setName] = useState("");
  const [displayId, setDisplayId] = useState("");
  const [token, setToken] = useState("");
  const [waba, setWaba] = useState("");
  const [phoneId, setPhoneId] = useState("");
  const fbReady = isMetaSignupConfigured();

  async function loginWithFacebook() {
    setSaving(true);
    try {
      const s = await launchWhatsAppSignup();
      const r = await api.embeddedSignup({ code: s.code, waba_id: s.waba_id, phone_number_id: s.phone_number_id, name: name.trim() || undefined });
      onConnected({ name: name.trim() || "WhatsApp Business", status: r.status, warning: r.warning });
    } catch (e: any) { onError(e?.message || String(e)); }
    finally { setSaving(false); }
  }

  async function connectManual() {
    if (!name.trim()) { onError("Channel name is required"); return; }
    if (!phoneId.trim() || !waba.trim()) { onError("WABA ID and Phone Number ID are required"); return; }
    setSaving(true);
    try {
      const r = await api.createChannel({
        type: "whatsapp", name: name.trim(), display_id: displayId.trim() || undefined,
        phone_number_id: phoneId.trim(), waba_id: waba.trim(), access_token: token.trim() || undefined,
      });
      onConnected({ name: name.trim(), status: r.status });
    } catch (e: any) { onError(e?.message || String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Method tabs */}
      <div className="grid grid-cols-2 gap-2.5">
        <MethodCard
          active={method === "facebook"} disabled={!fbReady}
          icon={<FbIcon className="w-5 h-5" />} title="Login with Facebook"
          desc={fbReady ? "Connect or create a WhatsApp Business account in a few clicks." : "Set NEXT_PUBLIC_META_APP_ID / CONFIG_ID to enable."}
          onClick={() => fbReady && setMethod("facebook")}
        />
        <MethodCard
          active={method === "manual"}
          icon={<KeyRound className="w-5 h-5" />} title="Direct Cloud API"
          desc="Enter your WhatsApp Business Account credentials from Meta."
          onClick={() => setMethod("manual")}
        />
      </div>

      <Field label="Channel name" value={name} onChange={setName} placeholder="e.g. Sales WhatsApp" autoFocus />

      {method === "facebook" ? (
        <div className="rounded-lg border border-border bg-muted/30 p-5 text-center">
          <p className="text-[13px] text-muted-foreground mb-4 max-w-[460px] mx-auto">
            You will sign in with Facebook and pick (or create) a WhatsApp Business number. We finish the setup automatically: subscribe the app, register the number and connect the channel.
          </p>
          <button onClick={loginWithFacebook} disabled={saving}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-md bg-[#1877F2] text-white text-sm font-semibold hover:bg-[#0f6ae0] disabled:opacity-60 shadow-sm transition-all outline-none">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FbIcon className="w-4 h-4" />}
            Login with Facebook
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4">
            <ReadOnlyRow label="Webhook URL (set in Meta > WhatsApp > Configuration)" value={WA_WEBHOOK_URL} />
            <ReadOnlyRow label="Verify token (must match META_VERIFY_TOKEN on the server)" value={WA_VERIFY_TOKEN || "your META_VERIFY_TOKEN"} />
          </div>
          <Field label="System User Access Token" value={token} onChange={setToken} type="password" placeholder="EAAG..." hint="A permanent system-user token with whatsapp_business_messaging." />
          <div className="grid grid-cols-2 gap-4">
            <Field label="WhatsApp Business Account ID" value={waba} onChange={setWaba} placeholder="WABA ID" />
            <Field label="Phone Number ID" value={phoneId} onChange={setPhoneId} placeholder="Phone number ID" />
          </div>
          <Field label="Display number (optional)" value={displayId} onChange={setDisplayId} placeholder="+62 812 3456 7890" />
          <div className="flex justify-end">
            <PrimaryButton onClick={connectManual} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Connect
            </PrimaryButton>
          </div>
        </>
      )}
    </div>
  );
}

function MethodCard({ active, disabled, icon, title, desc, onClick }: {
  active: boolean; disabled?: boolean; icon: React.ReactNode; title: string; desc: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={cn("flex flex-col gap-1.5 p-3.5 rounded-lg border text-left transition-all outline-none",
        disabled ? "opacity-55 cursor-not-allowed border-border bg-muted/30"
          : active ? "border-primary ring-2 ring-primary/20 bg-primary/[0.04]" : "border-border hover:border-primary/40 hover:bg-muted/40")}>
      <div className={cn("inline-flex items-center gap-2 font-semibold text-[13.5px]", active ? "text-primary" : "text-foreground")}>
        {icon}{title}
      </div>
      <p className="text-[11.5px] text-muted-foreground leading-snug">{desc}</p>
    </button>
  );
}

// Viber: Public Account auth token.
function ViberStep({ saving, setSaving, onConnected, onError }: {
  saving: boolean; setSaving: (v: boolean) => void; onConnected: (r: Result) => void; onError: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  async function connect() {
    if (!token.trim()) { onError("Viber auth token is required"); return; }
    setSaving(true);
    try {
      const r = await api.connectViber({ auth_token: token.trim(), name: name.trim() || undefined });
      onConnected({ name: name.trim() || "Viber", status: r.status, warning: r.warning });
    } catch (e: any) { onError(e?.message || String(e)); }
    finally { setSaving(false); }
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted-foreground">
        Create a Viber Public Account, then paste its authentication token from the Viber Admin Panel. We verify the token and register the inbound webhook for you.
      </p>
      <Field label="Channel name (optional)" value={name} onChange={setName} placeholder="e.g. Support Viber" autoFocus />
      <Field label="Public Account auth token" value={token} onChange={setToken} type="password" placeholder="4453b6ac1234567a-..." hint="Found under Account > Edit Info > Webhook in the Viber Admin Panel." />
      <div className="flex justify-end">
        <PrimaryButton onClick={connect} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Connect
        </PrimaryButton>
      </div>
    </div>
  );
}

// Testing sandbox (a WhatsApp number flagged is_sandbox).
function TestingStep({ saving, setSaving, onConnected, onError }: {
  saving: boolean; setSaving: (v: boolean) => void; onConnected: (r: Result) => void; onError: (m: string) => void;
}) {
  const [name, setName] = useState("");
  async function create() {
    if (!name.trim()) { onError("Channel name is required"); return; }
    setSaving(true);
    try {
      const r = await api.createChannel({ type: "whatsapp", name: name.trim(), config: { is_sandbox: true } });
      onConnected({ name: name.trim(), status: r.status });
    } catch (e: any) { onError(e?.message || String(e)); }
    finally { setSaving(false); }
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted-foreground">A simulated sandbox channel. Actions here never reach real customers, so you can test flows safely.</p>
      <Field label="Channel name" value={name} onChange={setName} placeholder="e.g. Test channel" autoFocus />
      <div className="flex justify-end">
        <PrimaryButton onClick={create} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Create
        </PrimaryButton>
      </div>
    </div>
  );
}

// Messenger / Instagram: page + token.
function MetaStep({ type, saving, setSaving, onConnected, onError }: {
  type: string; saving: boolean; setSaving: (v: boolean) => void; onConnected: (r: Result) => void; onError: (m: string) => void;
}) {
  const isIg = type === "instagram";
  const [name, setName] = useState("");
  const [displayId, setDisplayId] = useState("");
  const [pageId, setPageId] = useState("");
  const [igId, setIgId] = useState("");
  const [token, setToken] = useState("");

  async function connect() {
    if (!name.trim()) { onError("Channel name is required"); return; }
    if (!pageId.trim()) { onError("Page ID is required"); return; }
    setSaving(true);
    try {
      const config: Record<string, unknown> = { page_id: pageId.trim() };
      if (isIg) config.instagram_account_id = igId.trim();
      const r = await api.createChannel({
        type, name: name.trim(), display_id: displayId.trim() || undefined,
        access_token: token.trim() || undefined, config,
      });
      onConnected({ name: name.trim(), status: r.status });
    } catch (e: any) { onError(e?.message || String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Channel name" value={name} onChange={setName} placeholder={isIg ? "e.g. Instagram DM" : "e.g. Facebook Page"} autoFocus />
      <Field label="Page ID" value={pageId} onChange={setPageId} placeholder="Facebook Page ID" />
      {isIg && <Field label="Instagram Account ID" value={igId} onChange={setIgId} placeholder="IG business account ID" />}
      <Field label={isIg ? "Display handle (optional)" : "Page name (optional)"} value={displayId} onChange={setDisplayId} placeholder={isIg ? "@yourbrand" : "Your Page"} />
      <Field label="Access token" value={token} onChange={setToken} type="password" placeholder="Page access token" />
      <div className="flex justify-end">
        <PrimaryButton onClick={connect} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Connect
        </PrimaryButton>
      </div>
    </div>
  );
}

// ── Step 2: done / setting up ──────────────────────────────────────────────
function DoneStep({ meta, result }: { meta: ReturnType<typeof channelMeta>; result: Result }) {
  const connected = result.status === "connected";
  return (
    <div className="text-center py-6">
      <div className="inline-flex mb-4"><ChannelIcon type={meta.type} size={64} radius={18} /></div>
      <div className="flex items-center justify-center gap-2 mb-1">
        <CheckCircle2 className={cn("w-5 h-5", connected ? "text-success" : "text-warning")} />
        <p className="font-bold text-[16px] text-foreground">
          {connected ? `${result.name} is connected` : `${result.name} was added`}
        </p>
      </div>
      <p className="text-[13px] text-muted-foreground max-w-[460px] mx-auto">
        {connected
          ? "The channel is live and ready to send and receive messages."
          : "Run Test on the channel card to verify the connection and mark it connected."}
      </p>
      {result.warning && (
        <div className="mt-4 mx-auto max-w-[480px] px-3 py-2 rounded-md bg-warning/10 border border-warning/30 text-[12px] text-warning-foreground/90 text-left">
          {result.warning}
        </div>
      )}
    </div>
  );
}
