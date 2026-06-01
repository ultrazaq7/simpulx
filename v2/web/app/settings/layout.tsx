"use client";
// Persistent settings layout: renders Shell + the settings sidebar ONCE. Next.js
// keeps a layout mounted across child route navigations, so the sidebar (and its
// scroll position) never remounts — fixing the scroll-jump that the old per-page
// SettingsLayout had. Active section is derived from the pathname, so the URL is
// always the source of truth (no more ?section= facade).
import { type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Box, List, ListItemButton, ListItemIcon, ListItemText, Typography, Divider } from "@mui/material";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import TitleRoundedIcon from "@mui/icons-material/TitleRounded";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import CellTowerRoundedIcon from "@mui/icons-material/CellTowerRounded";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import Shell from "@/components/Shell";

type NavItem = { key: string; label: string; icon: typeof SettingsOutlinedIcon; href: string };

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Account",
    items: [
      { key: "general", label: "General", icon: SettingsOutlinedIcon, href: "/settings/general" },
      { key: "branding", label: "Branding", icon: TitleRoundedIcon, href: "/settings/branding" },
      { key: "notifications", label: "Notifications", icon: NotificationsNoneRoundedIcon, href: "/settings/notifications" },
    ],
  },
  {
    title: "Users",
    items: [
      { key: "people", label: "People", icon: PeopleAltOutlinedIcon, href: "/settings/people" },
      { key: "roles", label: "Roles & Permissions", icon: AdminPanelSettingsOutlinedIcon, href: "/settings/roles" },
      { key: "departments", label: "Departments", icon: BusinessOutlinedIcon, href: "/settings/departments" },
    ],
  },
  {
    title: "AI & Tools",
    items: [
      { key: "ai", label: "AI Agent", icon: AutoAwesomeOutlinedIcon, href: "/settings/ai" },
      { key: "knowledge", label: "Knowledge Base", icon: MenuBookOutlinedIcon, href: "/settings/knowledge" },
    ],
  },
  {
    title: "Marketing & Dev",
    items: [
      { key: "campaigns", label: "Campaigns", icon: StorefrontOutlinedIcon, href: "/settings/campaigns" },
      { key: "templates", label: "Templates", icon: ArticleOutlinedIcon, href: "/settings/templates" },
      { key: "automation", label: "Automation", icon: AccountTreeRoundedIcon, href: "/settings/automation" },
      { key: "channels", label: "Channels", icon: CellTowerRoundedIcon, href: "/settings/channels" },
      { key: "integrations", label: "Web API", icon: HubOutlinedIcon, href: "/settings/integrations" },
    ],
  },
  {
    title: "Security",
    items: [
      { key: "audit", label: "Audit log", icon: HistoryRoundedIcon, href: "/settings/audit" },
    ],
  },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "";

  // Active item = the nav href that is a prefix of the current path (so nested
  // routes like /settings/automation/<id>/flow keep "Automation" highlighted).
  const activeHref = GROUPS.flatMap((g) => g.items)
    .map((i) => i.href)
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <Shell>
      <Box sx={{ display: "flex", height: "100%", minHeight: 0 }}>
        {/* Settings sidebar — mounted once, persists across child navigation */}
        <Box sx={{ width: 250, flexShrink: 0, borderRight: "1px solid", borderColor: "divider", bgcolor: "background.paper", py: 2, overflowY: "auto" }}>
          {GROUPS.map((g, gi) => (
            <Box key={g.title} sx={{ mb: 2 }}>
              <Typography sx={{ px: 2, mb: 1, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "text.secondary" }}>
                {g.title}
              </Typography>
              <List disablePadding>
                {g.items.map((s) => {
                  const Icon = s.icon;
                  const sel = s.href === activeHref;
                  return (
                    <ListItemButton key={s.key} selected={sel} onClick={() => router.push(s.href)}
                      sx={{
                        mx: 1.5, borderRadius: "8px", mb: 0.5, py: 0.75, px: 1.5,
                        "&.Mui-selected": { bgcolor: "rgba(0,0,0,0.04)", color: "text.primary", "&:hover": { bgcolor: "rgba(0,0,0,0.06)" } },
                        "&:hover": { bgcolor: "rgba(0,0,0,0.02)" },
                      }}>
                      <ListItemIcon sx={{ minWidth: 32 }}><Icon sx={{ fontSize: 18, color: sel ? "text.primary" : "text.secondary" }} /></ListItemIcon>
                      <ListItemText slotProps={{ primary: { sx: { fontSize: 14, fontWeight: sel ? 600 : 500, color: sel ? "text.primary" : "text.secondary" } } }}>{s.label}</ListItemText>
                    </ListItemButton>
                  );
                })}
              </List>
              {gi < GROUPS.length - 1 && <Divider sx={{ mx: 2, mt: 2, opacity: 0.5 }} />}
            </Box>
          ))}
        </Box>

        {/* Page content — only this remounts on navigation */}
        <Box sx={{ flex: 1, minWidth: 0, overflowY: "auto", bgcolor: "#F3F4F6" }}>
          {children}
        </Box>
      </Box>
    </Shell>
  );
}
