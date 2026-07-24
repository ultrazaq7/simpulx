"use client";
import { useI18n } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { Plus, Lock, Loader2, ChevronLeft, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { api, getUser } from "@/lib/api";
// Single source of truth for the built-in defaults. This page used to keep its
// OWN copy, which is precisely how the three definitions drifted apart.
import { defaultFor, loadPermissions } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import SidePanel from "@/components/SidePanel";
import { useToast, PageBody, SettingsCard, FieldLabel, INPUT_CLASS, PrimaryButton, GhostButton, ROLE_PERMS } from "../_shared";

type Perm = { key: string; label: string };
const GROUPS: { group: string; perms: Perm[] }[] = [
  { group: "Sidebar Menu", perms: [
    { key: "menu_dashboard", label: "Dashboard" },
    { key: "menu_chats", label: "Chat" },
    { key: "menu_contacts", label: "Contacts" },
    { key: "menu_broadcasts", label: "Broadcasts" },
    { key: "menu_automation", label: "Automation" },
    { key: "menu_analytics", label: "Analytics" },
    { key: "menu_audit_log", label: "Logs" },
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
    { key: "view_company_details", label: "View Company Details" },
    { key: "manage_channels", label: "Manage Channels" },
    { key: "manage_team", label: "Manage Team Members" },
    { key: "manage_roles", label: "Manage Roles & Permissions" },
    { key: "manage_campaigns", label: "Manage Campaigns" },
    { key: "manage_quick_replies", label: "Manage Quick Replies" },
    { key: "manage_templates", label: "Manage Message Templates" },
    { key: "manage_custom_fields", label: "Manage Custom Fields" },
    { key: "manage_pipeline_stages", label: "Manage Pipeline Stages" },
    { key: "manage_ai", label: "Manage AI & Knowledge Base" },
    { key: "manage_organization", label: "Manage Company Profile & Branding" },
  ] },
];

const BUILT_IN = ["owner", "admin", "manager", "agent"];
const LOCKED = ["owner", "admin"];
const ALL_PERM_KEYS = GROUPS.flatMap((g) => g.perms.map((p) => p.key));


export default function RolesSettingsPage() {
  const { t } = useI18n();
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
      // Drop the cached permission doc so nav/menus in this session reflect the
      // change without a hard reload. Other users pick it up on their next load.
      loadPermissions(true);
      setDirty(false);
      notify(t("settings.permissionsSaved"));
    } catch (e) { notify(String(e), "error"); }
    finally { setSaving(false); }
  }

  function addRole() {
    const label = newRole.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!key || matrix[key]) { notify(t("settings.roleAlreadyExists"), "error"); return; }
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

  // Qontak-style: a roles LIST, then an Edit view per role with a grouped
  // Feature | Permission checklist.
  const [editing, setEditing] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const permCount = (r: string) => ALL_PERM_KEYS.filter((k) => matrix[r]?.[k]).length;

  if (loading) return <PageBody><div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></PageBody>;

  return (
    <PageBody wide>
      {ToastHost}
      {editing ? (
        /* ── Edit role ── */
        <div>
          <button onClick={() => setEditing(null)} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground mb-3 outline-none">
            <ChevronLeft className="w-4 h-4" /> {t("settings.roles2")}
          </button>
          <div className="flex items-center gap-3 mb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold capitalize text-foreground">{roleLabel(editing)}</h2>
                {LOCKED.includes(editing) && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-[11px] font-semibold text-muted-foreground"><Lock className="w-3 h-3" />{t("settings.fullAccess")}</span>}
              </div>
              <p className="text-[12px] text-muted-foreground">{ROLE_PERMS[editing] || t("settings.customRole")}</p>
            </div>
            <div className="flex-1" />
            {canEdit && !LOCKED.includes(editing) && (
              <>
                <GhostButton onClick={() => setEditing(null)}>{t("common.cancel")}</GhostButton>
                <PrimaryButton onClick={save} disabled={saving || !dirty}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : dirty ? t("account.save") : t("automation.saved")}
                </PrimaryButton>
              </>
            )}
          </div>
          <SettingsCard className="overflow-hidden">
            <div className="flex items-center px-5 py-2.5 bg-muted/40 border-b border-border">
              <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("settings.feature")}</span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("settings.permission")}</span>
            </div>
            {GROUPS.map((g) => {
              const open = openGroups[g.group] ?? true;
              return (
                <div key={g.group} className="border-b border-border last:border-b-0">
                  <button onClick={() => setOpenGroups((o) => ({ ...o, [g.group]: !open }))}
                    className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/30 outline-none transition-colors">
                    <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
                    <span className="text-[13px] font-bold text-foreground">{t(g.group)}</span>
                  </button>
                  {open && g.perms.map((p) => {
                    const locked = LOCKED.includes(editing) || !canEdit;
                    return (
                      <label key={p.key} className={cn("flex items-center gap-3 pl-10 pr-5 py-2.5 border-t border-border/50 transition-colors", locked ? "cursor-default" : "cursor-pointer hover:bg-muted/30")}>
                        <span className="flex-1 text-[13px] text-foreground">{t(p.label)}</span>
                        <input type="checkbox" aria-label={`${t(p.label)} for ${roleLabel(editing)}`}
                          checked={!!matrix[editing]?.[p.key]} disabled={locked}
                          onChange={() => toggle(editing, p.key)}
                          className="w-4 h-4 rounded border-border text-primary accent-primary disabled:opacity-40 cursor-pointer disabled:cursor-default" />
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </SettingsCard>
        </div>
      ) : (
        /* ── Roles list ── */
        <>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1" />
            {canEdit && dirty && (
              <PrimaryButton onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("account.save")}</PrimaryButton>
            )}
            {canEdit && <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm font-semibold text-foreground hover:bg-muted outline-none transition-colors"><Plus className="w-4 h-4" />{t("settings.createRole")}</button>}
          </div>
          <SettingsCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("settings.roleName")}</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">{t("settings.type")}</th>
                    <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("settings.permissions")}</th>
                    <th className="px-4 py-3 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr key={r} className="border-b border-border/60 last:border-b-0 hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[13.5px] font-semibold capitalize text-foreground">{roleLabel(r)}</span>
                          {LOCKED.includes(r) && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                        </div>
                        <p className="text-[12px] text-muted-foreground truncate max-w-[380px]">{ROLE_PERMS[r] || t("settings.customRole")}</p>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold", customRoles[r] ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{customRoles[r] ? t("settings.custom") : t("settings.builtIn")}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[12.5px] text-muted-foreground whitespace-nowrap">{LOCKED.includes(r) ? t("settings.fullAccess") : `${permCount(r)} / ${ALL_PERM_KEYS.length}`}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setEditing(r)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium text-foreground hover:bg-muted outline-none transition-colors"><Pencil className="w-3.5 h-3.5 text-muted-foreground" />{LOCKED.includes(r) || !canEdit ? t("settings.view") : t("common.edit")}</button>
                          {customRoles[r] && canEdit && (
                            <button onClick={() => deleteRole(r)} aria-label={`Delete ${roleLabel(r)}`} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted outline-none transition-colors"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SettingsCard>
        </>
      )}

      {/* Add Role drawer */}
      <SidePanel
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t("settings.createCustomRole")}
        description={t("settings.addARoleThenTick")}
        width="sm"
        onApply={addRole}
        applyLabel="Create"
        applyDisabled={!newRole.trim()}
      >
        <FieldLabel>{t("settings.roleName")}</FieldLabel>
        <input
          type="text"
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newRole.trim()) addRole(); }}
          autoFocus
          placeholder={t("settings.eGTeamLead")}
          className={INPUT_CLASS}
        />
      </SidePanel>
    </PageBody>
  );
}
