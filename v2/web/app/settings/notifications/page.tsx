"use client";
import { useEffect, useState } from "react";
import { Box, Typography, Switch, CircularProgress } from "@mui/material";
import { api } from "@/lib/api";
import type { OrgSettings } from "@/lib/types";
import { useToast, PageBody, SectionLabel } from "../_shared";

const NOTIF_TILES: { key: keyof import("@/lib/types").OrgNotifications; title: string; subtitle: string }[] = [
  { key: "newMessages", title: "New message notifications", subtitle: "Notify the team when a customer sends a new message." },
  { key: "newConversations", title: "New conversation alerts", subtitle: "Alert when a fresh conversation enters the inbox." },
  { key: "emailDigest", title: "Email digest", subtitle: "Send a daily summary email for the workspace." },
  { key: "sound", title: "Sound notifications", subtitle: "Play a sound alert on new activity." },
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

  if (loading) return <PageBody><Box sx={{ display: "flex", justifyContent: "center", py: 10 }}><CircularProgress /></Box></PageBody>;

  return (
    <PageBody maxWidth={680}>
      {ToastHost}
      <SectionLabel>Notifications</SectionLabel>
      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px", bgcolor: "background.paper" }}>
        {NOTIF_TILES.map((t, i) => (
          <Box key={t.key} sx={{ display: "flex", alignItems: "center", px: 2.5, py: 1.75, borderTop: i ? "1px solid" : "none", borderColor: "divider" }}>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{t.title}</Typography>
              <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{t.subtitle}</Typography>
            </Box>
            <Switch checked={!!prefs[t.key]} onChange={(e) => {
              const next = { ...prefs, [t.key]: e.target.checked };
              setPrefs(next); save(next);
            }} />
          </Box>
        ))}
      </Box>
    </PageBody>
  );
}
