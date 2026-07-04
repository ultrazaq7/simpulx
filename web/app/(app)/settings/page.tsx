"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CircleNotch as Loader2 } from "@phosphor-icons/react/ssr";
import { getUser } from "@/lib/api";
import { loadPermissions, canWith } from "@/lib/permissions";

// /settings has no content of its own. Instead of a hardcoded jump to General
// (an ORG-level page a manager may not be allowed to open), redirect to the
// FIRST section the role actually has permission for. Order + perms mirror the
// sidebar in layout.tsx. We wait for the saved matrix so a role whose access was
// revoked in the roles editor is never dumped on a page it can't use.
const SECTIONS: { href: string; perm: string }[] = [
  { href: "/settings/general", perm: "view_settings" },
  { href: "/settings/people", perm: "manage_team" },
  { href: "/settings/roles", perm: "manage_roles" },
  { href: "/settings/campaigns", perm: "manage_campaigns" },
  { href: "/settings/templates", perm: "view_settings" },
  { href: "/settings/automation", perm: "view_automation" },
  { href: "/settings/wa-forms", perm: "view_automation" },
  { href: "/settings/channels", perm: "manage_channels" },
  { href: "/settings/audit", perm: "menu_audit_log" },
];

export default function SettingsIndexPage() {
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    loadPermissions().then((doc) => {
      if (!alive) return;
      const role = getUser()?.role;
      const first = SECTIONS.find((s) => canWith(doc, role, s.perm));
      // No settings section available => send them to their account page.
      router.replace(first ? first.href : "/account");
    });
    return () => { alive = false; };
  }, [router]);
  return (
    <div className="grid place-items-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}
