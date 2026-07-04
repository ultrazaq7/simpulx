"use client";
import { useMemo, useState } from "react";
import { ArrowSquareOut as ExternalLink, PaperPlaneRight as Send } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Select } from "@/components/Select";
import SidePanel from "@/components/SidePanel";
import type { Template } from "@/lib/types";

// "Send Template" wizard: pick an approved template, fill its {{variables}}, preview
// it on a phone mock, then drop the rendered text into the composer to send.
export default function TemplateWizard({ templates, contactName, onClose, onUse }: {
  templates: Template[];
  contactName?: string | null;
  onClose: () => void;
  onUse: (text: string) => void;
}) {
  const [selId, setSelId] = useState(templates[0]?.id || "");
  const sel = templates.find((t) => t.id === selId) || null;
  const variables = sel?.variables || [];
  const [values, setValues] = useState<Record<string, string>>({});

  const filled = useMemo(() => {
    if (!sel) return "";
    let text = [sel.header_text, sel.body, sel.footer].filter(Boolean).join("\n\n");
    for (const v of variables) text = text.split(`{{${v}}}`).join(values[v]?.trim() ? values[v] : `{{${v}}}`);
    return text;
  }, [sel, variables, values]);

  return (
    <SidePanel
      open
      onClose={onClose}
      title="Send template"
      description="Pick an approved template, fill its variables, then drop it into the composer."
      width="lg"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <button onClick={onClose} className="px-3.5 py-2 rounded-md text-[13px] font-semibold text-foreground/70 hover:bg-muted outline-none">Cancel</button>
          <button onClick={() => sel && onUse(filled)} disabled={!sel || !filled}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-bold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 outline-none shadow-sm transition-colors">
            <Send className="w-4 h-4" />Use template
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Select + variables */}
        <div>
          <div className="flex items-end gap-2 mb-4">
              <div className="flex-1">
                <label className="text-[12px] font-bold text-foreground/80 mb-1.5 block">Select template</label>
                <Select value={selId} onChange={(v) => { setSelId(v); setValues({}); }}
                  placeholder="Choose a template"
                  options={templates.map((t) => ({ value: t.id, label: `${t.name} (${t.language})` }))} />
              </div>
              <Link href="/settings/templates" className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-[13px] font-semibold text-foreground hover:bg-muted transition-colors outline-none shrink-0">
                <ExternalLink className="w-3.5 h-3.5" />Create
              </Link>
            </div>

            {!sel ? (
              <p className="text-sm text-muted-foreground py-8 text-center">{templates.length === 0 ? "No approved templates yet." : "Pick a template to preview it."}</p>
            ) : (
              <>
                <p className="text-[12px] font-bold text-foreground/80 mb-1.5">Template body</p>
                <div className="rounded-lg bg-muted/50 border border-border p-3.5 text-[13px] leading-relaxed text-foreground whitespace-pre-wrap mb-4">{filled}</div>

                {variables.length > 0 && (
                  <div>
                    <p className="text-[12px] font-bold text-foreground/80 mb-2">Fill variables</p>
                    <div className="space-y-2.5">
                      {variables.map((v) => (
                        <div key={v} className="flex items-center gap-2">
                          <span className="w-12 shrink-0 text-[12px] font-mono text-muted-foreground">{`{{${v}}}`}</span>
                          <input value={values[v] || ""} onChange={(e) => setValues((p) => ({ ...p, [v]: e.target.value }))}
                            placeholder={`Value for ${v}`}
                            className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
        </div>

        {/* Phone preview */}
        <div>
          <p className="text-[12px] font-bold text-foreground/70 mb-2">Preview</p>
          <div className="rounded-[24px] border-[3px] border-[#2D2D44] bg-[#1A1A2E] p-1.5 shadow-xl max-w-[280px]">
            <div className="rounded-[18px] overflow-hidden bg-[#ECE5DD]">
              <div className="h-10 bg-[#075E54] flex items-center px-3 gap-2">
                <div className="w-6 h-6 rounded-full bg-white/25 shrink-0" />
                <span className="text-white text-[11px] font-semibold truncate">{contactName || "Customer"}</span>
              </div>
              <div className="min-h-[220px] p-3" style={{ background: "#ECE5DD", backgroundImage: "radial-gradient(rgba(0,0,0,0.035) 1px,transparent 1px)", backgroundSize: "14px 14px" }}>
                <div className="max-w-[220px] rounded-lg rounded-tl-sm bg-white px-3 pt-2 pb-1.5 shadow-sm">
                  <p className="text-[11.5px] leading-relaxed text-[#303030] whitespace-pre-wrap break-words">{filled || "(select a template)"}</p>
                  <p className="text-right text-[8.5px] text-[#8D9A9E] mt-1">11:44</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SidePanel>
  );
}
