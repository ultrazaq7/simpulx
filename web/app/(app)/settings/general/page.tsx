"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Globe, Clock, Building2, Phone, Coins } from "lucide-react";
import { api, getUser } from "@/lib/api";
import { loadPermissions, canWith } from "@/lib/permissions";
import { Select } from "@/components/Select";
import { cn } from "@/lib/utils";
import type { OrgSettings } from "@/lib/types";
import { useToast, PageBody, SettingsCard, FieldLabel, PrimaryButton, initials } from "../_shared";
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

// Card with a titled header bar (enterprise look).
function Panel({ icon: Icon, title, children, className }: { icon: any; title: string; children: React.ReactNode; className?: string }) {
  return (
    <SettingsCard className={`overflow-hidden ${className ?? ""}`}>
      <div className="px-5 py-3 border-b border-border flex items-center gap-2.5 bg-muted/30">
        <Icon className="w-[18px] h-[18px] text-primary" />
        <h2 className="font-bold text-[14px] text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </SettingsCard>
  );
}

type Sub = { package_name: string; status: string; quotas: Record<string, number>; used_users: number; used_simpuler_credits: number; used_custom_fields: number };

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
  // Org/workspace settings are permission-gated. A role without view_settings
  // (e.g. a manager the owner didn't grant org access) is bounced back to the
  // settings index, which routes them to their first allowed section.
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    loadPermissions().then((doc) => {
      const ok = canWith(doc, getUser()?.role, "view_settings");
      setAllowed(ok);
      if (!ok) router.replace("/settings");
    });
  }, [router]);
  const [name, setName] = useState("");
  const [origName, setOrigName] = useState("");
  const [settings, setSettings] = useState<OrgSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sub, setSub] = useState<Sub | null>(null);

  const [locale, setLocale] = useState("en");
  const [origLocale, setOrigLocale] = useState("en");
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [origTimezone, setOrigTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [country, setCountry] = useState("62");
  const [origCountry, setOrigCountry] = useState("62");
  // Enterprise company-profile fields (stored in the org settings jsonb).
  const [industry, setIndustry] = useState(""); const [origIndustry, setOrigIndustry] = useState("");
  const [companySize, setCompanySize] = useState(""); const [origCompanySize, setOrigCompanySize] = useState("");
  const [website, setWebsite] = useState(""); const [origWebsite, setOrigWebsite] = useState("");
  const [supportEmail, setSupportEmail] = useState(""); const [origSupportEmail, setOrigSupportEmail] = useState("");

  const tzOptions = useMemo(() => getTimezones().map((tz) => { const off = tzOffset(tz); return { value: tz, label: off ? `${tz} (${off})` : tz }; }), []);

  useEffect(() => {
    api.getOrganization().then((o) => {
      setName(o.name || ""); setOrigName(o.name || "");
      const s = o.settings ?? {};
      setSettings(s);
      const sr = s as Record<string, string>;
      const l = sr.locale || "en";
      setLocale(l); setOrigLocale(l);
      const t = sr.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      setTimezone(t); setOrigTimezone(t);
      const c = sr.country_code || "62";
      setCountry(c); setOrigCountry(c);
      setIndustry(sr.industry || ""); setOrigIndustry(sr.industry || "");
      setCompanySize(sr.company_size || ""); setOrigCompanySize(sr.company_size || "");
      setWebsite(sr.website || ""); setOrigWebsite(sr.website || "");
      setSupportEmail(sr.support_email || ""); setOrigSupportEmail(sr.support_email || "");
    }).catch(() => {}).finally(() => setLoading(false));
    api.getSubscription().then(setSub).catch(() => {});
  }, []);

  const dirty = name.trim() !== origName || locale !== origLocale || timezone !== origTimezone || country !== origCountry
    || industry !== origIndustry || companySize !== origCompanySize || website !== origWebsite || supportEmail !== origSupportEmail;

  async function save() {
    if (!name.trim()) { notify("Company name is required", "error"); return; }
    setSaving(true);
    try {
      const nextSettings = { ...settings, locale, timezone, country_code: country, industry: industry.trim(), company_size: companySize, website: website.trim(), support_email: supportEmail.trim() };
      await api.updateOrganization({ name: name.trim(), settings: nextSettings });
      setOrigName(name.trim()); setOrigLocale(locale); setOrigTimezone(timezone); setOrigCountry(country);
      setOrigIndustry(industry); setOrigCompanySize(companySize); setOrigWebsite(website); setOrigSupportEmail(supportEmail);
      setSettings(nextSettings);
      setLang(locale);
      notify("Settings saved");
    } catch (e) { notify(String(e), "error"); }
    finally { setSaving(false); }
  }

  const inputCls = "w-full h-9 px-3 rounded-md border border-input bg-background text-[13.5px] text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20";

  if (loading || allowed !== true) return (
    <PageBody><div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></PageBody>
  );

  return (
    <PageBody maxWidth={1120}>
      {ToastHost}

      <div className="flex items-center justify-between gap-4 mb-5 px-4 py-3 rounded-lg border border-border bg-card shadow-xs">
        <div className="min-w-0">
          <h1 className="text-[15px] font-bold text-foreground leading-tight">General</h1>
          <p className="text-[12px] text-muted-foreground truncate">Company profile, localization, and subscription.</p>
        </div>
        <PrimaryButton onClick={save} disabled={saving || !dirty}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : dirty ? "Save changes" : "Saved"}
        </PrimaryButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Company ── */}
        <Panel icon={Building2} title="Company">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary-text grid place-items-center text-lg font-bold shrink-0">
                {initials(name) || <Building2 className="w-6 h-6" />}
              </div>
              <div className="flex-1 min-w-0">
                <FieldLabel>Company name</FieldLabel>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your company name" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><FieldLabel>Industry</FieldLabel><input type="text" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Automotive" className={inputCls} /></div>
              <div><FieldLabel>Company size</FieldLabel><Select value={companySize} onChange={setCompanySize} options={COMPANY_SIZES} searchable={false} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><FieldLabel>Website</FieldLabel><input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" className={inputCls} /></div>
              <div><FieldLabel>Support email</FieldLabel><input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder="support@example.com" className={inputCls} /></div>
            </div>
          </div>
        </Panel>

        {/* ── Localization ── */}
        <Panel icon={Globe} title="Localization">
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5"><Globe className="w-4 h-4 text-muted-foreground" /><FieldLabel className="mb-0">Default language</FieldLabel></div>
              <Select value={locale} onChange={setLocale} options={LANGUAGES} searchable={false} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5"><Clock className="w-4 h-4 text-muted-foreground" /><FieldLabel className="mb-0">Default timezone</FieldLabel></div>
              <Select value={timezone} onChange={setTimezone} options={tzOptions} placeholder="Select timezone" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5"><Phone className="w-4 h-4 text-muted-foreground" /><FieldLabel className="mb-0">Default country code</FieldLabel></div>
              <Select value={country} onChange={setCountry} options={COUNTRY_CODES} />
            </div>
          </div>
        </Panel>

        {/* ── Subscription ── */}
        <Panel icon={Coins} title="Subscription" className="lg:col-span-2">
          {sub ? (
            <div className="space-y-4">
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
        </Panel>
      </div>
    </PageBody>
  );
}
