"use client";
import { useEffect, useState } from "react";
import { RefreshLinear as Loader2 } from "solar-icon-set";
import { api } from "@/lib/api";
import type { OrgSettings } from "@/lib/types";
import { useToast, PageBody, SectionLabel, SettingsCard, FieldLabel, INPUT_CLASS, PrimaryButton } from "../_shared";

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
      <SectionLabel>Branding</SectionLabel>
      <SettingsCard className="p-5">
        <div className="flex flex-col gap-5">
          <div>
            <FieldLabel>Page title</FieldLabel>
            <input
              type="text"
              value={pageTitle}
              onChange={(e) => setPageTitle(e.target.value)}
              placeholder="Simpulx"
              className={INPUT_CLASS}
            />
            <p className="text-xs text-muted-foreground/70 mt-1.5">
              Browser tab shows <b>{`{page} - ${pageTitle || "Simpulx"}`}</b> (e.g. <b>{`Dashboard - ${pageTitle || "Simpulx"}`}</b>).
            </p>
          </div>
          <div>
            <FieldLabel>Meta title</FieldLabel>
            <textarea
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              rows={2}
              placeholder="Used for the page meta/description tag"
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm text-foreground outline-none resize-none transition-shadow focus:border-primary"
            />
          </div>
          <div className="flex justify-end">
            <PrimaryButton onClick={save} disabled={saving || !dirty}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : dirty ? "Save changes" : "Saved"}
            </PrimaryButton>
          </div>
        </div>
      </SettingsCard>
    </PageBody>
  );
}
