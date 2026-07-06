"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Building2 } from "lucide-react";
import { api, getUser } from "@/lib/api";
import { loadPermissions, canWith } from "@/lib/permissions";
import { Select } from "@/components/Select";
import { cn } from "@/lib/utils";
import type { OrgSettings } from "@/lib/types";
import { useToast, PageBody, initials } from "../_shared";
import { useI18n } from "@/lib/i18n";
import UnsavedBar from "@/components/UnsavedBar";

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

function tzOffset(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date());
    const name = parts.find((p) => p.type === "timeZoneName")?.value || "";
    return name.replace("GMT", "UTC").replace(/^UTC$/, "UTC+0");
  } catch { return ""; }
}

type Sub = { package_name: string; status: string; quotas: Record<string, number>; used_users: number; used_simpuler_credits: number; used_custom_fields: number };
const INPUT = "w-full h-10 px-3 rounded-lg border border-input bg-background text-[13.5px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20";
const LBL = "block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[15px] font-bold text-foreground mb-4">{title}</h2>
      <div className="space-y-5">{children}</div>
    </section>
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

type Form = { name: string; industry: string; company_size: string; website: string; support_email: string; locale: string; timezone: string; country_code: string };

export default function GeneralSettingsPage() {
  const router = useRouter();
  const { notify, ToastHost } = useToast();
  const { setLang } = useI18n();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    loadPermissions().then((doc) => {
      const ok = canWith(doc, getUser()?.role, "view_settings");
      setAllowed(ok);
      if (!ok) router.replace("/settings");
    });
  }, [router]);

  const [settings, setSettings] = useState<OrgSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sub, setSub] = useState<Sub | null>(null);

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzOptions = useMemo(() => getTimezones().map((tz) => { const off = tzOffset(tz); return { value: tz, label: off ? `${tz} (${off})` : tz }; }), []);

  const [form, setForm] = useState<Form>({ name: "", industry: "", company_size: "", website: "", support_email: "", locale: "en", timezone: browserTz, country_code: "62" });
  const [orig, setOrig] = useState<Form>(form);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.getOrganization().then((o) => {
      const s = (o.settings ?? {}) as Record<string, string>;
      const next: Form = {
        name: o.name || "", industry: s.industry || "", company_size: s.company_size || "",
        website: s.website || "", support_email: s.support_email || "",
        locale: s.locale || "en", timezone: s.timezone || browserTz, country_code: s.country_code || "62",
      };
      setSettings(o.settings ?? {}); setForm(next); setOrig(next);
    }).catch(() => {}).finally(() => setLoading(false));
    api.getSubscription().then(setSub).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = (Object.keys(form) as (keyof Form)[]).filter((k) => form[k] !== orig[k]);

  async function save() {
    if (!form.name.trim()) { notify("Company name is required", "error"); return; }
    setSaving(true);
    try {
      const next = { ...settings, industry: form.industry.trim(), company_size: form.company_size, website: form.website.trim(), support_email: form.support_email.trim(), locale: form.locale, timezone: form.timezone, country_code: form.country_code };
      await api.updateOrganization({ name: form.name.trim(), settings: next });
      setSettings(next); setOrig(form); setLang(form.locale);
      notify("Changes saved");
    } catch (e) { notify(String(e), "error"); } finally { setSaving(false); }
  }

  if (loading || allowed !== true) return (
    <PageBody><div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></PageBody>
  );

  return (
    <PageBody maxWidth={1000}>
      {ToastHost}
      <div className="bg-card border border-border rounded-xl shadow-xs p-6 sm:p-8 mb-24 space-y-9">
        <Section title="Company">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 text-primary-text grid place-items-center text-lg font-bold shrink-0">
              {initials(form.name) || <Building2 className="w-6 h-6" />}
            </div>
            <div className="flex-1 min-w-0">
              <label className={LBL}>Company name</label>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Your company name" className={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><label className={LBL}>Industry</label><input value={form.industry} onChange={(e) => set("industry", e.target.value)} placeholder="e.g. Automotive" className={INPUT} /></div>
            <div><label className={LBL}>Company size</label><Select value={form.company_size} onChange={(v) => set("company_size", v)} options={COMPANY_SIZES} searchable={false} /></div>
            <div><label className={LBL}>Website</label><input type="url" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://example.com" className={INPUT} /></div>
            <div><label className={LBL}>Support email</label><input type="email" value={form.support_email} onChange={(e) => set("support_email", e.target.value)} placeholder="support@example.com" className={INPUT} /></div>
          </div>
        </Section>

        <div className="border-t border-border" />

        <Section title="Localization">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><label className={LBL}>Default language</label><Select value={form.locale} onChange={(v) => set("locale", v)} options={LANGUAGES} searchable={false} /></div>
            <div><label className={LBL}>Default country code</label><Select value={form.country_code} onChange={(v) => set("country_code", v)} options={COUNTRY_CODES} /></div>
            <div className="sm:col-span-2"><label className={LBL}>Default timezone</label><Select value={form.timezone} onChange={(v) => set("timezone", v)} options={tzOptions} placeholder="Select timezone" /></div>
          </div>
        </Section>

        <div className="border-t border-border" />

        <Section title="Subscription">
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
            </div>
          ) : <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
        </Section>
      </div>

      <UnsavedBar count={changed.length} saving={saving} onSave={save} onCancel={() => setForm(orig)} />
    </PageBody>
  );
}
