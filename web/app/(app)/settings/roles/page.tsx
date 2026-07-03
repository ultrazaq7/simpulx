"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Lock, X, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
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

  // Horizontal slide for the role columns (modern arrow nav, no visible scrollbar).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };
  const slide = (dir: number) => scrollRef.current?.scrollBy({ left: dir * 216, behavior: "smooth" });
  useEffect(() => {
    updateArrows();
    const onResize = () => updateArrows();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [roles.length, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <PageBody><div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div></PageBody>;

  return (
    <PageBody wide>
      {ToastHost}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1" />
        {(canLeft || canRight) && (
          <div className="flex items-center gap-1 mr-1">
            <button onClick={() => slide(-1)} disabled={!canLeft} aria-label="Scroll roles left"
              className="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-default outline-none transition-colors"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => slide(1)} disabled={!canRight} aria-label="Scroll roles right"
              className="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-default outline-none transition-colors"><ChevronRight className="w-4 h-4" /></button>
          </div>
        )}
        {canEdit && <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm font-semibold text-foreground hover:bg-muted outline-none transition-colors"><Plus className="w-4 h-4" />Create role</button>}
        {canEdit && (
          <PrimaryButton onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : dirty ? "Save changes" : "Saved"}
          </PrimaryButton>
        )}
      </div>

      <SettingsCard className="overflow-hidden">
        <div ref={scrollRef} onScroll={updateArrows} className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="min-w-full">
            {/* Header row */}
            <div className="flex min-w-full bg-muted border-b border-border">
              <div className="w-[240px] shrink-0 sticky left-0 z-10 bg-muted px-4 py-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Permission</p>
              </div>
              {roles.map((r) => (
                <div key={r} className="flex-1 min-w-[104px] flex items-center justify-center gap-1 py-3">
                  <span className="text-[12.5px] font-semibold capitalize text-foreground">{roleLabel(r)}</span>
                  {LOCKED.includes(r) && <Lock className="w-3 h-3 text-muted-foreground" />}
                  {customRoles[r] && canEdit && (
                    <button onClick={() => deleteRole(r)} className="p-0.5 outline-none text-muted-foreground hover:text-destructive transition-colors"><X className="w-[13px] h-[13px]" /></button>
                  )}
                </div>
              ))}
            </div>

            {GROUPS.map((g) => (
              <div key={g.group}>
                <div className="flex">
                  <div className="w-[240px] shrink-0 sticky left-0 z-10 bg-card px-4 pt-4 pb-1.5">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{g.group}</p>
                  </div>
                  <div className="flex-1" />
                </div>
                {g.perms.map((p) => (
                  <div key={p.key} className="flex min-w-full border-b border-border/50">
                    <div className="w-[240px] shrink-0 sticky left-0 z-10 bg-card px-4 py-2.5">
                      <span className="text-[13px] text-foreground">{p.label}</span>
                    </div>
                    {roles.map((r) => {
                      const locked = LOCKED.includes(r) || !canEdit;
                      return (
                        <div key={r} className="flex-1 min-w-[104px] flex justify-center py-2.5">
                          <input
                            type="checkbox"
                            aria-label={`${p.label} for ${r}`}
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
          </div>
        </div>
      </SettingsCard>

      {/* Add Role drawer */}
      <SidePanel
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Create custom role"
        description="Add a role, then set its permissions in the matrix."
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
