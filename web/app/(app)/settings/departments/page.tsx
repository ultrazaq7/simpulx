"use client";
import { useEffect, useState, useRef } from "react";
import { Search, MoreHorizontal, Building2, Loader2, X, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { Department } from "@/lib/types";
import { useToast, PageBody, SettingsCard, FieldLabel, INPUT_CLASS, PrimaryButton, GhostButton } from "../_shared";

/* ── 3-dot menu with fixed positioning (avoids overflow clipping) ── */
function DeptRowMenu({ d, isOpen, onToggle, onClose, onEdit, onRemove }: {
  d: Department; isOpen: boolean; onToggle: () => void; onClose: () => void;
  onEdit: () => void; onRemove: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, flipUp: false });

  const handleToggle = () => {
    if (!isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipUp = spaceBelow < 120;
      setPos({
        top: flipUp ? rect.top - 4 : rect.bottom + 4,
        left: rect.right - 160, // w-40 = 10rem = 160px
        flipUp,
      });
    }
    onToggle();
  };

  return (
    <>
      <button ref={btnRef} onClick={handleToggle}
        className="p-1 border border-border rounded-md hover:bg-muted transition-colors outline-none">
        <MoreHorizontal className="w-[18px] h-[18px] text-muted-foreground" />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={onClose} />
          <div
            className="fixed z-[70] w-40 bg-card rounded-lg border border-border shadow-lg py-1 animate-scale-in"
            style={{
              top: pos.top,
              left: pos.left,
              transform: pos.flipUp ? "translateY(-100%)" : undefined,
            }}
          >
            <button onClick={onEdit} className="w-full px-3 py-2 text-left text-[13px] text-foreground hover:bg-muted outline-none transition-colors">Rename</button>
            <div className="border-t border-border my-0.5" />
            <button onClick={onRemove} className="w-full px-3 py-2 text-left text-[13px] text-destructive hover:bg-muted outline-none transition-colors">Delete</button>
          </div>
        </>
      )}
    </>
  );
}

export default function DepartmentsSettingsPage() {
  const { notify, ToastHost } = useToast();
  const [rows, setRows] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState<{ open: boolean; editing: Department | null }>({ open: false, editing: null });
  const [search, setSearch] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try { setRows(await api.listDepartments()); } catch { } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openDlg(d: Department | null) { setName(d?.name ?? ""); setDlg({ open: true, editing: d }); }
  async function save() {
    if (!name.trim()) { notify("Name is required", "error"); return; }
    setSaving(true);
    try {
      if (dlg.editing) { await api.updateDepartment(dlg.editing.id, name.trim()); notify("Department updated"); }
      else { await api.createDepartment(name.trim()); notify("Department created"); }
      setDlg({ open: false, editing: null }); load();
    } catch (e) { notify(String(e), "error"); }
    finally { setSaving(false); }
  }
  async function remove(d: Department) {
    if (!confirm(`Delete department "${d.name}"?`)) return;
    try { await api.deleteDepartment(d.id); notify("Department deleted", "info"); load(); }
    catch (e) { notify(String(e), "error"); }
  }

  const filtered = rows.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <PageBody fill>
      {ToastHost}
      <SettingsCard className="overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 flex items-center gap-4 border-b border-border shrink-0">
          <div className="relative w-[340px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search departments by name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-muted text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary"
            />
          </div>
          <div className="flex-1" />
          <PrimaryButton onClick={() => openDlg(null)}>
            <Plus className="w-4 h-4" />Add department
          </PrimaryButton>
        </div>

        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-right w-16"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={2} className="text-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={2} className="text-center py-16 text-muted-foreground">No departments found</td></tr>
              ) : filtered.map((d) => (
                <tr key={d.id} className="border-b border-border/60 hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-muted text-muted-foreground grid place-items-center shrink-0">
                        <Building2 className="w-[18px] h-[18px]" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{d.name}</p>
                        <p className="text-xs text-muted-foreground">{d.members} member{d.members === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DeptRowMenu
                      d={d}
                      isOpen={menuId === d.id}
                      onToggle={() => setMenuId(menuId === d.id ? null : d.id)}
                      onClose={() => setMenuId(null)}
                      onEdit={() => { openDlg(d); setMenuId(null); }}
                      onRemove={() => { remove(d); setMenuId(null); }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsCard>

      {/* Create/Edit Dialog */}
      {dlg.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={() => setDlg({ open: false, editing: null })} />
          <div className="relative bg-card rounded-lg border border-border shadow-2xl w-full max-w-sm animate-scale-in">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="text-[15px] font-bold text-foreground">{dlg.editing ? "Rename department" : "New department"}</h2>
              <button onClick={() => setDlg({ open: false, editing: null })} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors"><X className="w-[18px] h-[18px]" /></button>
            </div>
            <div className="px-5 py-5">
              <FieldLabel>Department name</FieldLabel>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sales"
                autoFocus
                className={INPUT_CLASS}
              />
            </div>
            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-border">
              <GhostButton onClick={() => setDlg({ open: false, editing: null })}>Cancel</GhostButton>
              <PrimaryButton onClick={save} disabled={saving}>
                {dlg.editing ? "Save" : "Create"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </PageBody>
  );
}
