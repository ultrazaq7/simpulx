"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Building2, Check } from "lucide-react";
import { api, getUser } from "@/lib/api";
import { loadPermissions, canWith } from "@/lib/permissions";
import { Select } from "@/components/Select";
import { cn } from "@/lib/utils";
import type { OrgSettings } from "@/lib/types";
import { useToast, PageBody, initials } from "../_shared";
import { useI18n } from "@/lib/i18n";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "id", label: "Indonesia" },
];

const COMPANY_SIZES = [
  { value: "", label: "Not set" },
  { value: "1-10", label: "1-10" },
  { value: "11-50", label: "11-50" },
  { value: "51-200", label: "51-200" },
  { value: "201-500", label: "201-500" },
  { value: "500+", label: "500+" },
];

const COUNTRY_CODES = [
  { value: "62", label: "Indonesia (+62)" },
  { value: "60", label: "Malaysia (+60)" },
  { value: "65", label: "Singapore (+65)" },
  { value: "63", label: "Philippines (+63)" },
  { value: "66", label: "Thailand (+66)" },
  { value: "84", label: "Vietnam (+84)" },
  { value: "1", label: "United States / Canada (+1)" },
  { value: "44", label: "United Kingdom (+44)" },
  { value: "91", label: "India (+91)" },
];

function getTimezones() {
  try { return Intl.supportedValuesOf("timeZone"); }
  catch { return ["Asia/Jakarta", "Asia/Singapore", "America/New_York", "America/Los_Angeles", "Europe/London", "UTC"]; }
}

// Current UTC offset for an IANA zone, e.g. "UTC+7" / "UTC-5:30" (search by "+7" works).
function tzOffset(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date());
    const name = parts.find((p) => p.type === "timeZoneName")?.value || "";
    return name.replace("GMT", "UTC").replace(/^UTC$/, "UTC+0");
  } catch { return ""; }
}

type Sub = { package_name: string; status: string; quotas: Record<string, number>; used_users: number; used_simpuler_credits: number; used_custom_fields: number };
type SaveState = "idle" | "saving" | "saved";

// Flat section card. No icon-heavy header bar; just a quiet label above a list of
// inline-editable rows.
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">{title}</h2>
      <div className="rounded-lg border border-border bg-card px-5 divide-y divide-border/60">{children}</div>
    </section>
  );
}

// One settings row: label (+ hint) on the left, editable control on the right.
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 py-3">
      <div className="sm:w-56 shrink-0">
        <p className="text-[13px] font-semibold text-foreground">{label}</p>
        {hint && <p className="text-[11.5px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex-1 min-w-0 sm:max-w-[380px]">{children}</div>
    </div>
  );
}

// Borderless-until-focus text field that commits on blur / Enter (inline edit).
function InlineText({ value, onCommit, placeholder, type = "text" }: { value: string; onCommit: (v: string) => void; placeholder?: string; type?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <input type={type} value={v} placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v.trim() !== (value || "").trim()) onCommit(v.trim()); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="w-full h-9 px-3 rounded-md border border-transparent bg-transparent hover:border-input hover:bg-background text-[13.5px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20" />
  );
}

function QuotaRow({ label, used, limit }: { label: string; used: number; limit?: number }) {
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const near = limit && limit > 0 && used / limit >= 0.85;
  return (
    <div>
      <div className="flex items-center justify-between text-[12.5px] mb-1">
        <span className="text-foreground/80">{label}</span>
        <span className="tabular-nums font-semibold text-foreground">{used}{limit ? ` / ${limit}` : ""}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", near ? "bg-amber-500" : "bg-primary")} style={{ width: `${limit ? pct : 0}%` }} />
      </div>
    </div>
  );
}

export default function GeneralSettingsPage() {
  const router = useRouter();
  const { notify, ToastHost } = useToast();
  const { setLang } = useI18n();
  // Org settings are permission-gated. A role without view_settings is bounced
  // back to the settings index, which routes them to their first allowed section.
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    loadPermissions().then((doc) => {
      const ok = canWith(doc, getUser()?.role, "view_settings");
      setAllowed(ok);
      if (!ok) router.replace("/settings");
    });
  }, [router]);

  const [name, setName] = useState("");
  const [settings, setSettings] = useState<OrgSettings>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveState>("idle");
  const [sub, setSub] = useState<Sub | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzOptions = useMemo(() => getTimezones().map((tz) => { const off = tzOffset(tz); return { value: tz, label: off ? `${tz} (${off})` : tz }; }), []);

  useEffect(() => {
    api.getOrganization().then((o) => { setName(o.name || ""); setSettings(o.settings ?? {}); }).catch(() => {}).finally(() => setLoading(false));
    api.getSubscription().then(setSub).catch(() => {});
  }, []);

  const s = settings as Record<string, string>;

  // Inline commit: merge the one changed field and persist. A quiet status pill
  // replaces the old global Save button.
  async function commit(patch: { name?: string; settings?: Record<string, string> }) {
    if (patch.name !== undefined && !patch.name.trim()) { notify("Company name is required", "error"); return; }
    const nextName = (patch.name ?? name).trim();
    const nextSettings = { ...settings, ...(patch.settings || {}) };
    setStatus("saving");
    try {
      await api.updateOrganization({ name: nextName, settings: nextSettings });
      if (patch.name !== undefined) setName(nextName);
      setSettings(nextSettings);
      if (patch.settings?.locale) setLang(patch.settings.locale);
      setStatus("saved");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setStatus("idle"), 1600);
    } catch (e) { setStatus("idle"); notify(String(e), "error"); }
  }
  const setField = (key: string) => (v: string) => commit({ settings: { [key]: v } });

  if (loading || allowed !== true) return (
    <PageBody><div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></PageBody>
  );

  return (
    <PageBody maxWidth={820}>
      {ToastHost}

      <div className="flex items-center justify-end h-5 mb-3">
        {status !== "idle" && (
          <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium", status === "saved" ? "text-success" : "text-muted-foreground")}>
            {status === "saving" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</> : <><Check className="w-3.5 h-3.5" />Saved</>}
          </span>
        )}
      </div>

      <div className="space-y-6">
        <Section title="Company">
          <div className="flex items-center gap-4 py-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary-text grid place-items-center text-base font-bold shrink-0">
              {initials(name) || <Building2 className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground mb-0.5">Company name</p>
              <InlineText value={name} onCommit={(v) => commit({ name: v })} placeholder="Your company name" />
            </div>
          </div>
          <Row label="Industry"><InlineText value={s.industry || ""} onCommit={setField("industry")} placeholder="e.g. Automotive" /></Row>
          <Row label="Company size"><Select value={s.company_size || ""} onChange={setField("company_size")} options={COMPANY_SIZES} searchable={false} /></Row>
          <Row label="Website"><InlineText value={s.website || ""} onCommit={setField("website")} placeholder="https://example.com" type="url" /></Row>
          <Row label="Support email"><InlineText value={s.support_email || ""} onCommit={setField("support_email")} placeholder="support@example.com" type="email" /></Row>
        </Section>

        <Section title="Localization">
          <Row label="Default language"><Select value={s.locale || "en"} onChange={setField("locale")} options={LANGUAGES} searchable={false} /></Row>
          <Row label="Default timezone"><Select value={s.timezone || browserTz} onChange={setField("timezone")} options={tzOptions} placeholder="Select timezone" /></Row>
          <Row label="Default country code"><Select value={s.country_code || "62"} onChange={setField("country_code")} options={COUNTRY_CODES} /></Row>
        </Section>

        <Section title="Subscription">
          {sub ? (
            <div className="py-4 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-foreground capitalize">{sub.package_name}</span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-success/10 text-success capitalize">{sub.status}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <QuotaRow label="Team members" used={sub.used_users} limit={sub.quotas?.users} />
                <QuotaRow label="Simpuler credits (this month)" used={sub.used_simpuler_credits} limit={sub.quotas?.simpuler_credits} />
                <QuotaRow label="Custom fields" used={sub.used_custom_fields} limit={sub.quotas?.custom_fields} />
              </div>
              <p className="text-[11.5px] text-muted-foreground">Credit pools and package are managed by Simpulx. Allocate a campaign&apos;s share in its Credits &amp; Usage tab.</p>
            </div>
          ) : (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          )}
        </Section>
      </div>
    </PageBody>
  );
}
