"use client";
import { useEffect, useState } from "react";
import { Bell, CircleNotch as Loader2, Envelope as Mail, Chat as MessageSquare, SpeakerHigh as Volume2 } from "@phosphor-icons/react/ssr";
import { api } from "@/lib/api";
import type { OrgSettings } from "@/lib/types";
import { useToast, PageBody, SectionLabel, SettingsCard } from "../_shared";

const NOTIF_TILES: { key: keyof import("@/lib/types").OrgNotifications; title: string; subtitle: string; icon: any }[] = [
  { key: "newMessages", title: "New message notifications", subtitle: "Notify the team when a customer sends a new message.", icon: Bell },
  { key: "newConversations", title: "New conversation alerts", subtitle: "Alert when a fresh conversation enters the inbox.", icon: MessageSquare },
  { key: "emailDigest", title: "Email digest", subtitle: "Send a daily summary email for the workspace.", icon: Mail },
  { key: "sound", title: "Sound notifications", subtitle: "Play a sound alert on new activity.", icon: Volume2 },
];
const NOTIF_DEFAULTS = { newMessages: true, newConversations: true, emailDigest: false, sound: true };

export default function NotificationsSettingsPage() {
  const { notify, ToastHost } = useToast();
  const [settings, setSettings] = useState<OrgSettings>({});
  const [prefs, setPrefs] = useState<Record<string, boolean>>(NOTIF_DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getOrganization().then((o) => {
      const s = o.settings ?? {};
      setSettings(s);
      setPrefs({ ...NOTIF_DEFAULTS, ...(s.notifications ?? {}) });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function save(payload: Record<string, boolean>) {
    try { await api.updateOrganization({ settings: { ...settings, notifications: payload } }); notify("Notification settings saved"); }
    catch (e) { notify(String(e), "error"); }
  }

  if (loading) return (
    <PageBody>
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    </PageBody>
  );

  return (
    <PageBody maxWidth={680}>
      {ToastHost}
      <SectionLabel>Notifications</SectionLabel>
      <SettingsCard>
        {NOTIF_TILES.map((t, i) => {
          const Icon = t.icon;
          return (
            <div key={t.key} className={`flex items-center px-5 py-4 gap-4 ${i ? "border-t border-border" : ""} transition-colors hover:bg-muted/30`}>
              <div className="w-9 h-9 rounded-lg grid place-items-center bg-primary/[0.07] text-primary shrink-0">
                <Icon className="w-[18px] h-[18px]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{t.title}</p>
                <p className="text-[12.5px] text-muted-foreground">{t.subtitle}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!prefs[t.key]}
                  onChange={(e) => {
                    const next = { ...prefs, [t.key]: e.target.checked };
                    setPrefs(next); save(next);
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
              </label>
            </div>
          );
        })}
      </SettingsCard>
    </PageBody>
  );
}
