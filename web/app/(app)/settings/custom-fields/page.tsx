"use client";
// Custom Fields — org-defined typed contact fields (text / number / date /
// dropdown). Values attach to each contact (contact.attributes) and power the
// contact form, contact detail and automations.
import { useEffect, useState } from "react";
import { Plus, PencilSimple as Pencil, Trash as Trash2 } from "@phosphor-icons/react/ssr";
import { api } from "@/lib/api";
import { Select } from "@/components/Select";
import { Tip } from "@/components/ui/tooltip";
import SidePanel from "@/components/SidePanel";
import type { CustomField, CustomFieldType } from "@/lib/types";
import { useToast, FieldLabel, INPUT_CLASS, PrimaryButton } from "../_shared";

const TYPE_LABEL: Record<string, string> = { text: "Text", number: "Number", date: "Date", select: "Dropdown" };

export default function CustomFieldsPage() {
  const { notify, ToastHost } = useToast();
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState<{ open: boolean; editing: CustomField | null }>({ open: false, editing: null });

  async function load() {
    setLoading(true);
    try { setFields(await api.listCustomFields()); }
    catch { /* auth handled in api */ }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function remove(f: CustomField) {
    if (!confirm(`Delete custom field "${f.label}"? Existing values are kept but no longer shown.`)) return;
    try { await api.deleteCustomField(f.id); notify("Custom field deleted"); load(); }
    catch (e) { notify(String(e), "error"); }
  }

  return (
    <div className="px-6 py-6 w-full h-full flex flex-col min-h-0">
      {ToastHost}
      <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 flex items-center justify-end gap-3 border-b border-border shrink-0">
          <PrimaryButton onClick={() => setDlg({ open: true, editing: null })}><Plus className="w-4 h-4" />Add field</PrimaryButton>
        </div>

        <div className="overflow-auto flex-1 min-h-0 p-4">
          {loading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-lg skeleton" />)}</div>
          ) : fields.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border rounded-lg">
              <p className="font-bold text-foreground mb-1">No custom fields yet</p>
              <p className="text-[13px] text-muted-foreground mb-4">Add typed fields (text, number, date, dropdown) to capture extra info on every contact.</p>
              <PrimaryButton onClick={() => setDlg({ open: true, editing: null })}><Plus className="w-4 h-4" />Add field</PrimaryButton>
            </div>
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {fields.map((f) => (
                <div key={f.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-bold text-foreground truncate">{f.label}</p>
                    <p className="text-[11.5px] text-muted-foreground truncate font-mono">{f.key}</p>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground">{TYPE_LABEL[f.type] || f.type}</span>
                  {f.type === "select" && <span className="shrink-0 text-[11.5px] text-muted-foreground">{f.options?.length ?? 0} option(s)</span>}
                  <Tip label="Edit"><button onClick={() => setDlg({ open: true, editing: f })} className="p-1.5 rounded-md hover:bg-muted outline-none shrink-0"><Pencil className="w-[18px] h-[18px] text-muted-foreground" /></button></Tip>
                  <Tip label="Delete"><button onClick={() => remove(f)} className="p-1.5 rounded-md hover:bg-muted outline-none shrink-0"><Trash2 className="w-[18px] h-[18px] text-destructive" /></button></Tip>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {dlg.open && <CustomFieldDialog editing={dlg.editing} count={fields.length}
        onClose={() => setDlg({ open: false, editing: null })}
        onSaved={(m) => { setDlg({ open: false, editing: null }); notify(m); load(); }}
        onError={(m) => notify(m, "error")} />}
    </div>
  );
}

function CustomFieldDialog({ editing, count, onClose, onSaved, onError }: {
  editing: CustomField | null; count: number;
  onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const isEdit = !!editing;
  const [label, setLabel] = useState(editing?.label ?? "");
  const [type, setType] = useState<CustomFieldType>((editing?.type as CustomFieldType) ?? "text");
  const [options, setOptions] = useState<string[]>(editing?.options ?? []);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!label.trim()) { onError("Label is required"); return; }
    setSaving(true);
    try {
      const opts = type === "select" ? options.map((o) => o.trim()).filter(Boolean) : [];
      if (isEdit) { await api.updateCustomField(editing!.id, { label: label.trim(), type, options: opts }); onSaved("Custom field updated"); }
      else { await api.createCustomField({ label: label.trim(), type, options: opts, sort_order: count }); onSaved("Custom field created"); }
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <SidePanel
      open
      onClose={onClose}
      title={isEdit ? "Edit custom field" : "New custom field"}
      description="Typed field stored on every contact."
      width="sm"
      busy={saving}
      onApply={save}
      applyLabel={isEdit ? "Save" : "Create"}
    >
      <div className="flex flex-col gap-4">
        <div><FieldLabel>Label</FieldLabel><input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus placeholder="e.g. Budget" className={INPUT_CLASS} /></div>
        <div><FieldLabel>Type</FieldLabel>
          <Select value={type} searchable={false} onChange={(v) => setType(v as CustomFieldType)}
            options={[{ value: "text", label: "Text" }, { value: "number", label: "Number" }, { value: "date", label: "Date" }, { value: "select", label: "Dropdown" }]} />
        </div>
        {type === "select" && (
          <div>
            <FieldLabel>Options</FieldLabel>
            <div className="space-y-1.5">
              {options.map((o, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <input value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} className={INPUT_CLASS} />
                  <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))} className="px-1.5 text-muted-foreground hover:text-destructive text-lg leading-none">×</button>
                </div>
              ))}
              <button type="button" onClick={() => setOptions([...options, ""])} className="text-[12.5px] font-semibold text-primary hover:underline">+ Add option</button>
            </div>
          </div>
        )}
        {isEdit && <p className="text-[11.5px] text-muted-foreground">The field key <span className="font-mono">{editing!.key}</span> can&apos;t change (keeps existing values linked).</p>}
      </div>
    </SidePanel>
  );
}
