"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, Lock, X, Loader2 } from "lucide-react";
import { api, getUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast, PageBody, SettingsCard, FieldLabel, INPUT_CLASS, PrimaryButton, GhostButton } from "../_shared";

type Perm = { key: string; label: string };
const GROUPS: { group: string; perms: Perm[] }[] = [
  { group: "Sidebar Menu", perms: [
    { key: "menu_dashboard", label: "Dashboard" },
    { key: "menu_chats", label: "Inbox / Chats" },
    { key: "menu_contacts", label: "Contacts" },
    { key: "menu_broadcasts", label: "Broadcasts" },
    { key: "menu_automation", label: "Automation" },
    { key: "menu_drip_campaigns", label: "Follow-ups" },
    { key: "menu_analytics", label: "Analytics" },
    { key: "menu_audit_log", label: "Audit Log" },
    { key: "menu_settings", label: "Settings" },
  ] },
  { group: "Dashboard", perms: [
    { key: "view_dashboard", label: "View Dashboard" },
    { key: "view_analytics", label: "View Analytics" },
  ] },
  { group: "Chats", perms: [
    { key: "view_all_chats", label: "View All Conversations" },
    { key: "view_team_chats", label: "View Team Conversations" },
    { key: "assign_chats", label: "Assign Conversations" },
    { key: "close_chats", label: "Close Conversations" },
  ] },
  { group: "Contacts", perms: [
    { key: "view_contacts", label: "View Contacts" },
    { key: "create_contacts", label: "Create Contacts" },
    { key: "edit_contacts", label: "Edit Contacts" },
    { key: "delete_contacts", label: "Delete Contacts" },
    { key: "export_contacts", label: "Export Contacts" },
  ] },
  { group: "Broadcasts", perms: [
    { key: "view_broadcasts", label: "View Broadcasts" },
    { key: "send_broadcasts", label: "Send Broadcasts" },
  ] },
  { group: "Automation", perms: [
    { key: "view_automation", label: "View Automation Rules" },
    { key: "manage_automation", label: "Create / Edit Automation" },
  ] },
  { group: "Settings", perms: [
    { key: "view_settings", label: "View Settings" },
    { key: "manage_departments", label: "Manage Departments" },
    { key: "manage_channels", label: "Manage Channels" },
    { key: "manage_team", label: "Manage Team Members" },
    { key: "manage_roles", label: "Manage Roles & Permissions" },
    { key: "manage_campaigns", label: "Manage Campaigns" },
    { key: "manage_quick_replies", label: "Manage Quick Replies" },
  ] },
];

const BUILT_IN = ["owner", "admin", "manager", "agent"];
const LOCKED = ["owner", "admin"];
const ALL_PERM_KEYS = GROUPS.flatMap((g) => g.perms.map((p) => p.key));

function defaultFor(role: string, key: string): boolean {
  if (LOCKED.includes(role)) return true;
  if (role === "manager") return key !== "manage_roles" && key !== "manage_channels";
  if (role === "agent") {
    return ["menu_dashboard", "menu_chats", "menu_contacts", "menu_settings",
      "view_dashboard", "view_team_chats", "view_contacts", "create_contacts",
      "edit_contacts", "close_chats", "view_settings"].includes(key);
  }
  return false;
}

export default function RolesSettingsPage() {
  const { notify, ToastHost } = useToast();
  const me = getUser();
  const canEdit = me?.role === "admin" || me?.role === "owner";

  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [customRoles, setCustomRoles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newRole, setNewRole] = useState("");

  const roles = useMemo(() => [...BUILT_IN.filter((r) => r !== "owner" || true), ...Object.keys(customRoles)], [customRoles]);

  function seedRole(m: Record<string, Record<string, boolean>>, role: string) {
    m[role] = {};
    for (const k of ALL_PERM_KEYS) m[role][k] = defaultFor(role, k);
  }

  useEffect(() => {
    api.getRolePermissions().then((doc) => {
      const m: Record<string, Record<string, boolean>> = {};
      for (const r of BUILT_IN) seedRole(m, r);
      for (const r of Object.keys(doc.custom_roles || {})) seedRole(m, r);
      for (const [role, perms] of Object.entries(doc.matrix || {})) {
        if (!m[role]) seedRole(m, role);
        for (const [k, v] of Object.entries(perms)) m[role][k] = v;
      }
      setMatrix(m);
      setCustomRoles(doc.custom_roles || {});
    }).catch(() => {
      const m: Record<string, Record<string, boolean>> = {};
      for (const r of BUILT_IN) seedRole(m, r);
      setMatrix(m);
    }).finally(() => setLoading(false));
  }, []);

  function toggle(role: string, key: string) {
    if (LOCKED.includes(role) || !canEdit) return;
    setMatrix((m) => ({ ...m, [role]: { ...m[role], [key]: !m[role]?.[key] } }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const toSave: Record<string, Record<string, boolean>> = {};
      for (const role of Object.keys(matrix)) { if (LOCKED.includes(role)) continue; toSave[role] = matrix[role]; }
      await api.updateRolePermissions({ matrix: toSave, custom_roles: customRoles });
      setDirty(false);
      notify("Permissions saved");
    } catch (e) { notify(String(e), "error"); }
    finally { setSaving(false); }
  }

  function addRole() {
    const label = newRole.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!key || matrix[key]) { notify("Role already exists", "error"); return; }
    setMatrix((m) => { const next = { ...m }; seedRole(next, key); return next; });
    setCustomRoles((c) => ({ ...c, [key]: label }));
    setNewRole(""); setAddOpen(false); setDirty(true);
  }
  function deleteRole(key: string) {
    if (!confirm(`Delete custom role "${customRoles[key] || key}"?`)) return;
    setMatrix((m) => { const next = { ...m }; delete next[key]; return next; });
    setCustomRoles((c) => { const next = { ...c }; delete next[key]; return next; });
    setDirty(true);
  }

  const roleLabel = (r: string) => customRoles[r] || r.charAt(0).toUpperCase() + r.slice(1);

  if (loading) return <PageBody><div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></PageBody>;

  return (
    <PageBody maxWidth={1180}>
      {ToastHost}
      <div className="flex items-center gap-3 mb-4">
        <p className="text-[13px] text-muted-foreground">Control which menus and actions each role can access. Owner and Admin always have full access.</p>
        <div className="flex-1" />
        {canEdit && <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm font-semibold text-foreground hover:bg-muted outline-none transition-colors"><Plus className="w-4 h-4" />Create role</button>}
        {canEdit && (
          <PrimaryButton onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : dirty ? "Save changes" : "Saved"}
          </PrimaryButton>
        )}
      </div>

      <SettingsCard className="overflow-hidden">
        {/* Header row */}
        <div className="flex items-center px-4 py-3 bg-muted/40 border-b border-border sticky top-0 z-10">
          <div className="flex-1 min-w-[220px]"><p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Permission</p></div>
          {roles.map((r) => (
            <div key={r} className="w-[104px] shrink-0 flex items-center justify-center gap-1">
              <span className="text-[12.5px] font-bold capitalize text-foreground">{roleLabel(r)}</span>
              {LOCKED.includes(r) && <Lock className="w-3 h-3 text-muted-foreground" />}
              {customRoles[r] && canEdit && (
                <button onClick={() => deleteRole(r)} className="p-0.5 outline-none text-muted-foreground hover:text-destructive transition-colors"><X className="w-[13px] h-[13px]" /></button>
              )}
            </div>
          ))}
        </div>

        {GROUPS.map((g) => (
          <div key={g.group}>
            <div className="px-4 py-2 bg-muted/30 border-b border-border">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{g.group}</p>
            </div>
            {g.perms.map((p) => (
              <div key={p.key} className="flex items-center px-4 border-b border-border/60 hover:bg-muted/50 transition-colors">
                <div className="flex-1 min-w-[220px]"><span className="text-[13px] font-medium text-foreground">{p.label}</span></div>
                {roles.map((r) => {
                  const locked = LOCKED.includes(r) || !canEdit;
                  return (
                    <div key={r} className="w-[104px] shrink-0 flex justify-center py-1">
                      <input
                        type="checkbox"
                        checked={!!matrix[r]?.[p.key]}
                        disabled={locked}
                        onChange={() => toggle(r, p.key)}
                        className="w-4 h-4 rounded border-border text-primary accent-primary disabled:opacity-40 cursor-pointer disabled:cursor-default"
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </SettingsCard>

      {/* Add Role Dialog */}
      {addOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={() => setAddOpen(false)} />
          <div className="relative bg-card rounded-lg border border-border shadow-2xl w-full max-w-sm animate-scale-in">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="text-[15px] font-bold text-foreground">Create custom role</h2>
              <button onClick={() => setAddOpen(false)} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors"><X className="w-[18px] h-[18px]" /></button>
            </div>
            <div className="px-5 py-5">
              <FieldLabel>Role name</FieldLabel>
              <input type="text" value={newRole} onChange={(e) => setNewRole(e.target.value)} autoFocus placeholder="e.g. Team Lead"
                className={INPUT_CLASS} />
            </div>
            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-border">
              <GhostButton onClick={() => setAddOpen(false)}>Cancel</GhostButton>
              <PrimaryButton onClick={addRole}>Create</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </PageBody>
  );
}
