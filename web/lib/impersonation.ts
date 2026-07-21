// Superadmin "view as" session handling.
//
// Impersonation swaps the stored token for a short-lived, read-only one issued
// for another organisation. The PREVIOUS session is stashed so leaving restores
// it exactly, rather than forcing a re-login — losing your own session because
// you glanced at a customer's inbox would make the feature unusable in practice.
//
// Everything here is client-side convenience. The real guarantees are in the
// token: it expires on its own, and the gateway refuses every mutating request
// while it is in use, so a stale tab cannot write no matter what the UI thinks.
import { getToken, getUser, getRefreshToken, setSession, clearSession } from "@/lib/api";
import type { User } from "@/lib/types";

const KEY = "simpulx_impersonation";

export type ImpersonationState = {
  orgId: string;
  orgName: string;
  viewingAs: string;
  expiresAt: number; // epoch ms
  prevToken: string;
  prevUser: User;
  prevRefresh: string | null;
};

export function getImpersonation(): ImpersonationState | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const st = JSON.parse(raw) as ImpersonationState;
    // A token past its expiry is worthless, and leaving the banner up would
    // suggest a session that no longer exists.
    if (Date.now() >= st.expiresAt) {
      stopImpersonation();
      return null;
    }
    return st;
  } catch {
    return null;
  }
}

export function isImpersonating(): boolean {
  return getImpersonation() !== null;
}

// startImpersonation stashes the current session, then installs the borrowed one.
export function startImpersonation(args: {
  token: string;
  expiresIn: number;
  org: { id: string; name: string };
  viewingAs: { id: string; name: string; role: string };
}) {
  const prevToken = getToken();
  const prevUser = getUser();
  if (!prevToken || !prevUser) return;

  const state: ImpersonationState = {
    orgId: args.org.id,
    orgName: args.org.name,
    viewingAs: args.viewingAs.name,
    expiresAt: Date.now() + args.expiresIn * 1000,
    prevToken,
    prevUser,
    prevRefresh: getRefreshToken(),
  };
  localStorage.setItem(KEY, JSON.stringify(state));

  // No refresh token for the borrowed session: it must die on its own schedule.
  setSession(args.token, {
    ...prevUser,
    id: args.viewingAs.id,
    org_id: args.org.id,
    role: args.viewingAs.role,
    name: args.viewingAs.name,
  } as User);
}

// stopImpersonation restores the superadmin's own session.
export function stopImpersonation() {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem(KEY);
  localStorage.removeItem(KEY);
  if (!raw) return;
  try {
    const st = JSON.parse(raw) as ImpersonationState;
    setSession(st.prevToken, st.prevUser, st.prevRefresh ?? undefined);
  } catch {
    // Nothing usable to restore: a clean logout beats a half-restored session
    // that silently keeps acting as the tenant.
    clearSession();
  }
}
