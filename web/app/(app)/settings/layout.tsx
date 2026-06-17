"use client";
// Persistent settings layout: renders Shell + the settings sidebar ONCE. Next.js
// keeps a layout mounted across child route navigations, so the sidebar (and its
// scroll position) never remounts — fixing the scroll-jump that the old per-page
// SettingsLayout had. Active section is derived from the pathname, so the URL is
// always the source of truth (no more ?section= facade).
import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Settings, Type, Bell, Users, Building2, ShieldCheck,
  Store, FileText, GitBranch, Radio, Plug, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";

// perm = permission key gating this section. Items without a dedicated perm in
// the matrix fall back to "view_settings" (anyone who can open Settings).
type NavItem = { key: string; labelKey: string; icon: any; href: string; perm: string };

const GROUPS: { titleKey: string; items: NavItem[] }[] = [
  {
    titleKey: "settings.general",
    items: [
      { key: "general", labelKey: "settings.general", icon: Settings, href: "/settings/general", perm: "view_settings" },
    ],
  },
  {
    titleKey: "settings.team",
    items: [
      { key: "people", labelKey: "settings.team", icon: Users, href: "/settings/people", perm: "manage_team" },
      { key: "roles", labelKey: "settings.roles", icon: ShieldCheck, href: "/settings/roles", perm: "manage_roles" },
      { key: "departments", labelKey: "settings.departments", icon: Building2, href: "/settings/departments", perm: "manage_departments" },
    ],
  },
  {
    titleKey: "settings.channels",
    items: [
      { key: "campaigns", labelKey: "settings.channels", icon: Store, href: "/settings/campaigns", perm: "manage_campaigns" },
      { key: "templates", labelKey: "settings.templates", icon: FileText, href: "/settings/templates", perm: "view_settings" },
      { key: "automation", labelKey: "settings.automations", icon: GitBranch, href: "/settings/automation", perm: "view_automation" },
      { key: "channels", labelKey: "settings.channels", icon: Radio, href: "/settings/channels", perm: "manage_channels" },
      { key: "integrations", labelKey: "settings.web_api", icon: Plug, href: "/settings/integrations", perm: "view_settings" },
    ],
  },
  {
    titleKey: "settings.audit",
    items: [
      { key: "audit", labelKey: "settings.audit", icon: Clock, href: "/settings/audit", perm: "menu_audit_log" },
    ],
  },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const { can } = usePermissions();
  const { t } = useI18n();

  // Hide sections the role can't access; drop groups that become empty.
  const groups = GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => can(i.perm)) }))
    .filter((g) => g.items.length > 0);

  // Active item = the nav href that is a prefix of the current path (so nested
  // routes like /settings/automation/<id>/flow keep "Automation" highlighted).
  const activeHref = groups.flatMap((g) => g.items)
    .map((i) => i.href)
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <div className="flex h-full min-h-0">
      {/* Settings sidebar — mounted once, persists across child navigation */}
      <div className="w-[260px] shrink-0 border-r border-border bg-card py-5 overflow-y-auto">
        {groups.map((g, gi) => (
          <div key={g.titleKey} className="mb-5">
            <p className="px-5 mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {t(g.titleKey)}
            </p>
            <div className="space-y-0.5">
              {g.items.map((s) => {
                const Icon = s.icon;
                const sel = s.href === activeHref;
                return (
                  <Link
                    key={s.key}
                    href={s.href}
                    scroll={false}
                    className={cn(
                      "mx-3 rounded-md py-2.5 px-3.5 flex items-center gap-3 text-left outline-none transition-colors",
                      sel
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("w-[18px] h-[18px] shrink-0", sel ? "text-foreground" : "text-muted-foreground")} />
                    <span className={cn("text-[13.5px]", sel ? "font-semibold" : "font-medium")}>{t(s.labelKey)}</span>
                  </Link>
                );
              })}
            </div>
            {gi < groups.length - 1 && <div className="mx-5 mt-5 border-t border-border/50" />}
          </div>
        ))}
      </div>

      {/* Page content — only this remounts on navigation */}
      <div className="flex-1 min-w-0 overflow-y-auto bg-background">
        <div className="animate-fade-in">
          {children}
        </div>
      </div>
    </div>
  );
}
