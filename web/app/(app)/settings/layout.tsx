"use client";
// Persistent settings layout: renders Shell + the settings sidebar ONCE. Next.js
// keeps a layout mounted across child route navigations, so the sidebar (and its
// scroll position) never remounts — fixing the scroll-jump that the old per-page
// SettingsLayout had. Active section is derived from the pathname, so the URL is
// always the source of truth (no more ?section= facade).
import { type ReactNode, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Settings, FormInput, Bell, User, ShieldCheck,
  Building2, FileText, GitBranch, Radio, Clock, ClipboardList,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";
import { Tip } from "@/components/ui/tooltip";

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
      { key: "people", labelKey: "settings.team", icon: User, href: "/settings/people", perm: "manage_team" },
      { key: "roles", labelKey: "settings.roles", icon: ShieldCheck, href: "/settings/roles", perm: "manage_roles" },
    ],
  },
  {
    titleKey: "settings.channels",
    items: [
      { key: "campaigns", labelKey: "settings.campaigns", icon: Building2, href: "/settings/campaigns", perm: "manage_campaigns" },
      { key: "templates", labelKey: "settings.templates", icon: FileText, href: "/settings/templates", perm: "view_settings" },
      { key: "automation", labelKey: "settings.automations", icon: GitBranch, href: "/settings/automation", perm: "view_automation" },
      { key: "wa-forms", labelKey: "settings.forms", icon: ClipboardList, href: "/settings/wa-forms", perm: "view_automation" },
      { key: "custom-fields", labelKey: "settings.custom_fields", icon: FormInput, href: "/settings/custom-fields", perm: "view_settings" },
      // Channel & Integrations merges messaging channels, Web API lead sources and ad accounts.
      { key: "channels", labelKey: "settings.channels_integrations", icon: Radio, href: "/settings/channels", perm: "manage_channels" },
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
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setCollapsed(localStorage.getItem("simpulx_settings_collapsed") === "1"); }, []);
  const toggle = () => setCollapsed((c) => { const n = !c; localStorage.setItem("simpulx_settings_collapsed", n ? "1" : "0"); return n; });

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

  // Flat item list for the mobile horizontal nav strip (groups collapse away).
  const flatItems = groups.flatMap((g) => g.items);

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0">
      {/* Mobile: horizontal scrollable section strip (the vertical sidebar
          doesn't fit next to content below lg). */}
      <div className="lg:hidden shrink-0 border-b border-border bg-card overflow-x-auto">
        <div className="flex items-center gap-1 px-2 py-2 w-max">
          {flatItems.map((s) => {
            const Icon = s.icon;
            const sel = s.href === activeHref;
            return (
              <Link
                key={s.key}
                href={s.href}
                scroll={false}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-[13px] whitespace-nowrap outline-none transition-colors",
                  sel ? "bg-primary/[0.12] text-primary font-semibold" : "text-muted-foreground hover:bg-muted font-medium",
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {t(s.labelKey)}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Settings sidebar — desktop only; mounted once, persists across child navigation */}
      <div className={cn(
        "max-lg:hidden shrink-0 border-r border-border bg-card flex flex-col transition-[width] duration-200",
        collapsed ? "w-[64px]" : "w-[260px]",
      )}>
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 min-h-0">
          {groups.map((g, gi) => (
            <div key={g.titleKey} className="mb-5">
              {!collapsed && (
                <p className="px-5 mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t(g.titleKey)}
                </p>
              )}
              <div className="space-y-0.5">
                {g.items.map((s) => {
                  const Icon = s.icon;
                  const sel = s.href === activeHref;
                  const link = (
                    <Link
                      href={s.href}
                      scroll={false}
                      className={cn(
                        "rounded-md py-2.5 flex items-center text-left outline-none transition-colors",
                        collapsed ? "mx-2 px-0 justify-center" : "mx-3 px-3.5 gap-3",
                        sel
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <Icon className={cn("w-[18px] h-[18px] shrink-0", sel ? "text-foreground" : "text-muted-foreground")} />
                      {!collapsed && <span className={cn("text-[13.5px]", sel ? "font-semibold" : "font-medium")}>{t(s.labelKey)}</span>}
                    </Link>
                  );
                  return collapsed
                    ? <Tip key={s.key} label={t(s.labelKey)} side="right">{link}</Tip>
                    : <div key={s.key}>{link}</div>;
                })}
              </div>
              {!collapsed && gi < groups.length - 1 && <div className="mx-5 mt-5 border-t border-border/50" />}
            </div>
          ))}
        </div>

        {/* Collapse toggle — pinned at the bottom */}
        <div className={cn("shrink-0 border-t border-border p-2 flex", collapsed ? "justify-center" : "justify-end")}>
          <Tip label={collapsed ? "Expand" : "Collapse"} side={collapsed ? "right" : "top"}>
            <button onClick={toggle}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors">
              {collapsed ? <PanelLeftOpen className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
            </button>
          </Tip>
        </div>
      </div>

      {/* Page content — only this remounts on navigation. overflow-hidden so the
          area never shows its own scrollbar; each page scrolls internally. */}
      <div className="flex-1 min-w-0 overflow-hidden bg-background">
        <div className="animate-fade-in h-full">
          {children}
        </div>
      </div>
    </div>
  );
}
