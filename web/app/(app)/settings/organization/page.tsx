"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Pencil, Building2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn, fmtDateTimeShort } from "@/lib/utils";
import type { OrgRow } from "@/lib/types";
import { Select } from "@/components/Select";
import SidePanel from "@/components/SidePanel";
import { useToast, FieldLabel, INPUT_CLASS, initials } from "../_shared";
import { useConfirm } from "@/components/ConfirmDialog";

const PACKAGES = ["starter", "growth", "scale", "enterprise"];
const STATUSES = ["active", "trial", "expired"];

// Platform super-admin console: every organization with its full column set,
// plus create-org and per-org credit-pool controls. Access is gated server-side
// (email, not a role); a non-super-admin who reaches this URL just sees an error.
export default function PlatformPage() {
  const router = useRouter();
  const { notify, ToastHost } = useToast();
  const [rows, setRows] = useState<OrgRow[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [panel, setPanel] = useState<{ mode: "create" | "edit"; org?: OrgRow } | null>(null);

  function load() {
    api.listOrgs().then(setRows).catch(() => { setDenied(true); setRows([]); });
  }
  useEffect(() => {
    // Bounce non-super-admins before they see the table shell.
    api.platformAccess().then((r) => { if (!r.super_admin) router.replace("/settings"); else load(); }).catch(() => router.replace("/settings"));
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const all = rows ?? [];
  const totalPages = Math.max(1, Math.ceil(all.length / rowsPerPage));
  const paged = all.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  useEffect(() => { if (page > totalPages - 1) setPage(0); }, [totalPages, page]);

  return (
    <>
      {ToastHost}
      <div className="px-6 pt-6 pb-6 max-w-[1180px] mx-auto w-full h-full flex flex-col min-h-0">
        <div className="bg-card rounded-lg border border-border shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col">
          <div className="p-3 flex items-center justify-end border-b border-border shrink-0">
            <button onClick={() => setPanel({ mode: "create" })}
              className="inline-flex items-center gap-2 px-3.5 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm transition-all outline-none">
              <Plus className="w-4 h-4" />New organization
            </button>
          </div>
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm min-w-[920px] whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-muted/40 backdrop-blur">
                  {["Organization", "Package", "Status", "Users", "Campaigns", "Simpuler credits (mo)", "Created", ""].map((h) => (
                    <th key={h} className={cn("px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground",
                      ["Users", "Campaigns", "Simpuler credits (mo)"].includes(h) ? "text-right" : h === "" ? "text-right w-16" : "text-left")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows === null ? (
                  <tr><td colSpan={8} className="text-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /></td></tr>
                ) : denied ? (
                  <tr><td colSpan={8} className="text-center py-16 text-[13px] text-muted-foreground">You do not have platform access.</td></tr>
                ) : all.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-16">
                    <div className="w-12 h-12 rounded-xl bg-muted grid place-items-center mx-auto mb-3"><Building2 className="w-6 h-6 text-muted-foreground/50" /></div>
                    <p className="font-semibold text-foreground mb-0.5">No organizations yet</p>
                    <p className="text-[13px] text-muted-foreground">Create the first organization to get started.</p>
                  </td></tr>
                ) : paged.map((o) => {
                  const pool = o.quotas?.simpuler_credits ?? 0;
                  const near = pool > 0 && o.credits_used_month / pool >= 0.85;
                  return (
                    <tr key={o.id} className="border-b border-border/60 hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary-text grid place-items-center text-[11px] font-bold shrink-0">{initials(o.name)}</div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-foreground truncate">{o.name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{o.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5"><span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted text-foreground capitalize">{o.package_name}</span></td>
                      <td className="px-4 py-2.5">
                        <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold capitalize",
                          o.status === "active" ? "bg-success/10 text-success" : o.status === "trial" ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground")}>{o.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[13px] text-foreground">{o.users_active}<span className="text-muted-foreground"> / {o.quotas?.users ?? 0}</span></td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[13px] text-foreground">{o.campaigns}</td>
                      <td className={cn("px-4 py-2.5 text-right tabular-nums text-[13px] font-semibold", near ? "text-amber-600" : "text-foreground")}>{o.credits_used_month}<span className="text-muted-foreground font-normal"> / {pool}</span></td>
                      <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground">{fmtDateTimeShort(o.created_at)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => setPanel({ mode: "edit", org: o })} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors text-muted-foreground hover:text-foreground"><Pencil className="w-[17px] h-[17px]" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-sm shrink-0">
            <span className="text-muted-foreground tabular-nums">{all.length} total</span>
            <div className="flex items-center gap-2">
              <Select value={String(rowsPerPage)} onChange={(v) => { setRowsPerPage(Number(v)); setPage(0); }}
                options={[10, 25, 50].map((n) => ({ value: String(n), label: String(n) }))} className="w-[72px]" align="right" />
              <span className="text-muted-foreground mx-2 tabular-nums">Page {page + 1} of {totalPages}</span>
              <button disabled={page <= 0} onClick={() => setPage(page - 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none">Prev</button>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none">Next</button>
            </div>
          </div>
        </div>
      </div>

      {panel && (
        <OrgPanel mode={panel.mode} org={panel.org}
          onClose={() => setPanel(null)}
          onDone={(msg) => { setPanel(null); notify(msg); load(); }}
          onError={(msg) => notify(msg, "error")} />
      )}
    </>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div><FieldLabel>{label}</FieldLabel><input type="number" min={0} value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS} /></div>;
}

function OrgPanel({ mode, org, onClose, onDone, onError }: {
  mode: "create" | "edit"; org?: OrgRow;
  onClose: () => void; onDone: (msg: string) => void; onError: (msg: string) => void;
}) {
  const isEdit = mode === "edit";
  const { confirm, ConfirmHost } = useConfirm();
  const [name, setName] = useState(org?.name ?? "");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [pkg, setPkg] = useState(org?.package_name ?? "starter");
  const [status, setStatus] = useState(org?.status ?? "active");
  const [users, setUsers] = useState(String(org?.quotas?.users ?? 10));
  const [credits, setCredits] = useState(String(org?.quotas?.simpuler_credits ?? 1000));
  const [fields, setFields] = useState(String(org?.quotas?.custom_fields ?? 20));
  const [busy, setBusy] = useState(false);

  const canSubmit = name.trim() !== "" && (isEdit || (ownerEmail.includes("@") && ownerPassword.length >= 8));

  async function submit() {
    setBusy(true);
    try {
      const quotas = { users: Number(users) || 0, simpuler_credits: Number(credits) || 0, custom_fields: Number(fields) || 0 };
      if (isEdit && org) {
        await api.updateOrg(org.id, { name: name.trim(), package_name: pkg, status, quotas });
        onDone("Organization updated");
      } else {
        await api.createOrg({ name: name.trim(), owner_name: ownerName.trim(), owner_email: ownerEmail.trim(), owner_password: ownerPassword, package_name: pkg, users: quotas.users, simpuler_credits: quotas.simpuler_credits, custom_fields: quotas.custom_fields });
        onDone("Organization created");
      }
    } catch (e) { onError(String(e)); } finally { setBusy(false); }
  }

  return (
    <SidePanel open onClose={onClose} width="md" busy={busy}
      title={isEdit ? (org?.name || "Edit organization") : "New organization"}
      onApply={submit} applyLabel={isEdit ? "Save" : "Create"} applyDisabled={!canSubmit}>
      <div className="space-y-4">
        <div><FieldLabel>Company name</FieldLabel><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Motors" className={INPUT_CLASS} /></div>

        {!isEdit && (
          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">Owner account</p>
            <div><FieldLabel>Owner name</FieldLabel><input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Full name" className={INPUT_CLASS} /></div>
            <div><FieldLabel>Owner email</FieldLabel><input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="owner@company.com" className={INPUT_CLASS} /></div>
            <div><FieldLabel>Temporary password</FieldLabel><input type="text" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} placeholder="At least 8 characters" className={INPUT_CLASS} /><p className="text-[11px] text-muted-foreground mt-1">Share this with the owner; they can change it after signing in.</p></div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div><FieldLabel>Package</FieldLabel><Select value={pkg} onChange={setPkg} searchable={false} options={PACKAGES.map((p) => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) }))} /></div>
          {isEdit && <div><FieldLabel>Status</FieldLabel><Select value={status} onChange={setStatus} searchable={false} options={STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))} /></div>}
        </div>

        <div className="rounded-lg border border-border p-3 space-y-3">
          <p className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">Quotas / credit pool</p>
          <div className="grid grid-cols-3 gap-3">
            <NumField label="Simpuler credits" value={credits} onChange={setCredits} />
            <NumField label="Team members" value={users} onChange={setUsers} />
            <NumField label="Custom fields" value={fields} onChange={setFields} />
          </div>
          <p className="text-[11px] text-muted-foreground">Simpuler credits are the org-wide monthly AI-reply pool. Each campaign draws from it via its Credits &amp; Usage allocation.</p>
        </div>

        {isEdit && org && (
          <div className="pt-3 border-t border-border">
            <button type="button" disabled={busy}
              onClick={async () => {
                if (!(await confirm({ title: "Delete organization?", message: `Delete "${org.name}"? This permanently removes the organization and all its users, campaigns and data.`, danger: true, confirmLabel: "Delete" }))) return;
                setBusy(true);
                try { await api.deleteOrg(org.id); onDone("Organization deleted"); }
                catch (e) { onError(String(e)); } finally { setBusy(false); }
              }}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-red-600 hover:text-red-700 outline-none disabled:opacity-50">
              <Trash2 className="w-4 h-4" />Delete organization
            </button>
          </div>
        )}
      </div>
      {ConfirmHost}
    </SidePanel>
  );
}
