"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2, ChevronDown, Globe, Clock, Building2, Copy, Check } from "lucide-react";
import { api } from "@/lib/api";
import type { OrgSettings } from "@/lib/types";
import { useToast, PageBody, SectionLabel, SettingsCard, FieldLabel, INPUT_CLASS, PrimaryButton } from "../_shared";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "id", label: "Indonesia" },
];

// ── Timezone list ──
function getTimezones() {
  try { return Intl.supportedValuesOf("timeZone"); }
  catch { return ["Asia/Jakarta", "Asia/Singapore", "America/New_York", "America/Los_Angeles", "Europe/London", "UTC"]; }
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

  // Locale
  const [locale, setLocale] = useState("en");
  const [origLocale, setOrigLocale] = useState("en");
  const [langOpen, setLangOpen] = useState(false);

  // Timezone
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [origTimezone, setOrigTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [tzOpen, setTzOpen] = useState(false);
  const [tzSearch, setTzSearch] = useState("");

  const timezones = useMemo(() => getTimezones(), []);
  const filteredTz = useMemo(() => {
    if (!tzSearch.trim()) return timezones;
    const q = tzSearch.toLowerCase();
    return timezones.filter((tz) => tz.toLowerCase().includes(q));
  }, [timezones, tzSearch]);

  useEffect(() => {
    api.getOrganization().then((o) => {
      setOrgId(o.id);
      setName(o.name || "");
      setOrigName(o.name || "");
      const s = o.settings ?? {};
      setSettings(s);
      const l = (s as any).locale || "en";
      setLocale(l); setOrigLocale(l);
      const t = (s as any).timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      setTimezone(t); setOrigTimezone(t);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const dirty = name.trim() !== origName || locale !== origLocale || timezone !== origTimezone;

  async function save() {
    if (!name.trim()) { notify("Workspace name is required", "error"); return; }
    setSaving(true);
    try {
      const nextSettings = { ...settings, locale, timezone };
      await api.updateOrganization({ name: name.trim(), settings: nextSettings });
      setOrigName(name.trim());
      setOrigLocale(locale);
      setOrigTimezone(timezone);
      setSettings(nextSettings);
      // Apply the new default language to the live UI immediately.
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

  if (loading) return (
    <PageBody>
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    </PageBody>
  );

  return (
    <PageBody maxWidth={720}>
      {ToastHost}

      {/* ── Workspace ── */}
      <SectionLabel>Workspace</SectionLabel>
      <SettingsCard className="p-6 mb-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center shrink-0">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <FieldLabel>Workspace name</FieldLabel>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your company or workspace name"
              className={INPUT_CLASS}
            />
            <p className="text-[11px] text-muted-foreground/70 mt-1.5">Shown across the dashboard and in team invitations.</p>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Workspace ID</p>
              <p className="text-[13px] font-mono text-foreground/80">{orgId || "—"}</p>
            </div>
            <button
              onClick={copyOrgId}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors outline-none"
            >
              {copied ? <><Check className="w-3.5 h-3.5 text-primary" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
            </button>
          </div>
        </div>
      </SettingsCard>

      {/* ── Locale ── */}
      <SectionLabel>Locale</SectionLabel>
      <SettingsCard className="p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Language */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <FieldLabel className="mb-0">Default language</FieldLabel>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setLangOpen(!langOpen)}
                className={cn(INPUT_CLASS, "flex items-center justify-between text-left cursor-pointer")}
              >
                <span className="truncate">{LANGUAGES.find((l) => l.code === locale)?.label ?? "English"}</span>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", langOpen && "rotate-180")} />
              </button>
              {langOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
                  <div className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-xl z-50 py-1 animate-scale-in origin-top">
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => { setLocale(l.code); setLangOpen(false); }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 text-[13px] font-medium text-left transition-colors",
                          l.code === locale ? "bg-primary/10 text-primary" : "text-foreground/80 hover:bg-muted",
                        )}
                      >
                        {l.label}
                        {l.code === locale && <Check className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/70 mt-1.5">Sets the default language for your workspace.</p>
          </div>

          {/* Timezone */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <FieldLabel className="mb-0">Default timezone</FieldLabel>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setTzOpen(!tzOpen)}
                className={cn(INPUT_CLASS, "flex items-center justify-between text-left cursor-pointer")}
              >
                <span className="truncate">{timezone}</span>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", tzOpen && "rotate-180")} />
              </button>
              {tzOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setTzOpen(false)} />
                  <div className="absolute left-0 right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-xl z-50 max-h-[260px] flex flex-col overflow-hidden animate-scale-in origin-top">
                    <div className="p-2 border-b border-border shrink-0">
                      <input
                        autoFocus
                        value={tzSearch}
                        onChange={(e) => setTzSearch(e.target.value)}
                        placeholder="Search timezone..."
                        className="w-full h-8 px-3 rounded-md border border-input bg-background text-[13px] outline-none focus:border-primary"
                      />
                    </div>
                    <div className="overflow-y-auto flex-1 p-1">
                      {filteredTz.length === 0 ? (
                        <p className="text-center text-xs text-muted-foreground py-4">No matches</p>
                      ) : filteredTz.map((tz) => (
                        <button
                          key={tz}
                          type="button"
                          onClick={() => { setTimezone(tz); setTzOpen(false); setTzSearch(""); }}
                          className={cn(
                            "w-full text-left px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors outline-none",
                            tz === timezone ? "bg-primary/10 text-primary" : "text-foreground/80 hover:bg-muted",
                          )}
                        >
                          {tz}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/70 mt-1.5">Used for scheduling broadcasts and reports.</p>
          </div>
        </div>
      </SettingsCard>

      {/* ── Save ── */}
      <div className="flex justify-end">
        <PrimaryButton onClick={save} disabled={saving || !dirty}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : dirty ? "Save changes" : "Saved"}
        </PrimaryButton>
      </div>
    </PageBody>
  );
}
