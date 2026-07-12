"use client";
import { useI18n } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { api } from "@/lib/api";
import { Select } from "@/components/Select";
import SidePanel from "@/components/SidePanel";
import type { Template, Channel } from "@/lib/types";

// Initiate a WhatsApp conversation by sending an approved HSM template to the
// selected contacts. Pick a channel (if more than one), a template, fill its
// {{variables}}, preview, then send. Backed by POST /api/contacts/send-template.
export default function SendTemplateDrawer({ open, onClose, contactIds, contactName, onSent }: {
  open: boolean;
  onClose: () => void;
  contactIds: string[];
  contactName?: string | null;
  onSent: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [channelId, setChannelId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setErr(""); setValues({}); setTemplateId("");
    Promise.all([api.listChannels().catch(() => []), api.listTemplates().catch(() => [])]).then(([chs, tpls]) => {
      const wa = chs.filter((c) => c.type === "whatsapp");
      setChannels(wa);
      setChannelId(wa[0]?.id ?? "");
      setTemplates(tpls.filter((t) => t.status === "APPROVED"));
    });
  }, [open]);

  const sel = templates.find((t) => t.id === templateId) || null;
  const variables = sel?.variables || [];

  const preview = useMemo(() => {
    if (!sel) return "";
    let text = [sel.header_text, sel.body, sel.footer].filter(Boolean).join("\n\n");
    variables.forEach((v, i) => {
      const val = values[v]?.trim();
      text = text.split(`{{${i + 1}}}`).join(val || `{{${v}}}`);
    });
    return text;
  }, [sel, variables, values]);

  const allFilled = variables.every((v) => (values[v] || "").trim());

  async function send() {
    if (!sel) return;
    setSending(true); setErr("");
    try {
      const res = await api.sendTemplateToContacts({
        contact_ids: contactIds,
        channel_id: channelId || undefined,
        template_id: sel.id,
        variables: variables.map((v) => values[v] || ""),
      });
      const skipped = res.skipped?.length || 0;
      onSent(`Template queued for ${res.queued} contact${res.queued === 1 ? "" : "s"}${skipped ? ` (${skipped} skipped)` : ""}`);
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSending(false);
    }
  }

  const count = contactIds.length;

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={t("automation.sendTemplate")}
      description={count === 1 ? `Start a chat with ${contactName || "this contact"}.` : `Message ${count} contacts.`}
      width="md"
      busy={sending}
      onApply={send}
      applyLabel="Send"
      applyDisabled={!sel || !allFilled}
    >
      <div className="flex flex-col gap-4">
        {channels.length > 1 && (
          <div>
            <label className="text-[12px] font-bold text-foreground/80 mb-1.5 block">{t("components.channel")}</label>
            <Select value={channelId} onChange={setChannelId}
              options={channels.map((c) => ({ value: c.id, label: c.name }))} />
          </div>
        )}

        <div>
          <label className="text-[12px] font-bold text-foreground/80 mb-1.5 block">{t("broadcasts.template")}</label>
          <Select value={templateId} onChange={(v) => { setTemplateId(v); setValues({}); }}
            placeholder={templates.length === 0 ? t("contacts.noApprovedTemplates") : t("contacts.chooseATemplate")}
            options={templates.map((t) => ({ value: t.id, label: `${t.name} (${t.language})` }))} />
        </div>

        {sel && variables.length > 0 && (
          <div>
            <p className="text-[12px] font-bold text-foreground/80 mb-2">{t("contacts.fillVariables")}</p>
            <div className="space-y-2">
              {variables.map((v, i) => (
                <div key={v} className="flex items-center gap-2">
                  <span className="w-9 shrink-0 text-[12px] text-muted-foreground">{`{{${i + 1}}}`}</span>
                  <input value={values[v] || ""} onChange={(e) => setValues((p) => ({ ...p, [v]: e.target.value }))}
                    placeholder={v}
                    className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
              ))}
            </div>
          </div>
        )}

        {sel && (
          <div>
            <p className="text-[12px] font-bold text-foreground/70 mb-2">{t("broadcasts.preview")}</p>
            <div className="rounded-lg bg-[#ECE5DD] p-3">
              <div className="max-w-[240px] rounded-lg rounded-tl-sm bg-white px-3 pt-2 pb-1.5 shadow-sm">
                <p className="text-[12px] leading-relaxed text-[#303030] whitespace-pre-wrap break-words">{preview}</p>
              </div>
            </div>
          </div>
        )}

        {err && <p className="text-[12px] text-destructive">{err}</p>}
        <p className="text-[11.5px] text-muted-foreground">{t("contacts.onlyApprovedWhatsappTemplatesCan")}</p>
      </div>
    </SidePanel>
  );
}
