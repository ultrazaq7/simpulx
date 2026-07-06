"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Building2, Pencil, Check, X } from "lucide-react";
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

function tzOffset(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date());
    const name = parts.find((p) => p.type === "timeZoneName")?.value || "";
    return name.replace("GMT", "UTC").replace(/^UTC$/, "UTC+0");
  } catch { return ""; }
}

type Sub = { package_name: string; status: string; quotas: Record<string, number>; used_users: number; used_simpuler_credits: number; used_custom_fields: number };
const INPUT = "w-full h-9 px-3 rounded-md border border-input bg-background text-[13.5px] text-foreground placeholder:text-muted-foreground/60 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20";

// A settings card that toggles between read-only and edit. The Edit button lives
// in the card header; edit mode reveals Save/Cancel. `editable=false` (e.g. no
// permission, or a read-only card like Subscription) hides the Edit button.
function SectionCard({ title, editing, editable = true, saving, onEdit, onSave, onCancel, children }: {
  title: string; editing: boolean; editable?: boolean; saving?: boolean;
  onEdit?: () => void; onSave?: () => void; onCancel?: () => void; children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2 px-1 h-7">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {editable && (editing ? (
          <div className="flex items-center gap-1.5">
            <button onClick={onCancel} disabled={saving} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[12px] font-semibold text-muted-foreground hover:bg-muted outline-none disabled:opacity-50"><X className="w-3.5 h-3.5" />Cancel</button>
            <button onClick={onSave} disabled={saving} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[12px] font-semibold text-white bg-primary hover:bg-primary-dark outline-none disabled:opacity-50">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Save</button>
          </div>
        ) : (
          <button onClick={onEdit} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[12px] font-semibold text-foreground/70 hover:text-foreground hover:bg-muted outline-none"><Pencil className="w-3.5 h-3.5" />Edit</button>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card px-5 divide-y divide-border/60">{children}</div>
    </section>
  );
}

// One row: label on the left, value or control on the right.
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-3 min-h-[52px]">
      <p className="sm:w-56 shrink-0 text-[13px] font-semibold text-foreground">{label}</p>
      <div className="flex-1 min-w-0 sm:max-w-[380px]">{children}</div>
    </div>
  );
}

// Read-only value text (falls back to a muted placeholder).
function Val({ children }: { children?: string | null }) {
  return <p className="text-[13.5px] text-foreground truncate">{children ? children : <span className="text-muted-foreground/70">Not set</span>}</p>;
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
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    loadPermissions().then((doc) => {
      const role = getUser()?.role;
      const ok = canWith(doc, role, "view_settings");
      setAllowed(ok);
      setCanEdit(canWith(doc, role, "manage_settings") || canWith(doc, role, "view_settings"));
      if (!ok) router.replace("/settings");
    });
  }, [router]);

  const [name, setName] = useState("");
  const [settings, setSettings] = useState<OrgSettings>({});
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<Sub | null>(null);

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzOptions = useMemo(() => getTimezones().map((tz) => { const off = tzOffset(tz); return { value: tz, label: off ? `${tz} (${off})` : tz }; }), []);
  const s = settings as Record<string, string>;

  useEffect(() => {
    api.getOrganization().then((o) => { setName(o.name || ""); setSettings(o.settings ?? {}); }).catch(() => {}).finally(() => setLoading(false));
    api.getSubscription().then(setSub).catch(() => {});
  }, []);

  // ── Company section (name + profile) ──
  const [editCo, setEditCo] = useState(false);
  const [savingCo, setSavingCo] = useState(false);
  const [co, setCo] = useState({ name: "", industry: "", company_size: "", website: "", support_email: "" });
  function startCo() { setCo({ name, industry: s.industry || "", company_size: s.company_size || "", website: s.website || "", support_email: s.support_email || "" }); setEditCo(true); }
  async function saveCo() {
    if (!co.name.trim()) { notify("Company name is required", "error"); return; }
    setSavingCo(true);
    try {
      const next = { ...settings, industry: co.industry.trim(), company_size: co.company_size, website: co.website.trim(), support_email: co.support_email.trim() };
      await api.updateOrganization({ name: co.name.trim(), settings: next });
      setName(co.name.trim()); setSettings(next); setEditCo(false);
      notify("Company saved");
    } catch (e) { notify(String(e), "error"); } finally { setSavingCo(false); }
  }

  // ── Localization section ──
  const [editLoc, setEditLoc] = useState(false);
  const [savingLoc, setSavingLoc] = useState(false);
  const [loc, setLoc] = useState({ locale: "en", timezone: "", country_code: "62" });
  function startLoc() { setLoc({ locale: s.locale || "en", timezone: s.timezone || browserTz, country_code: s.country_code || "62" }); setEditLoc(true); }
  async function saveLoc() {
    setSavingLoc(true);
    try {
      const next = { ...settings, locale: loc.locale, timezone: loc.timezone, country_code: loc.country_code };
      await api.updateOrganization({ name: name.trim(), settings: next });
      setSettings(next); setLang(loc.locale); setEditLoc(false);
      notify("Localization saved");
    } catch (e) { notify(String(e), "error"); } finally { setSavingLoc(false); }
  }

  const langLabel = LANGUAGES.find((l) => l.value === (s.locale || "en"))?.label;
  const countryLabel = COUNTRY_CODES.find((c) => c.value === (s.country_code || "62"))?.label;
  const sizeLabel = s.company_size ? COMPANY_SIZES.find((c) => c.value === s.company_size)?.label : "";

  if (loading || allowed !== true) return (
    <PageBody><div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></PageBody>
  );

  return (
    <PageBody maxWidth={820}>
      {ToastHost}
      <div className="space-y-6 pt-1">
        <SectionCard title="Company" editable={canEdit} editing={editCo} saving={savingCo} onEdit={startCo} onSave={saveCo} onCancel={() => setEditCo(false)}>
          <div className="flex items-center gap-4 py-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary-text grid place-items-center text-base font-bold shrink-0">
              {initials(editCo ? co.name : name) || <Building2 className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground mb-0.5">Company name</p>
              {editCo ? <input value={co.name} onChange={(e) => setCo({ ...co, name: e.target.value })} placeholder="Your company name" className={INPUT} /> : <Val>{name}</Val>}
            </div>
          </div>
          <Row label="Industry">{editCo ? <input value={co.industry} onChange={(e) => setCo({ ...co, industry: e.target.value })} placeholder="e.g. Automotive" className={INPUT} /> : <Val>{s.industry}</Val>}</Row>
          <Row label="Company size">{editCo ? <Select value={co.company_size} onChange={(v) => setCo({ ...co, company_size: v })} options={COMPANY_SIZES} searchable={false} /> : <Val>{sizeLabel}</Val>}</Row>
          <Row label="Website">{editCo ? <input type="url" value={co.website} onChange={(e) => setCo({ ...co, website: e.target.value })} placeholder="https://example.com" className={INPUT} /> : <Val>{s.website}</Val>}</Row>
          <Row label="Support email">{editCo ? <input type="email" value={co.support_email} onChange={(e) => setCo({ ...co, support_email: e.target.value })} placeholder="support@example.com" className={INPUT} /> : <Val>{s.support_email}</Val>}</Row>
        </SectionCard>

        <SectionCard title="Localization" editable={canEdit} editing={editLoc} saving={savingLoc} onEdit={startLoc} onSave={saveLoc} onCancel={() => setEditLoc(false)}>
          <Row label="Default language">{editLoc ? <Select value={loc.locale} onChange={(v) => setLoc({ ...loc, locale: v })} options={LANGUAGES} searchable={false} /> : <Val>{langLabel}</Val>}</Row>
          <Row label="Default timezone">{editLoc ? <Select value={loc.timezone} onChange={(v) => setLoc({ ...loc, timezone: v })} options={tzOptions} placeholder="Select timezone" /> : <Val>{s.timezone || browserTz}</Val>}</Row>
          <Row label="Default country code">{editLoc ? <Select value={loc.country_code} onChange={(v) => setLoc({ ...loc, country_code: v })} options={COUNTRY_CODES} /> : <Val>{countryLabel}</Val>}</Row>
        </SectionCard>

        <SectionCard title="Subscription" editable={false} editing={false}>
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
        </SectionCard>
      </div>
    </PageBody>
  );
}
