"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Globe, Clock, Building2, Copy, Check, Phone, CalendarDays, Hash } from "lucide-react";
import { api } from "@/lib/api";
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
  const { notify, ToastHost } = useToast();
  const { setLang } = useI18n();
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

  const tzOptions = useMemo(() => getTimezones().map((tz) => ({ value: tz, label: tz })), []);

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

  // Live regional preview (honest: derived from the chosen locale + timezone).
  const now = new Date();
  const safeFmt = (fn: () => string) => { try { return fn(); } catch { return "—"; } };
  const dateEx = safeFmt(() => new Intl.DateTimeFormat(locale, { timeZone: timezone, dateStyle: "medium" }).format(now));
  const timeEx = safeFmt(() => new Intl.DateTimeFormat(locale, { timeZone: timezone, timeStyle: "short" }).format(now));
  const numEx = safeFmt(() => new Intl.NumberFormat(locale).format(1234567.89));

  if (loading) return (
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
              <p className="text-[11px] text-muted-foreground/70 mt-1.5">Primary country dialing code for this workspace.</p>
            </div>
          </div>
        </Panel>
      </div>

      {/* ── Regional preview (live, read-only) ── */}
      <Panel icon={CalendarDays} title="Regional preview" className="mt-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: CalendarDays, label: "Date", value: dateEx },
            { icon: Clock, label: "Time", value: timeEx },
            { icon: Hash, label: "Number", value: numEx },
          ].map((p) => (
            <div key={p.label} className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5"><p.icon className="w-3.5 h-3.5" /><span className="text-[11px] font-bold uppercase tracking-wider">{p.label}</span></div>
              <p className="text-[16px] font-bold text-foreground tabular-nums">{p.value}</p>
            </div>
          ))}
        </div>
      </Panel>
    </PageBody>
  );
}
