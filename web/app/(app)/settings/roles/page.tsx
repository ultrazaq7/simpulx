"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, Lock, X, Loader2 } from "lucide-react";
import { api, getUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import SidePanel from "@/components/SidePanel";
import { useToast, PageBody, SettingsCard, FieldLabel, INPUT_CLASS, PrimaryButton } from "../_shared";

type Perm = { key: string; label: string };
const GROUPS: { group: string; perms: Perm[] }[] = [
  { group: "Sidebar Menu", perms: [
    { key: "menu_dashboard", label: "Dashboard" },
    { key: "menu_chats", label: "Inbox / Chats" },
    { key: "menu_contacts", label: "Contacts" },
    { key: "menu_broadcasts", label: "Broadcasts" },
    { key: "menu_automation", label: "Automation" },
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
    { key: "initiate_chats", label: "Send Template / Initiate Chat" },
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
    // Mirrors web/lib/permissions.ts AGENT_PERMS and services/gateway/permissions.go.
    return ["menu_dashboard", "menu_chats", "menu_contacts", "menu_settings",
      "view_dashboard", "view_team_chats", "view_contacts", "create_contacts",
      "edit_contacts", "close_chats", "view_settings", "initiate_chats"].includes(key);
  }
  return false;
}

export default function RolesSettingsPage() {
  const { notify, confirm, ToastHost } = useToast();
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
  async function deleteRole(key: string) {
    if (!(await confirm({ title: "Delete role?", message: `Delete custom role "${customRoles[key] || key}"?`, danger: true, confirmLabel: "Delete" }))) return;
    setMatrix((m) => { const next = { ...m }; delete next[key]; return next; });
    setCustomRoles((c) => { const next = { ...c }; delete next[key]; return next; });
    setDirty(true);
  }

  const roleLabel = (r: string) => customRoles[r] || r.charAt(0).toUpperCase() + r.slice(1);

  // One role at a time: pick a role from the list, tick its permission checklist.
  const [selectedRole, setSelectedRole] = useState("agent");
  const activeRole = roles.includes(selectedRole) ? selectedRole : roles[0];

  if (loading) return <PageBody><div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></PageBody>;

  return (
    <PageBody wide>
      {ToastHost}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1" />
        {canEdit && <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm font-semibold text-foreground hover:bg-muted outline-none transition-colors"><Plus className="w-4 h-4" />Create role</button>}
        {canEdit && (
          <PrimaryButton onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : dirty ? "Save changes" : "Saved"}
          </PrimaryButton>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start">
        {/* Role list — pick one to edit its checklist */}
        <div className="w-full md:w-56 shrink-0">
          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {roles.map((r) => (
              <div key={r} onClick={() => setSelectedRole(r)}
                className={cn("flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors shrink-0",
                  activeRole === r ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted")}>
                <span className="text-[13px] font-semibold capitalize flex-1 truncate">{roleLabel(r)}</span>
                {LOCKED.includes(r) && <Lock className="w-3.5 h-3.5 opacity-60" />}
                {customRoles[r] && canEdit && (
                  <button onClick={(e) => { e.stopPropagation(); deleteRole(r); }} aria-label={`Delete ${roleLabel(r)}`}
                    className="p-0.5 rounded text-muted-foreground hover:text-destructive outline-none transition-colors"><X className="w-3.5 h-3.5" /></button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Selected role's permission checklist */}
        <SettingsCard className="flex-1 min-w-0 w-full">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
            <span className="text-[14px] font-bold capitalize text-foreground">{roleLabel(activeRole)}</span>
            {LOCKED.includes(activeRole) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-[11px] font-semibold text-muted-foreground"><Lock className="w-3 h-3" />Full access</span>
            )}
            <div className="flex-1" />
            <span className="text-[12px] text-muted-foreground tabular-nums">{ALL_PERM_KEYS.filter((k) => matrix[activeRole]?.[k]).length}/{ALL_PERM_KEYS.length}</span>
          </div>
          <div className="p-5 space-y-5">
            {GROUPS.map((g) => (
              <div key={g.group}>
                <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase mb-2">{g.group}</p>
                <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                  {g.perms.map((p) => {
                    const locked = LOCKED.includes(activeRole) || !canEdit;
                    return (
                      <label key={p.key} className={cn("flex items-center gap-3 px-4 py-2.5 transition-colors", locked ? "cursor-default" : "cursor-pointer hover:bg-muted/40")}>
                        <span className="flex-1 text-[13px] text-foreground">{p.label}</span>
                        <input type="checkbox" aria-label={`${p.label} for ${roleLabel(activeRole)}`}
                          checked={!!matrix[activeRole]?.[p.key]} disabled={locked}
                          onChange={() => toggle(activeRole, p.key)}
                          className="w-4 h-4 rounded border-border text-primary accent-primary disabled:opacity-40 cursor-pointer disabled:cursor-default" />
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </SettingsCard>
      </div>

      {/* Add Role drawer */}
      <SidePanel
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Create custom role"
        description="Add a role, then tick its permissions in the checklist."
        width="sm"
        onApply={addRole}
        applyLabel="Create"
        applyDisabled={!newRole.trim()}
      >
        <FieldLabel>Role name</FieldLabel>
        <input
          type="text"
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newRole.trim()) addRole(); }}
          autoFocus
          placeholder="e.g. Team Lead"
          className={INPUT_CLASS}
        />
      </SidePanel>
    </PageBody>
  );
}
