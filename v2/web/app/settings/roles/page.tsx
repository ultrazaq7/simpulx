"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Box, Typography, Button, Checkbox, CircularProgress, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Divider,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import { api, getUser } from "@/lib/api";
import { useToast, PageBody } from "../_shared";

// Permission catalog (grouped) — ported from the v1 roles screen, including the
// "Sidebar Menu" group that controls which nav items each role sees.
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
const LOCKED = ["owner", "admin"]; // always full access, not editable
const ALL_PERM_KEYS = GROUPS.flatMap((g) => g.perms.map((p) => p.key));

function defaultFor(role: string, key: string): boolean {
  if (LOCKED.includes(role)) return true;
  if (role === "manager") return key !== "manage_roles" && key !== "manage_channels";
  if (role === "agent") {
    return ["menu_dashboard", "menu_chats", "menu_contacts", "menu_settings",
      "view_dashboard", "view_team_chats", "view_contacts", "create_contacts",
      "edit_contacts", "close_chats", "view_settings"].includes(key);
  }
  return false; // custom roles start empty
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
      // Overlay saved values.
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
      for (const role of Object.keys(matrix)) {
        if (LOCKED.includes(role)) continue;
        toSave[role] = matrix[role];
      }
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

  if (loading) return <PageBody><Box sx={{ display: "flex", justifyContent: "center", py: 10 }}><CircularProgress /></Box></PageBody>;

  return (
    <PageBody maxWidth={1180}>
      {ToastHost}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          Control which menus and actions each role can access. Owner and Admin always have full access.
        </Typography>
        <Box sx={{ flex: 1 }} />
        {canEdit && <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => setAddOpen(true)} sx={{ textTransform: "none", borderRadius: "8px", fontWeight: 600 }}>Create role</Button>}
        {canEdit && <Button variant="contained" onClick={save} disabled={saving || !dirty} sx={{ textTransform: "none", borderRadius: "8px", fontWeight: 600, px: 3 }}>{saving ? <CircularProgress size={16} color="inherit" /> : dirty ? "Save changes" : "Saved"}</Button>}
      </Box>

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px", bgcolor: "background.paper", overflow: "hidden" }}>
        {/* Header row: role columns */}
        <Box sx={{ display: "flex", alignItems: "center", px: 2, py: 1.5, bgcolor: "#FAFBFC", borderBottom: "1px solid", borderColor: "divider", position: "sticky", top: 0, zIndex: 1 }}>
          <Box sx={{ flex: 1, minWidth: 220 }}><Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em" }}>Permission</Typography></Box>
          {roles.map((r) => (
            <Box key={r} sx={{ width: 104, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 0.25 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, textTransform: "capitalize" }}>{roleLabel(r)}</Typography>
              {LOCKED.includes(r) && <LockRoundedIcon sx={{ fontSize: 12, color: "text.disabled" }} />}
              {customRoles[r] && canEdit && (
                <Tooltip title="Delete role"><IconButton size="small" onClick={() => deleteRole(r)} sx={{ p: 0.25 }}><CloseRoundedIcon sx={{ fontSize: 13, color: "text.disabled" }} /></IconButton></Tooltip>
              )}
            </Box>
          ))}
        </Box>

        {GROUPS.map((g) => (
          <Box key={g.group}>
            <Box sx={{ px: 2, py: 1, bgcolor: "rgba(0,0,0,0.015)", borderBottom: "1px solid", borderColor: "divider" }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.06em" }}>{g.group}</Typography>
            </Box>
            {g.perms.map((p) => (
              <Box key={p.key} sx={{ display: "flex", alignItems: "center", px: 2, borderBottom: "1px solid", borderColor: "rgba(0,0,0,0.04)", "&:hover": { bgcolor: "#FAFBFC" } }}>
                <Box sx={{ flex: 1, minWidth: 220 }}><Typography sx={{ fontSize: 13, fontWeight: 500 }}>{p.label}</Typography></Box>
                {roles.map((r) => {
                  const locked = LOCKED.includes(r) || !canEdit;
                  return (
                    <Box key={r} sx={{ width: 104, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                      <Checkbox size="small" checked={!!matrix[r]?.[p.key]} disabled={locked} onChange={() => toggle(r, p.key)} sx={{ color: "rgba(0,0,0,0.2)" }} />
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        ))}
      </Box>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Create custom role</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <TextField label="Role name" size="small" fullWidth value={newRole} onChange={(e) => setNewRole(e.target.value)} autoFocus placeholder="e.g. Team Lead" />
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2.5 }}>
          <Button onClick={() => setAddOpen(false)} color="inherit">Cancel</Button>
          <Button variant="contained" onClick={addRole}>Create</Button>
        </DialogActions>
      </Dialog>
    </PageBody>
  );
}
