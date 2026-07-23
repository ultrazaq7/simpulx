"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Building2, Lock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
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

// Org-wide date format. Stored in settings.date_format and consumed by the shared
// formatDate() so every date in the web app (and the mobile app) reads the same way.
const DATE_FORMATS = [
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "YYYY/MM/DD", label: "YYYY/MM/DD" },
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

// Working hours (stored in org settings.working_hours). Serialized into the form
// as a JSON string so it flows through the same dirty-tracking + UnsavedBar as
// every other field. normalizeWH gives a canonical shape/order so an untouched
// value round-trips to the identical string (never a false "unsaved" state).
type WHDay = { on: boolean; start: string; end: string };
type WorkHours = { enabled: boolean; days: Record<string, WHDay> };
const DAYS: [string, string][] = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
function normalizeWH(raw: unknown): WorkHours {
  const src = (raw && typeof raw === "object" ? raw : {}) as { enabled?: unknown; days?: Record<string, Partial<WHDay>> };
  const days: Record<string, WHDay> = {};
  for (const [k] of DAYS) {
    const d = (src.days?.[k] ?? {}) as Partial<WHDay>;
    days[k] = {
      on: typeof d.on === "boolean" ? d.on : (k !== "sat" && k !== "sun"),
      start: typeof d.start === "string" ? d.start : "09:00",
      end: typeof d.end === "string" ? d.end : "18:00",
    };
  }
  return { enabled: !!src.enabled, days };
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors outline-none", checked ? "bg-primary" : "bg-muted")}>
      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5", checked ? "translate-x-[18px] ml-0.5" : "translate-x-0.5")} />
    </button>
  );
}

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

type Form = { name: string; industry: string; company_size: string; website: string; locale: string; timezone: string; country_code: string; date_format: string; working_hours: string };

export default function GeneralSettingsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { notify, ToastHost } = useToast();
  const { setLang } = useI18n();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    loadPermissions().then((doc) => {
      const ok = canWith(doc, getUser()?.role, "view_company_details");
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

  const [form, setForm] = useState<Form>({ name: "", industry: "", company_size: "", website: "", locale: "en", timezone: browserTz, country_code: "62", date_format: "MM/DD/YYYY", working_hours: JSON.stringify(normalizeWH(undefined)) });
  const [orig, setOrig] = useState<Form>(form);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const wh = useMemo<WorkHours>(() => { try { return JSON.parse(form.working_hours); } catch { return normalizeWH(undefined); } }, [form.working_hours]);
  const setWh = (next: WorkHours) => set("working_hours", JSON.stringify(next));

  useEffect(() => {
    api.getOrganization().then((o) => {
      const s = (o.settings ?? {}) as Record<string, string>;
      const next: Form = {
        name: o.name || "", industry: s.industry || "", company_size: s.company_size || "",
        website: s.website || "",
        locale: s.locale || "en", timezone: s.timezone || browserTz, country_code: s.country_code || "62",
        date_format: s.date_format || "MM/DD/YYYY",
        working_hours: JSON.stringify(normalizeWH((o.settings as Record<string, unknown> | undefined)?.working_hours)),
      };
      setSettings(o.settings ?? {}); setForm(next); setOrig(next);
    }).catch(() => {}).finally(() => setLoading(false));
    api.getSubscription().then(setSub).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = (Object.keys(form) as (keyof Form)[]).filter((k) => form[k] !== orig[k]);

  async function save() {
    if (!form.name.trim()) { notify(t("settings.companyNameIsRequired"), "error"); return; }
    setSaving(true);
    try {
      const next = { ...settings, company_size: form.company_size, website: form.website.trim(), locale: form.locale, timezone: form.timezone, country_code: form.country_code, date_format: form.date_format, working_hours: JSON.parse(form.working_hours) };
      await api.updateOrganization({ name: form.name.trim(), settings: next });
      setSettings(next); setOrig(form); setLang(form.locale);
      try { localStorage.setItem("simpulx_date_format", form.date_format); } catch { /* ignore */ }
      notify(t("settings.changesSaved"));
    } catch (e) { notify(String(e), "error"); } finally { setSaving(false); }
  }

  if (loading || allowed !== true) return (
    <PageBody><div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></PageBody>
  );

  return (
    <PageBody wide>
      {ToastHost}
      <div className="bg-card border border-border rounded-xl shadow-xs p-6 sm:p-8 mb-24 space-y-9 max-w-[1040px]">
        <Section title={t("settings.company")}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 text-primary-text grid place-items-center text-lg font-bold shrink-0">
              {initials(form.name) || <Building2 className="w-6 h-6" />}
            </div>
            <div className="flex-1 min-w-0">
              <label className={LBL}>{t("settings.companyName")}</label>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={t("settings.yourCompanyName")} className={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Industry is READ-ONLY here on purpose: it is the org's segment, set by
                Simpulx at onboarding / in Client Management, and it gates
                segment-specific features (e.g. the property e-catalog). A tenant
                editing it themselves would silently switch those features on/off. */}
            <div>
              <label className={LBL}>{t("settings.industry")}</label>
              <div className={cn(INPUT, "flex items-center justify-between gap-2 bg-muted/50 text-muted-foreground cursor-not-allowed")}
                title={t("settings.industryLocked")}>
                <span className="truncate">{form.industry || t("settings.notSet")}</span>
                <Lock className="w-3.5 h-3.5 shrink-0 opacity-60" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{t("settings.industryLocked")}</p>
            </div>
            <div><label className={LBL}>{t("settings.companySize")}</label><Select value={form.company_size} onChange={(v) => set("company_size", v)} options={COMPANY_SIZES} searchable={false} /></div>
            <div><label className={LBL}>{t("dashboard.website")}</label><input type="url" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://example.com" className={INPUT} /></div>
          </div>
        </Section>

        <div className="border-t border-border" />

        <Section title={t("settings.localization")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><label className={LBL}>{t("settings.defaultLanguage")}</label><Select value={form.locale} onChange={(v) => set("locale", v)} options={LANGUAGES} searchable={false} /></div>
            <div><label className={LBL}>{t("settings.defaultCountryCode")}</label><Select value={form.country_code} onChange={(v) => set("country_code", v)} options={COUNTRY_CODES} /></div>
            <div><label className={LBL}>{t("settings.defaultTimezone")}</label><Select value={form.timezone} onChange={(v) => set("timezone", v)} options={tzOptions} placeholder={t("settings.selectTimezone")} /></div>
            <div><label className={LBL}>{t("settings.dateFormat")}</label><Select value={form.date_format} onChange={(v) => set("date_format", v)} options={DATE_FORMATS} searchable={false} /></div>
          </div>
        </Section>

        <div className="border-t border-border" />

        <Section title={t("settings.workingHours")}>
          <div className="flex items-center gap-3">
            <Toggle checked={wh.enabled} onChange={(v) => setWh({ ...wh, enabled: v })} />
            <span className="text-[13px] font-medium text-foreground">{wh.enabled ? t("settings.on") : t("settings.off")}</span>
          </div>
          {wh.enabled && (
            <div className="space-y-2.5 pt-1">
              {DAYS.map(([k, label]) => {
                const d = wh.days[k];
                return (
                  <div key={k} className="flex items-center gap-3">
                    <label className="flex items-center gap-2.5 w-36 shrink-0 cursor-pointer">
                      <input type="checkbox" checked={d.on}
                        onChange={(e) => setWh({ ...wh, days: { ...wh.days, [k]: { ...d, on: e.target.checked } } })}
                        className="w-4 h-4 rounded border-input accent-primary cursor-pointer" />
                      <span className={cn("text-[13.5px]", d.on ? "text-foreground font-medium" : "text-muted-foreground")}>{label}</span>
                    </label>
                    <input type="time" value={d.start} disabled={!d.on}
                      onChange={(e) => setWh({ ...wh, days: { ...wh.days, [k]: { ...d, start: e.target.value } } })}
                      className={cn(INPUT, "max-w-[150px]", !d.on && "opacity-40")} />
                    <span className="text-muted-foreground text-sm">-</span>
                    <input type="time" value={d.end} disabled={!d.on}
                      onChange={(e) => setWh({ ...wh, days: { ...wh.days, [k]: { ...d, end: e.target.value } } })}
                      className={cn(INPUT, "max-w-[150px]", !d.on && "opacity-40")} />
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <div className="border-t border-border" />

        <Section title={t("settings.subscription")}>
          {sub ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-foreground capitalize">{sub.package_name}</span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-success/10 text-success capitalize">{sub.status}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <QuotaRow label={t("settings.teamMembers")} used={sub.used_users} limit={sub.quotas?.users} />
                <QuotaRow label={t("settings.simpulerCreditsThisMonth")} used={sub.used_simpuler_credits} limit={sub.quotas?.simpuler_credits} />
                <QuotaRow label={t("contacts.customFields")} used={sub.used_custom_fields} limit={sub.quotas?.custom_fields} />
              </div>
              <UsageDetail />
            </div>
          ) : <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
        </Section>
      </div>

      <UnsavedBar count={changed.length} saving={saving} onSave={save} onCancel={() => setForm(orig)} />
    </PageBody>
  );
}

// Detail di balik angka "Simpuler credits (this month)": pemakaian harian 30
// hari (chart) + split per campaign bulan berjalan, dihitung backend dari
// SUMBER YANG SAMA dengan angka headernya supaya tidak pernah beda cerita.
// Kolom alokasi (Credits & Usage per campaign) ditampilkan bersandingan.
function UsageDetail() {
  const { t } = useI18n();
  const [data, setData] = useState<{
    daily: { date: string; replies: number }[];
    by_campaign: { campaign: string; campaign_id: string; replies: number }[];
    allocations: { campaign_id: string; allocated_credits: number; used_credits: number; remaining: number }[];
  } | null>(null);
  useEffect(() => { api.subscriptionUsage().then(setData).catch(() => setData(null)); }, []);

  if (!data) return null;
  const alloc = new Map(data.allocations.map((a) => [a.campaign_id, a]));
  const totalMonth = data.by_campaign.reduce((s, c) => s + c.replies, 0);

  return (
    <div className="space-y-4">
      {data.daily.length > 0 && (
        <div className="rounded-lg border border-border p-3">
          <p className="text-[12.5px] font-semibold text-foreground mb-2">{t("settings.aiRepliesPerDay")}</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data.daily} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }}
                tickFormatter={(d: string) => `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}`} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <RTooltip labelFormatter={(d) => String(d).slice(0, 10)} />
              <Bar dataKey="replies" fill="#0E5B54" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.by_campaign.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <p className="text-[12.5px] font-semibold text-foreground px-3 py-2 border-b border-border">
            {t("settings.usageByCampaign")}
          </p>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/30 border-b border-border">
                <th className="px-3 py-1.5">{t("settings.campaign")}</th>
                <th className="px-3 py-1.5 text-right">{t("settings.repliesThisMonth")}</th>
                <th className="px-3 py-1.5 text-right hidden sm:table-cell">{t("settings.allocated")}</th>
                <th className="px-3 py-1.5 text-right hidden sm:table-cell">{t("settings.remaining")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {data.by_campaign.map((c) => {
                const al = alloc.get(c.campaign_id);
                const share = totalMonth > 0 ? Math.round((c.replies / totalMonth) * 100) : 0;
                return (
                  <tr key={c.campaign_id || c.campaign}>
                    <td className="px-3 py-2 font-medium text-foreground">{c.campaign}
                      <span className="ml-1.5 text-[11px] text-muted-foreground tabular-nums">{share}%</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{c.replies}</td>
                    <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell text-muted-foreground">
                      {al ? `${al.used_credits}/${al.allocated_credits}` : "-"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell text-muted-foreground">
                      {al ? al.remaining : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
