"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshLinear as Loader2, BellLinear as Bell, LetterLinear as Mail, ChatRoundLinear as MessageSquare, QuestionCircleLinear as Volume2, ArrowLeftLinear as ArrowLeft, LetterLinear as MailCheck, CameraLinear as Camera } from "solar-icon-set";
import { api, getUser, getToken, setSession } from "@/lib/api";
import type { OrgSettings } from "@/lib/types";
import { cn, initials } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { Select } from "@/components/Select";

// ── Toast ──
function useToast() {
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);
  const notify = (msg: string, ok = true) => setToast({ msg, ok });
  const Host = toast ? (
    <div className="fixed bottom-6 left-6 z-[110] animate-scale-in">
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

// Current UTC offset for an IANA zone, e.g. "UTC+7" / "UTC-5:30".
function tzOffset(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date());
    const name = parts.find((p) => p.type === "timeZoneName")?.value || "";
    return name.replace("GMT", "UTC").replace(/^UTC$/, "UTC+0");
  } catch {
    return "";
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
  const [avatar, setAvatar] = useState(user?.avatar || "");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Notification prefs
  const [settings, setSettings] = useState<OrgSettings>({});
  const [prefs, setPrefs] = useState<Record<string, boolean>>(NOTIF_DEFAULTS);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  // Email change (requires verifying the new address)
  const [origEmail, setOrigEmail] = useState(user?.email || "");
  const [email, setEmail] = useState(user?.email || "");
  const [emailSaving, setEmailSaving] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  // Change password
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const timezones = useMemo(() => getTimezones(), []);
  // Build "Zone (UTC+offset)" labels so the shared Select can search either part.
  const tzSelectOptions = useMemo(
    () => timezones.map((tz) => { const off = tzOffset(tz); return { value: tz, label: off ? `${tz} (${off})` : tz }; }),
    [timezones],
  );

  useEffect(() => {
    api.getOrganization().then((o) => {
      const s = o.settings ?? {};
      setSettings(s);
      setPrefs({ ...NOTIF_DEFAULTS, ...(s.notifications ?? {}) });
      if (s.timezone) setTimezone(s.timezone as string);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Pull live name/email from the server so a verified email change shows up
  // (localStorage still holds the old address until the next login). Also refresh
  // the cached session so the rest of the app reflects it.
  useEffect(() => {
    api.me().then((me) => {
      if (me.name) { setName(me.name); setOrigName(me.name); }
      if (me.email) { setEmail(me.email); setOrigEmail(me.email); }
      if (me.avatar !== undefined) setAvatar(me.avatar || "");
      const token = getToken();
      if (token && user) setSession(token, { ...user, name: me.name ?? user.name, email: me.email ?? user.email, avatar: me.avatar ?? (user as any).avatar } as any);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadAvatar(file: File) {
    if (!file.type.startsWith("image/")) { notify("Please choose an image file", false); return; }
    if (file.size > 5 * 1024 * 1024) { notify("Image too large (max 5 MB)", false); return; }
    if (!user?.id) { notify("User not found", false); return; }
    setAvatarUploading(true);
    try {
      const up = await api.uploadFile(file);
      await api.updateUser(user.id, { avatar_url: up.url });
      setAvatar(up.url);
      const token = getToken();
      if (token) setSession(token, { ...user, avatar: up.url } as any);
      notify("Profile photo updated");
    } catch (e) { notify(String(e), false); }
    finally { setAvatarUploading(false); }
  }

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

  async function sendEmailVerification() {
    const next = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) { notify("Enter a valid email address", false); return; }
    setEmailSaving(true);
    try {
      await api.requestEmailChange(next);
      setPendingEmail(next);
      notify("Verification link sent to " + next);
    } catch (e) { notify(String(e).replace(/^Error:\s*/, ""), false); }
    finally { setEmailSaving(false); }
  }

  async function changePassword() {
    if (newPw.length < 8) { notify("New password must be at least 8 characters", false); return; }
    if (newPw !== confirmPw) { notify("New passwords do not match", false); return; }
    setPwSaving(true);
    try {
      await api.changePassword(curPw, newPw);
      setCurPw(""); setNewPw(""); setConfirmPw("");
      notify("Password updated");
    } catch (e) { notify(String(e).replace(/^Error:\s*/, ""), false); }
    finally { setPwSaving(false); }
  }

  if (loading) return (
    <div className="flex justify-center items-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  const dirty = name.trim() !== origName;
  const emailChanged = email.trim().toLowerCase() !== origEmail.toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <div className="h-full overflow-y-auto bg-background">
      {Host}
      <div className="max-w-5xl px-8 py-8">
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
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="relative w-16 h-16 rounded-full overflow-hidden shrink-0 shadow-md group outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Change profile photo"
              >
                {avatar ? (
                  <img src={avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full bg-brand-gradient text-white flex items-center justify-center text-xl font-bold">{initials(user?.name || "")}</span>
                )}
                <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center">
                  {avatarUploading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
                </span>
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ""; }} />
              <div>
                <p className="text-[18px] font-bold text-foreground">{user?.name || "—"}</p>
                <p className="text-[13px] text-muted-foreground capitalize">{user?.role || "—"}</p>
              </div>
            </div>

            {/* Single stacked column: Profile -> Password -> System preference. */}
            <div className="max-w-2xl space-y-8">
            <div>
            <h3 className="text-[16px] font-bold text-foreground mb-5">{tr("account.tab_profile")}</h3>

            <div className="bg-card border border-border rounded-xl p-5 space-y-5">
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
                <div className="flex gap-2">
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setPendingEmail(""); }}
                    className="flex-1 min-w-0 h-11 px-4 rounded-lg border border-input bg-muted/30 text-[14px] text-foreground outline-none transition-all focus:border-primary focus:bg-background"
                  />
                  {emailChanged && (
                    <button
                      onClick={sendEmailVerification}
                      disabled={emailSaving || !emailValid}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-4 rounded-lg text-[13px] font-semibold transition-all outline-none shrink-0",
                        !emailSaving && emailValid ? "bg-primary text-white hover:bg-primary-dark shadow-sm" : "bg-muted text-muted-foreground cursor-not-allowed",
                      )}
                    >
                      {emailSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><MailCheck className="w-4 h-4" /> Verify</>}
                    </button>
                  )}
                </div>
                {pendingEmail ? (
                  <p className="text-[11px] text-amber-600 mt-1.5 flex items-start gap-1">
                    <MailCheck className="w-3.5 h-3.5 mt-px shrink-0" />
                    <span>Verification link sent to <b>{pendingEmail}</b>. Confirm it from your inbox to activate the new email.</span>
                  </p>
                ) : emailChanged ? (
                  <p className="text-[11px] text-muted-foreground/70 mt-1.5">We will email a verification link to the new address. The change applies only after you confirm it.</p>
                ) : null}
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

              <div className="flex justify-end pt-1">
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
            </div>{/* /profile block */}

            {/* Password - directly under profile */}
            <div>
            <h3 className="text-[16px] font-bold text-foreground mb-5">Password</h3>
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Current password</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={curPw}
                  onChange={(e) => setCurPw(e.target.value)}
                  className="w-full h-11 px-4 rounded-lg border border-input bg-muted/30 text-[14px] text-foreground outline-none transition-all focus:border-primary focus:bg-background"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">New password</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    className="w-full h-11 px-4 rounded-lg border border-input bg-muted/30 text-[14px] text-foreground outline-none transition-all focus:border-primary focus:bg-background"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Confirm new password</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    className="w-full h-11 px-4 rounded-lg border border-input bg-muted/30 text-[14px] text-foreground outline-none transition-all focus:border-primary focus:bg-background"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <p className="text-[11px] text-muted-foreground/70">Use at least 8 characters.</p>
                <button
                  onClick={changePassword}
                  disabled={pwSaving || !curPw || !newPw || !confirmPw}
                  className={cn(
                    "inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-all outline-none shrink-0",
                    !pwSaving && curPw && newPw && confirmPw
                      ? "bg-primary text-white hover:bg-primary-dark shadow-sm"
                      : "bg-muted text-muted-foreground cursor-not-allowed",
                  )}
                >
                  {pwSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update password"}
                </button>
              </div>
            </div>
            </div>{/* /password */}

            {/* System preference (timezone) */}
            <div>
              <h3 className="text-[16px] font-bold text-foreground mb-5">{tr("account.system_pref")}</h3>
              <div className="bg-card border border-border rounded-xl p-5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{tr("account.your_timezone")}</label>
                <Select value={timezone} options={tzSelectOptions} onChange={saveTimezone} placeholder="Select timezone" />
              </div>
            </div>
            </div>{/* /stack */}

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

          </div>
        )}
      </div>
    </div>
  );
}
