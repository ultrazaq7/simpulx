"use client";
// Quick Replies — saved /shortcut snippets agents insert in the composer. Managed
// here (list) and used from the inbox composer's quick-reply picker.
import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn, fmtDateTimeShort } from "@/lib/utils";
import { Select } from "@/components/Select";
import { Tip } from "@/components/ui/tooltip";
import SidePanel from "@/components/SidePanel";
import type { QuickReply } from "@/lib/types";
import { useToast, FieldLabel, INPUT_CLASS } from "../_shared";

export default function QuickRepliesPage() {
  const { notify, ToastHost } = useToast();
  const [items, setItems] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlgOpen, setDlgOpen] = useState(false);

  async function load() {
    setLoading(true);
    try { setItems(await api.listQuickReplies()); }
    catch { /* auth handled in api */ }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function remove(q: QuickReply) {
    if (!confirm(`Delete quick reply "/${q.shortcut}"?`)) return;
    try { await api.deleteQuickReply(q.id); notify("Quick reply deleted"); load(); }
    catch (e) { notify(String(e), "error"); }
  }

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const totalPages = Math.max(1, Math.ceil(items.length / rowsPerPage));
  const paged = items.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  useEffect(() => { if (page > totalPages - 1) setPage(0); }, [totalPages, page]);

  return (
    <div className="px-6 py-6 w-full h-full flex flex-col min-h-0">
      {ToastHost}
      <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 flex items-center justify-end gap-3 border-b border-border shrink-0">
          <button onClick={() => setDlgOpen(true)} className="inline-flex items-center gap-2 px-3.5 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm transition-all outline-none">
            <Plus className="w-4 h-4" />Add quick reply
          </button>
        </div>

        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-sm min-w-[720px] whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-muted/40 backdrop-blur">
                {["Shortcut", "Title", "Message", "Created", ""].map((h) => (
                  <th key={h} className={cn("px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground", h === "" ? "text-right w-20" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-16 text-[13px] text-muted-foreground">No quick replies yet</td></tr>
              ) : paged.map((q) => (
                <tr key={q.id} className="border-b border-border/60 hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2.5"><span className="inline-flex px-1.5 py-0.5 rounded text-[11.5px] font-bold bg-primary/10 text-primary">/{q.shortcut}</span></td>
                  <td className="px-4 py-2.5 text-[13px] font-medium text-foreground truncate max-w-[220px]">{q.title || "-"}</td>
                  <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground truncate max-w-[360px]">{q.body}</td>
                  <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground">{q.created_at ? fmtDateTimeShort(q.created_at) : "-"}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <Tip label="Delete"><button onClick={() => remove(q)} className="p-1.5 rounded-md hover:bg-red-50 outline-none transition-colors text-red-500"><Trash2 className="w-[17px] h-[17px]" /></button></Tip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-sm shrink-0">
          <span className="text-muted-foreground tabular-nums">{items.length} total</span>
          <div className="flex items-center gap-2">
            <Select value={String(rowsPerPage)} onChange={(v) => { setRowsPerPage(Number(v)); setPage(0); }} options={[10, 25, 50].map((n) => ({ value: String(n), label: String(n) }))} className="w-[72px]" align="right" />
            <span className="text-muted-foreground mx-2 tabular-nums">Page {page + 1} of {totalPages}</span>
            <button disabled={page <= 0} onClick={() => setPage(page - 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none">Prev</button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none">Next</button>
          </div>
        </div>
      </div>

      {dlgOpen && <QuickReplyDialog
        onClose={() => setDlgOpen(false)}
        onSaved={(m) => { setDlgOpen(false); notify(m); load(); }}
        onError={(m) => notify(m, "error")} />}
    </div>
  );
}

function QuickReplyDialog({ onClose, onSaved, onError }: {
  onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const [shortcut, setShortcut] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const sc = shortcut.trim().replace(/^\//, "");
    if (!sc) { onError("Shortcut is required"); return; }
    if (!body.trim()) { onError("Message is required"); return; }
    setSaving(true);
    try {
      await api.createQuickReply(sc, title.trim(), body.trim());
      onSaved("Quick reply created");
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <SidePanel open onClose={onClose} title="New quick reply" width="sm" busy={saving} onApply={save} applyLabel="Create">
      <div className="flex flex-col gap-4">
        <div><FieldLabel>Shortcut</FieldLabel><input value={shortcut} onChange={(e) => setShortcut(e.target.value)} autoFocus placeholder="e.g. greet" className={INPUT_CLASS} /></div>
        <div><FieldLabel>Title</FieldLabel><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Welcome greeting" className={INPUT_CLASS} /></div>
        <div><FieldLabel>Message</FieldLabel><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="The text inserted when the shortcut is used" className={cn(INPUT_CLASS, "h-auto py-2 resize-none")} /></div>
      </div>
    </SidePanel>
  );
}
