"use client";
import { useEffect, useState } from "react";
import { Box, TextField, Button, CircularProgress, Divider, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { getUser } from "@/lib/api";
import type { OrgSettings } from "@/lib/types";
import { useToast, PageBody, SectionLabel } from "../_shared";

export default function GeneralSettingsPage() {
  const { notify, ToastHost } = useToast();
  const [orgId, setOrgId] = useState("");
  const [name, setName] = useState("");
  const [origName, setOrigName] = useState("");
  const [settings, setSettings] = useState<OrgSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getOrganization().then((o) => {
      setOrgId(o.id);
      setName(o.name || "");
      setOrigName(o.name || "");
      setSettings(o.settings ?? {});
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!name.trim()) { notify("Workspace name is required", "error"); return; }
    setSaving(true);
    try {
      await api.updateOrganization({ name: name.trim(), settings });
      setOrigName(name.trim());
      notify("Workspace updated");
    } catch (e) { notify(String(e), "error"); }
    finally { setSaving(false); }
  }

  const user = getUser();
  const dirty = name.trim() !== origName;

  if (loading) return <PageBody><Box sx={{ display: "flex", justifyContent: "center", py: 10 }}><CircularProgress /></Box></PageBody>;

  return (
    <PageBody maxWidth={680}>
      {ToastHost}
      <SectionLabel>Workspace</SectionLabel>
      <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "8px", p: 2.5, mb: 3 }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: "text.secondary", mb: 0.75 }}>Workspace name</Typography>
        <TextField fullWidth size="small" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your company or workspace name" />
        <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 0.75 }}>
          Shown across the dashboard and in team invitations.
        </Typography>

        <Divider sx={{ my: 2.5 }} />

        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
          <Box>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: "text.secondary" }}>Workspace ID</Typography>
            <Typography sx={{ fontSize: 13, fontFamily: "monospace", mt: 0.25 }}>{orgId || "—"}</Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
          <Button variant="contained" onClick={save} disabled={saving || !dirty}
            sx={{ borderRadius: "8px", fontWeight: 600, textTransform: "none", px: 3 }}>
            {saving ? <CircularProgress size={16} color="inherit" /> : dirty ? "Save changes" : "Saved"}
          </Button>
        </Box>
      </Box>

      <SectionLabel>Signed in as</SectionLabel>
      <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "8px", p: 2.5 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Name</Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{user?.name || "—"}</Typography>
        </Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Email</Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{user?.email || "—"}</Typography>
        </Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>Role</Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{user?.role || "—"}</Typography>
        </Box>
      </Box>
    </PageBody>
  );
}
