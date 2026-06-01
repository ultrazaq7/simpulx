"use client";
import { useEffect, useState } from "react";
import { Box, Typography, TextField, Button, CircularProgress } from "@mui/material";
import { api } from "@/lib/api";
import type { OrgSettings } from "@/lib/types";
import { useToast, PageBody, SectionLabel } from "../_shared";

const BRAND_DEFAULTS = { page_title: "Simpulx", meta_title: "Simpulx - Omnichannel WhatsApp Business Platform for Modern Teams" };

export default function BrandingSettingsPage() {
  const { notify, ToastHost } = useToast();
  const [settings, setSettings] = useState<OrgSettings>({});
  const [pageTitle, setPageTitle] = useState(BRAND_DEFAULTS.page_title);
  const [metaTitle, setMetaTitle] = useState(BRAND_DEFAULTS.meta_title);
  const [origPageTitle, setOrigPageTitle] = useState(BRAND_DEFAULTS.page_title);
  const [origMetaTitle, setOrigMetaTitle] = useState(BRAND_DEFAULTS.meta_title);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getOrganization().then((o) => {
      const s = o.settings ?? {};
      setSettings(s);
      const pt = s.branding?.page_title || BRAND_DEFAULTS.page_title;
      const mt = s.branding?.meta_title || BRAND_DEFAULTS.meta_title;
      setPageTitle(pt); setMetaTitle(mt); setOrigPageTitle(pt); setOrigMetaTitle(mt);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const dirty = pageTitle.trim() !== origPageTitle || metaTitle.trim() !== origMetaTitle;

  async function save() {
    setSaving(true);
    try {
      await api.updateOrganization({ settings: { ...settings, branding: { page_title: pageTitle.trim(), meta_title: metaTitle.trim() } } });
      if (typeof document !== "undefined") document.title = `Settings - ${pageTitle.trim()}`;
      setOrigPageTitle(pageTitle.trim()); setOrigMetaTitle(metaTitle.trim());
      notify("Branding saved");
    } catch (e) { notify(String(e), "error"); }
    finally { setSaving(false); }
  }

  if (loading) return <PageBody><Box sx={{ display: "flex", justifyContent: "center", py: 10 }}><CircularProgress /></Box></PageBody>;

  return (
    <PageBody maxWidth={680}>
      {ToastHost}
      <SectionLabel>Branding</SectionLabel>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "8px", p: 2.5 }}>
        <Box>
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, mb: 0.5, color: "text.secondary" }}>Page title</Typography>
          <TextField fullWidth size="small" value={pageTitle} onChange={(e) => setPageTitle(e.target.value)} placeholder="Simpulx" />
          <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 0.75 }}>
            Browser tab shows <b>{`{page} - ${pageTitle || "Simpulx"}`}</b> (e.g. <b>{`Dashboard - ${pageTitle || "Simpulx"}`}</b>).
          </Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, mb: 0.5, color: "text.secondary" }}>Meta title</Typography>
          <TextField fullWidth size="small" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} multiline minRows={2} placeholder="Used for the page meta/description tag" />
        </Box>
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="contained" onClick={save} disabled={saving || !dirty} sx={{ borderRadius: "8px", fontWeight: 600, textTransform: "none", px: 3 }}>
            {saving ? <CircularProgress size={16} color="inherit" /> : dirty ? "Save changes" : "Saved"}
          </Button>
        </Box>
      </Box>
    </PageBody>
  );
}
