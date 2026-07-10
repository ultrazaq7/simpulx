"use client";
// Custom Fields — org-defined typed contact fields (text / number / date /
// dropdown). Values attach to each contact (contact.attributes) and power the
// contact form, contact detail and automations.
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn, fmtDateTimeShort } from "@/lib/utils";
import { Select } from "@/components/Select";
import { Tip } from "@/components/ui/tooltip";
import SidePanel from "@/components/SidePanel";
import type { CustomField, CustomFieldType } from "@/lib/types";
import { useToast, FieldLabel, INPUT_CLASS, PrimaryButton } from "../_shared";

const TYPE_LABEL: Record<string, string> = { text: "Text", number: "Number", date: "Date", select: "Dropdown" };

export default function CustomFieldsPage() {
  const { notify, confirm, ToastHost } = useToast();
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
    if (!(await confirm({ title: "Delete custom field?", message: `Delete "${f.label}"? Existing values are kept but no longer shown.`, danger: true, confirmLabel: "Delete" }))) return;
    try { await api.deleteCustomField(f.id); notify("Custom field deleted"); load(); }
    catch (e) { notify(String(e), "error"); }
  }

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const totalPages = Math.max(1, Math.ceil(fields.length / rowsPerPage));
  const paged = fields.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  useEffect(() => { if (page > totalPages - 1) setPage(0); }, [totalPages, page]);

  return (
    <div className="px-6 py-6 w-full h-full flex flex-col min-h-0">
      {ToastHost}
      <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 flex items-center justify-end gap-3 border-b border-border shrink-0">
          <PrimaryButton onClick={() => setDlg({ open: true, editing: null })}><Plus className="w-4 h-4" />Add field</PrimaryButton>
        </div>

        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-sm min-w-[720px] whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-muted/40 backdrop-blur">
                {["Field", "Type", "Options", "Created", "Updated", ""].map((h) => (
                  <th key={h} className={cn("px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground", h === "Options" ? "text-right" : h === "" ? "text-right w-20" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /></td></tr>
              ) : fields.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-16 text-[13px] text-muted-foreground">No custom fields yet</td></tr>
              ) : paged.map((f) => (
                <tr key={f.id} className="border-b border-border/60 hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2.5">
                    <p className="text-[13px] font-semibold text-foreground truncate">{f.label}</p>
                    <p className="text-[11.5px] text-muted-foreground truncate">{f.key}</p>
                  </td>
                  <td className="px-4 py-2.5"><span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted text-foreground">{TYPE_LABEL[f.type] || f.type}</span></td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[12.5px] text-muted-foreground">{f.type === "select" ? (f.options?.length ?? 0) : "-"}</td>
                  <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground">{f.created_at ? fmtDateTimeShort(f.created_at) : "-"}</td>
                  <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground">{f.updated_at ? fmtDateTimeShort(f.updated_at) : "-"}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <Tip label="Edit"><button onClick={() => setDlg({ open: true, editing: f })} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors text-muted-foreground hover:text-foreground"><Pencil className="w-[17px] h-[17px]" /></button></Tip>
                    <Tip label="Delete"><button onClick={() => remove(f)} className="p-1.5 rounded-md hover:bg-red-50 outline-none transition-colors text-red-500"><Trash2 className="w-[17px] h-[17px]" /></button></Tip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-sm shrink-0">
          <span className="text-muted-foreground tabular-nums">{fields.length} total</span>
          <div className="flex items-center gap-2">
            <Select value={String(rowsPerPage)} onChange={(v) => { setRowsPerPage(Number(v)); setPage(0); }} options={[10, 25, 50].map((n) => ({ value: String(n), label: String(n) }))} className="w-[72px]" align="right" />
            <span className="text-muted-foreground mx-2 tabular-nums">Page {page + 1} of {totalPages}</span>
            <button disabled={page <= 0} onClick={() => setPage(page - 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none">Prev</button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none">Next</button>
          </div>
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
        {isEdit && <p className="text-[11.5px] text-muted-foreground">The field key <span className="">{editing!.key}</span> can&apos;t change (keeps existing values linked).</p>}
      </div>
    </SidePanel>
  );
}
