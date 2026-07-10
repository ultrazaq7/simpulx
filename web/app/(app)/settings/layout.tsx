"use client";
// Persistent settings layout: renders Shell + the settings sidebar ONCE. Next.js
// keeps a layout mounted across child route navigations, so the sidebar (and its
// scroll position) never remounts — fixing the scroll-jump that the old per-page
// SettingsLayout had. Active section is derived from the pathname, so the URL is
// always the source of truth (no more ?section= facade).
import { type ReactNode, useState, useEffect, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Settings, FormInput, Bell, User, ShieldCheck, ListOrdered,
  Building2, Building, FileText, GitBranch, RadioTower, Clock, ClipboardList,
  PanelLeftClose, PanelLeftOpen, Boxes, Zap, SlidersHorizontal, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, getUser } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";
import { useEscClose } from "@/lib/useEscClose";
import { Tip } from "@/components/ui/tooltip";

// perm = permission key gating this section. Items without a dedicated perm in
// the matrix fall back to "view_settings" (anyone who can open Settings).
type NavItem = { key: string; labelKey: string; icon: any; href: string; perm: string };

const GROUPS: { titleKey: string; items: NavItem[] }[] = [
  {
    titleKey: "menu.preferences",
    items: [
      { key: "general", labelKey: "settings.general", icon: SlidersHorizontal, href: "/settings/general", perm: "view_settings" },
    ],
  },
  {
    titleKey: "settings.company_settings",
    items: [
      { key: "company-details", labelKey: "settings.company_details", icon: Building, href: "/settings/company-details", perm: "view_settings" },
      { key: "user-management", labelKey: "settings.user_management", icon: User, href: "/settings/user-management", perm: "manage_team" },
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
      { key: "quick-replies", labelKey: "Quick Replies", icon: Zap, href: "/settings/quick-replies", perm: "view_settings" },
      { key: "custom-fields", labelKey: "settings.custom_fields", icon: FormInput, href: "/settings/custom-fields", perm: "view_settings" },
      { key: "stages", labelKey: "settings.pipeline_stages", icon: ListOrdered, href: "/settings/stages", perm: "view_settings" },
      // Channel & Integrations merges messaging channels, Web API lead sources and ad accounts.
      { key: "channels", labelKey: "settings.channels_integrations", icon: RadioTower, href: "/settings/channels", perm: "manage_channels" },
    ],
  },
  {
    titleKey: "settings.audit",
    items: [
      { key: "audit", labelKey: "settings.audit", icon: Clock, href: "/settings/audit", perm: "menu_audit_log" },
    ],
  },
];

const useIsoLayoutEffect = typeof document !== "undefined" ? useLayoutEffect : useEffect;

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const { can } = usePermissions();
  const { t } = useI18n();
  // Lazy-init from localStorage so a refresh renders the collapsed sidebar
  // immediately (no expand-then-collapse flash).
  const [collapsed, setCollapsed] = useState<boolean>(() => typeof window !== "undefined" && localStorage.getItem("simpulx_settings_collapsed") === "1");
  const toggle = () => setCollapsed((c) => { const n = !c; localStorage.setItem("simpulx_settings_collapsed", n ? "1" : "0"); return n; });
  // Which collapsible sections are expanded. The section holding the active
  // route auto-expands; users can toggle the rest open/closed.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) => setOpenSections((p) => ({ ...p, [key]: !p[key] }));
  // Esc collapses the settings sidebar. It mounts after Shell, so it sits ABOVE
  // the main sidebar on the shared LIFO stack -> Esc collapses this one first,
  // then the main sidebar (the order requested).
  useEscClose(!collapsed, () => { setCollapsed(true); localStorage.setItem("simpulx_settings_collapsed", "1"); }, -2);

  // Platform is visible only to the super admin (a configured email, not a role).
  // Lazy-init from the cached session so the Platform item renders immediately on
  // reload (like every other nav item) instead of popping in after the async
  // access check; the effect then reconciles with the server in case it's stale.
  const [isSuper, setIsSuper] = useState<boolean>(() => typeof window !== "undefined" && !!getUser()?.is_super_admin);
  useEffect(() => { api.platformAccess().then((r) => setIsSuper(r.super_admin)).catch(() => {}); }, []);

  const navScrollRef = useRef<HTMLDivElement | null>(null);
  const activeItemRef = useRef<HTMLAnchorElement | null>(null);

  // Hide sections the role can't access; drop groups that become empty.
  const groups = [
    ...GROUPS
      .map((g) => ({ ...g, items: g.items.filter((i) => can(i.perm)) }))
      .filter((g) => g.items.length > 0),
    ...(isSuper ? [{ titleKey: "Platform", items: [{ key: "platform", labelKey: "Platform", icon: Boxes, href: "/settings/platform", perm: "" }] }] : []),
  ];

  const navCount = groups.reduce((n, g) => n + g.items.length, 0);

  // Active item = the nav href that is a prefix of the current path (so nested
  // routes like /settings/automation/<id>/flow keep "Automation" highlighted).
  const activeHref = groups.flatMap((g) => g.items)
    .map((i) => i.href)
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];

  // Auto-expand the section that contains the active page.
  useEffect(() => {
    const active = groups.find((g) => g.items.some((i) => i.href === activeHref));
    if (active) setOpenSections((p) => (p[active.titleKey] ? p : { ...p, [active.titleKey]: true }));
  }, [activeHref]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bring the active section into view on load / route change. Deterministic
  // (center the active item in the nav viewport) rather than restoring a saved
  // pixel offset — so a reload deep in the list (e.g. Platform at the bottom)
  // always shows where you are instead of pinning to the top. Re-applies on a
  // rAF because the async nav content (permissions + Platform) renders late.
  useIsoLayoutEffect(() => {
    const box = navScrollRef.current, el = activeItemRef.current;
    if (!box || !el) return;
    const center = () => {
      const b = box.getBoundingClientRect(), e = el.getBoundingClientRect();
      const delta = (e.top - b.top) - (box.clientHeight / 2 - el.clientHeight / 2);
      if (Math.abs(delta) > 2) box.scrollTop += delta;
    };
    center();
    const raf = requestAnimationFrame(center);
    return () => cancelAnimationFrame(raf);
  }, [navCount, collapsed]);

  // Flat item list for the mobile horizontal nav strip (groups collapse away).
  const flatItems = groups.flatMap((g) => g.items);

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0">
      {/* Mobile: horizontal scrollable section strip (the vertical sidebar
          doesn't fit next to content below lg). */}
      <div className="lg:hidden shrink-0 border-b border-border bg-card overflow-x-auto">
        <div className="flex items-center gap-1 px-2 py-2 w-max">
          {flatItems.map((s) => {
            const sel = s.href === activeHref;
            return (
              <Link
                key={s.key}
                href={s.href}
                scroll={false}
                className={cn(
                  "inline-flex items-center px-3.5 h-9 rounded-full text-[13px] whitespace-nowrap outline-none transition-colors",
                  sel ? "bg-primary/[0.12] text-primary font-semibold" : "text-muted-foreground hover:bg-muted font-medium",
                )}
              >
                {t(s.labelKey)}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Settings sidebar — desktop only; text-only for an enterprise look.
          Collapsed hides the panel, leaving a slim expand tab. */}
      {collapsed ? (
        <div className="max-lg:hidden shrink-0 border-r border-border bg-card flex flex-col items-center py-3">
          <Tip label="Expand" side="right">
            <button onClick={toggle}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors">
              <PanelLeftOpen className="w-[18px] h-[18px]" />
            </button>
          </Tip>
        </div>
      ) : (
        <div className="max-lg:hidden shrink-0 w-[260px] border-r border-border bg-card flex flex-col">
          <div ref={navScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden py-3 min-h-0">
            {groups.map((g) => {
              const open = !!openSections[g.titleKey];
              return (
                <div key={g.titleKey} className="px-2 mb-0.5">
                  <button onClick={() => toggleSection(g.titleKey)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-left text-foreground hover:bg-muted/50 outline-none transition-colors">
                    <span className="flex-1 text-[14px] font-bold">{t(g.titleKey)}</span>
                    <ChevronRight className={cn("w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-90")} />
                  </button>
                  {open && (
                    <div className="mt-0.5 mb-1 space-y-0.5">
                      {g.items.map((s) => {
                        const sel = s.href === activeHref;
                        return (
                          <Link
                            key={s.key}
                            ref={sel ? activeItemRef : undefined}
                            href={s.href}
                            scroll={false}
                            className={cn(
                              "block rounded-md py-2 pl-6 pr-3 text-[13px] outline-none transition-colors",
                              sel
                                ? "bg-muted text-foreground font-semibold"
                                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                            )}
                          >
                            {t(s.labelKey)}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Collapse toggle — pinned at the bottom */}
          <div className="shrink-0 border-t border-border p-2 flex justify-end">
            <Tip label="Collapse" side="top">
              <button onClick={toggle}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors">
                <PanelLeftClose className="w-[18px] h-[18px]" />
              </button>
            </Tip>
          </div>
        </div>
      )}

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
