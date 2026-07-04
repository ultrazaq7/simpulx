"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleNotch as Loader2, Globe, Clock, Buildings as Building2, Copy, Check, Phone } from "@phosphor-icons/react/ssr";
import { api, getUser } from "@/lib/api";
import { loadPermissions, canWith } from "@/lib/permissions";
import { Select } from "@/components/Select";
import type { OrgSettings } from "@/lib/types";
import { useToast, PageBody, SettingsCard, FieldLabel, PrimaryButton, initials } from "../_shared";
import { useI18n } from "@/lib/i18n";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "id", label: "Indonesia" },
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
  const [orgId, setOrgId] = useState("");
  const [name, setName] = useState("");
  const [origName, setOrigName] = useState("");
  const [settings, setSettings] = useState<OrgSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [locale, setLocale] = useState("en");
  const [origLocale, setOrigLocale] = useState("en");
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [origTimezone, setOrigTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [country, setCountry] = useState("62");
  const [origCountry, setOrigCountry] = useState("62");

  const tzOptions = useMemo(() => getTimezones().map((tz) => { const off = tzOffset(tz); return { value: tz, label: off ? `${tz} (${off})` : tz }; }), []);

  useEffect(() => {
    api.getOrganization().then((o) => {
      setOrgId(o.id);
      setName(o.name || ""); setOrigName(o.name || "");
      const s = o.settings ?? {};
      setSettings(s);
      const l = (s as Record<string, string>).locale || "en";
      setLocale(l); setOrigLocale(l);
      const t = (s as Record<string, string>).timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      setTimezone(t); setOrigTimezone(t);
      const c = (s as Record<string, string>).country_code || "62";
      setCountry(c); setOrigCountry(c);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const dirty = name.trim() !== origName || locale !== origLocale || timezone !== origTimezone || country !== origCountry;

  async function save() {
    if (!name.trim()) { notify("Workspace name is required", "error"); return; }
    setSaving(true);
    try {
      const nextSettings = { ...settings, locale, timezone, country_code: country };
      await api.updateOrganization({ name: name.trim(), settings: nextSettings });
      setOrigName(name.trim()); setOrigLocale(locale); setOrigTimezone(timezone); setOrigCountry(country);
      setSettings(nextSettings);
      setLang(locale);
      notify("Settings saved");
    } catch (e) { notify(String(e), "error"); }
    finally { setSaving(false); }
  }

  function copyOrgId() {
    navigator.clipboard.writeText(orgId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading || allowed !== true) return (
    <PageBody><div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></PageBody>
  );

  return (
    <PageBody maxWidth={1120}>
      {ToastHost}

      <div className="flex items-center justify-end mb-4">
        <PrimaryButton onClick={save} disabled={saving || !dirty}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : dirty ? "Save changes" : "Saved"}
        </PrimaryButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Workspace ── */}
        <Panel icon={Building2} title="Workspace">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary-text grid place-items-center text-lg font-bold shrink-0">
              {initials(name) || <Building2 className="w-6 h-6" />}
            </div>
            <div className="flex-1 min-w-0">
              <FieldLabel>Workspace name</FieldLabel>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your company or workspace name"
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-[13.5px] text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>
          <div className="border-t border-border pt-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Workspace ID</p>
              <p className="text-[13px] font-mono text-foreground/80 truncate">{orgId || "—"}</p>
            </div>
            <button onClick={copyOrgId} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors outline-none shrink-0">
              {copied ? <><Check className="w-3.5 h-3.5 text-primary" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
            </button>
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
      </div>
    </PageBody>
  );
}
