"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, Bell, Mail, MessageSquare, Volume2, ChevronDown, ArrowLeft,
} from "lucide-react";
import { api, getUser, getToken, setSession } from "@/lib/api";
import type { OrgSettings } from "@/lib/types";
import { cn, initials } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

// ── Toast ──
function useToast() {
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);
  const notify = (msg: string, ok = true) => setToast({ msg, ok });
  const Host = toast ? (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] animate-scale-in">
      <div className={cn("flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-xl text-sm font-semibold text-white", toast.ok ? "bg-primary" : "bg-destructive")}>
        {toast.msg}
      </div>
    </div>
  ) : null;
  return { notify, Host };
}

// ── Toggle switch ──
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
      <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
    </label>
  );
}

// ── Notification tiles ── (copy resolved via i18n at render time)
const NOTIF_TILES: { key: string; titleKey: string; subKey: string; icon: any }[] = [
  { key: "newMessages", titleKey: "account.notif_new_messages", subKey: "account.notif_new_messages_desc", icon: Bell },
  { key: "newConversations", titleKey: "account.notif_new_conversations", subKey: "account.notif_new_conversations_desc", icon: MessageSquare },
  { key: "emailDigest", titleKey: "account.notif_email_digest", subKey: "account.notif_email_digest_desc", icon: Mail },
  { key: "sound", titleKey: "account.notif_sound", subKey: "account.notif_sound_desc", icon: Volume2 },
];
const NOTIF_DEFAULTS: Record<string, boolean> = { newMessages: true, newConversations: true, emailDigest: false, sound: true };

// ── Timezone list ──
function getTimezones() {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["Asia/Jakarta", "Asia/Singapore", "America/New_York", "America/Los_Angeles", "Europe/London", "UTC"];
  }
}

export default function AccountPage() {
  const router = useRouter();
  const { notify, Host } = useToast();
  const { t: tr } = useI18n();

  const [tab, setTab] = useState<"profile" | "notifications">("profile");
  const [loading, setLoading] = useState(true);

  // Profile data
  const user = getUser();
  const [name, setName] = useState(user?.name || "");
  const [origName, setOrigName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);

  // Notification prefs
  const [settings, setSettings] = useState<OrgSettings>({});
  const [prefs, setPrefs] = useState<Record<string, boolean>>(NOTIF_DEFAULTS);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [tzSearch, setTzSearch] = useState("");
  const [tzOpen, setTzOpen] = useState(false);

  const timezones = useMemo(() => getTimezones(), []);
  const filteredTz = useMemo(() => {
    if (!tzSearch.trim()) return timezones;
    const q = tzSearch.toLowerCase();
    return timezones.filter((tz) => tz.toLowerCase().includes(q));
  }, [timezones, tzSearch]);

  useEffect(() => {
    api.getOrganization().then((o) => {
      const s = o.settings ?? {};
      setSettings(s);
      setPrefs({ ...NOTIF_DEFAULTS, ...(s.notifications ?? {}) });
      if (s.timezone) setTimezone(s.timezone as string);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function saveProfile() {
    if (!name.trim()) { notify("Name is required", false); return; }
    if (!user?.id) { notify("User not found", false); return; }
    setSaving(true);
    try {
      await api.updateUser(user.id, { full_name: name.trim() });
      // Persist to localStorage so Shell picks it up
      const token = getToken();
      if (token) {
        const updated = { ...user, name: name.trim() };
        setSession(token, updated as any);
      }
      setOrigName(name.trim());
      notify("Profile updated");
    } catch (e) { notify(String(e), false); }
    finally { setSaving(false); }
  }

  async function saveNotifPref(payload: Record<string, boolean>) {
    try {
      await api.updateOrganization({ settings: { ...settings, notifications: payload } });
      notify("Notification settings saved");
    } catch (e) { notify(String(e), false); }
  }

  async function saveTimezone(tz: string) {
    setTimezone(tz);
    try {
      const nextSettings = { ...settings, timezone: tz };
      setSettings(nextSettings);
      await api.updateOrganization({ settings: nextSettings });
      notify("Timezone updated");
    } catch (e) { notify(String(e), false); }
  }

  if (loading) return (
    <div className="flex justify-center items-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  const dirty = name.trim() !== origName;

  return (
    <div className="h-full overflow-y-auto bg-background">
      {Host}
      <div className="max-w-[780px] mx-auto px-6 py-8">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors outline-none"
        >
          <ArrowLeft className="w-4 h-4" />
          {tr("account.back")}
        </button>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-border mb-8">
          {(["profile", "notifications"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "pb-3 text-[14px] font-semibold transition-colors outline-none border-b-2 -mb-px capitalize",
                tab === t
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground",
              )}
            >
              {t === "notifications" ? tr("account.tab_notifications") : tr("account.tab_profile")}
            </button>
          ))}
        </div>

        {/* ── PROFILE TAB ── */}
        {tab === "profile" && (
          <div>
            {/* User header */}
            <div className="flex items-center gap-4 mb-8">
              <div className="w-16 h-16 rounded-full bg-brand-gradient text-white flex items-center justify-center text-xl font-bold shrink-0 shadow-md">
                {initials(user?.name || "")}
              </div>
              <div>
                <p className="text-[18px] font-bold text-foreground">{user?.name || "—"}</p>
                <p className="text-[13px] text-muted-foreground capitalize">{user?.role || "—"}</p>
              </div>
            </div>

            {/* Personal info form */}
            <h3 className="text-[16px] font-bold text-foreground mb-5">{tr("account.tab_profile")}</h3>

            <div className="space-y-5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{tr("account.name")}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 px-4 rounded-lg border border-input bg-muted/30 text-[14px] text-foreground outline-none transition-all focus:border-primary focus:bg-background"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{tr("account.email")}</label>
                <input
                  type="text"
                  value={user?.email || "—"}
                  readOnly
                  className="w-full h-11 px-4 rounded-lg border border-input bg-muted/30 text-[14px] text-foreground/60 outline-none cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{tr("account.role")}</label>
                <input
                  type="text"
                  value={user?.role || "—"}
                  readOnly
                  className="w-full h-11 px-4 rounded-lg border border-input bg-muted/30 text-[14px] text-foreground/60 outline-none cursor-not-allowed capitalize"
                />
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={saveProfile}
                disabled={saving || !dirty}
                className={cn(
                  "inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-all outline-none",
                  dirty
                    ? "bg-primary text-white hover:bg-primary-dark shadow-sm"
                    : "bg-muted text-muted-foreground cursor-not-allowed",
                )}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : dirty ? tr("account.save") : tr("common.save")}
              </button>
            </div>
          </div>
        )}

        {/* ── NOTIFICATION PREFERENCE TAB ── */}
        {tab === "notifications" && (
          <div>
            <h3 className="text-[16px] font-bold text-foreground mb-5">{tr("account.tab_notifications")}</h3>

            <div className="bg-card border border-border rounded-xl overflow-hidden mb-8">
              {NOTIF_TILES.map((t, i) => {
                const Icon = t.icon;
                return (
                  <div key={t.key} className={cn("flex items-center px-5 py-4 gap-4 transition-colors hover:bg-muted/30", i > 0 && "border-t border-border")}>
                    <div className="w-9 h-9 rounded-lg grid place-items-center bg-primary/[0.07] text-primary shrink-0">
                      <Icon className="w-[18px] h-[18px]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold text-foreground">{tr(t.titleKey)}</p>
                      <p className="text-[12px] text-muted-foreground">{tr(t.subKey)}</p>
                    </div>
                    <Toggle
                      checked={!!prefs[t.key]}
                      onChange={(v) => {
                        const next = { ...prefs, [t.key]: v };
                        setPrefs(next);
                        saveNotifPref(next);
                      }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Timezone */}
            <h3 className="text-[16px] font-bold text-foreground mb-5">{tr("account.system_pref")}</h3>

            <div className="bg-card border border-border rounded-xl p-5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{tr("account.your_timezone")}</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTzOpen(!tzOpen)}
                  className="w-full h-11 px-4 rounded-lg border border-input bg-muted/30 text-[14px] text-foreground text-left flex items-center justify-between outline-none transition-all hover:border-primary"
                >
                  <span className="truncate">{timezone}</span>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", tzOpen && "rotate-180")} />
                </button>
                {tzOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setTzOpen(false)} />
                    {/* Opens upward: this card sits at the bottom of the scroll area, so a
                        downward menu would be clipped by the overflow container. */}
                    <div className="absolute left-0 right-0 bottom-full mb-1 bg-popover border border-border rounded-lg shadow-xl z-50 max-h-[280px] flex flex-col overflow-hidden animate-scale-in origin-bottom">
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
                            onClick={() => { saveTimezone(tz); setTzOpen(false); setTzSearch(""); }}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-md text-[13px] font-medium transition-colors outline-none",
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
              <p className="text-[11px] text-muted-foreground/70 mt-1.5">{tr("account.your_timezone_desc")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
