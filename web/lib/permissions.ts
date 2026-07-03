// Shared permission logic for the role matrix. The effective permission for a
// role is the SAVED matrix value if present, else the built-in default.
// owner/admin are always full-access.
//
// IMPORTANT: defaultFor() MUST mirror services/gateway/permissions.go defaultPerm
// and the roles settings page, so the UI matches backend enforcement.
import { useEffect, useState } from "react";
import { api, getUser } from "@/lib/api";
import type { RolePermissions } from "@/lib/types";

export const LOCKED_ROLES = ["owner", "admin"];

const AGENT_PERMS = new Set([
  "menu_dashboard", "menu_chats", "menu_contacts", "menu_settings",
  "view_dashboard", "view_team_chats", "view_contacts", "create_contacts",
  "edit_contacts", "close_chats", "view_settings", "initiate_chats",
]);

export function defaultFor(role: string, key: string): boolean {
  if (LOCKED_ROLES.includes(role)) return true;
  if (role === "manager") return key !== "manage_roles" && key !== "manage_channels";
  if (role === "agent") return AGENT_PERMS.has(key);
  return false; // unknown custom role with no saved entry
}

export function canWith(doc: RolePermissions | null, role: string | undefined, key: string): boolean {
  if (!role) return false;
  if (LOCKED_ROLES.includes(role)) return true;
  const v = doc?.matrix?.[role]?.[key];
  return v === undefined ? defaultFor(role, key) : v;
}

// Module-level cache so the matrix is fetched once per session.
let _cache: Promise<RolePermissions> | null = null;
export function loadPermissions(force = false): Promise<RolePermissions> {
  if (force) _cache = null;
  if (!_cache) _cache = api.getRolePermissions().catch(() => ({ matrix: {}, custom_roles: {} } as RolePermissions));
  return _cache;
}

// usePermissions returns a `can(key)` checker. It resolves correctly from the
// built-in defaults immediately (no flicker) and refines once the saved matrix
// loads (for custom roles / overrides).
export function usePermissions() {
  const [doc, setDoc] = useState<RolePermissions | null>(null);
  useEffect(() => { loadPermissions().then(setDoc); }, []);
  const role = getUser()?.role;
  return { can: (key: string) => canWith(doc, role, key) };
}
