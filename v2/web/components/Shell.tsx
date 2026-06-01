"use client";
import { useEffect, useState, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Box, Tooltip, Avatar, IconButton, Typography, Badge, Menu, MenuItem,
  Divider, ListItemIcon, ListItemText, Popover, Dialog, DialogContent, TextField, InputAdornment, Snackbar, Button
} from "@mui/material";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import CellTowerRoundedIcon from "@mui/icons-material/CellTowerRounded";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import ScheduleSendOutlinedIcon from "@mui/icons-material/ScheduleSendOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import { WS_URL } from "@/lib/api";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import { api, clearSession, getToken, getUser } from "@/lib/api";
import { initials } from "@/lib/utils";
import type { User } from "@/lib/types";

const NAV_TOP = [
  { href: "/dashboard", icon: DashboardRoundedIcon, label: "Dashboard" },
  { href: "/inbox", icon: ChatBubbleOutlineRoundedIcon, label: "Inbox" },
  { href: "/contacts", icon: PeopleAltOutlinedIcon, label: "Contacts" },
  { href: "/broadcasts", icon: CampaignOutlinedIcon, label: "Broadcasts" },
  { href: "/sequences", icon: ScheduleSendOutlinedIcon, label: "Follow-ups" },
];

const NAV_BOTTOM = [
  { href: "/settings", icon: SettingsOutlinedIcon, label: "Settings" },
];

const SIDEBAR_W = 72;

const PAGE_TITLES: Record<string, { category: string; title: string }> = {
  "/dashboard": { category: "OVERVIEW", title: "Dashboard" },
  "/inbox": { category: "INBOX", title: "Conversations" },
  "/contacts": { category: "GROUPS", title: "Contacts" },
  "/campaigns": { category: "CAMPAIGNS", title: "Campaigns" },
  "/broadcasts": { category: "OUTREACH", title: "Broadcasts" },
  "/templates": { category: "OUTREACH", title: "Message Templates" },
  "/automation": { category: "AUTOMATION", title: "Automation" },
  "/sequences": { category: "AUTOMATION", title: "Follow-ups" },
  "/channels": { category: "SETUP", title: "Channels" },
  "/integrations": { category: "SETUP", title: "Web API" },
  "/settings": { category: "", title: "Settings" },
};

export default function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenu, setUserMenu] = useState<null | HTMLElement>(null);
  const [notifAnchor, setNotifAnchor] = useState<null | HTMLElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [brand, setBrand] = useState("Simpulx");
  const [metaTitle, setMetaTitle] = useState("");
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [orgSettings, setOrgSettings] = useState<any>({});
  const orgSettingsRef = useRef<any>({});

  useEffect(() => {
    orgSettingsRef.current = orgSettings;
  }, [orgSettings]);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    setUser(getUser());
  }, [router]);


  // Load workspace branding (page/meta title) once.
  useEffect(() => {
    if (!getToken()) return;
    api.getOrganization()
      .then((o) => {
        setBrand(o.settings?.branding?.page_title || "Simpulx");
        setMetaTitle(o.settings?.branding?.meta_title || "");
        setOrgSettings(o.settings || {});
      })
      .catch(() => {});
      
  }, []);

  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = () => {
    api.listConversations().then((convs) => {
      setUnreadCount(convs.reduce((acc, c) => acc + (c.unread_count || 0), 0));
    }).catch(() => {});
  };

  useEffect(() => {
    if (!getToken()) return;
    refreshUnread();
    
    const handleRefresh = () => refreshUnread();
    window.addEventListener("refreshUnread", handleRefresh);

    const u = getUser(); if (!u) return;
    let ws: WebSocket;
    let reconnectTimer: NodeJS.Timeout;
    let attempt = 0;
    let isIntentionalClose = false;

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const connect = () => {
      ws = new WebSocket(`${WS_URL}/ws?org=${u.org_id}`);
      ws.onopen = () => { attempt = 0; };
      ws.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          // Dispatch event so other pages (like inbox) can react
          window.dispatchEvent(new CustomEvent("ws_message", { detail: ev }));

          const prefs = orgSettingsRef.current?.notifications || { sound: true, newMessages: true, newConversations: true };
          // ev.data may be a JSON string (RawMessage) or already parsed object
          let payload = ev.data || ev;
          if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch {} }

          const playBeep = (freq: number = 880, dur: number = 0.15) => {
            try {
              const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain); gain.connect(ctx.destination);
              osc.frequency.value = freq; osc.type = "sine";
              gain.gain.setValueAtTime(0.3, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
              osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
              setTimeout(() => ctx.close(), 500);
            } catch {}
          };

          if (ev.type === "alert" || ev.type === "notification.alert") {
            if (prefs.sound !== false) playBeep(1200, 0.3);
            if (prefs.newMessages !== false && "Notification" in window && Notification.permission === "granted") {
              new Notification(payload.title || "Urgent", { body: payload.body || "Check your inbox", requireInteraction: true });
            }
          } else if (ev.type === "message.persisted") {
            refreshUnread();
            // Only notify for INBOUND messages, not our own outbounds
            if (payload.direction === "inbound") {
              if (prefs.sound !== false) playBeep(880, 0.15);
              if (prefs.newMessages !== false && "Notification" in window && Notification.permission === "granted") {
                new Notification("New Message", { body: payload.preview || payload.body || "You have received a new chat message." });
              }
            }
          }
        } catch (err) {}
      };
      ws.onclose = () => {
        if (isIntentionalClose) return;
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        attempt++;
        reconnectTimer = setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      isIntentionalClose = true;
      window.removeEventListener("refreshUnread", handleRefresh);
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  // Browser tab title: "{Page} - {brand}".
  useEffect(() => {
    const info = Object.entries(PAGE_TITLES).find(([k]) => pathname.startsWith(k))?.[1];
    const base = info?.title ? `${info.title} - ${brand}` : brand;
    document.title = unreadCount > 0 ? `(${unreadCount}) ${base}` : base;
  }, [pathname, brand, unreadCount]);

  // Meta description tag.
  useEffect(() => {
    if (!metaTitle) return;
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement("meta"); m.setAttribute("name", "description"); document.head.appendChild(m); }
    m.setAttribute("content", metaTitle);
  }, [metaTitle]);

  // Ctrl+K shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); setSearchOpen(true); }
      if (e.key === "Escape") setSearchOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function logout() { clearSession(); router.replace("/login"); }

  const pageInfo = Object.entries(PAGE_TITLES).find(([k]) => pathname.startsWith(k))?.[1]
    || { category: "", title: "Simpulx" };

  if (!user) return (
    <Box sx={{ display: "grid", placeItems: "center", height: "100vh", color: "text.secondary", fontSize: 14 }}>
      Loading...
    </Box>
  );

  function NavItem({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
    const active = pathname.startsWith(href);
    return (
      <Tooltip title={!sidebarOpen ? label : ""} placement="right">
        <Link href={href} style={{ textDecoration: "none", width: "100%", padding: "0 14px" }}>
          <Box sx={{
            width: "100%", height: 44, borderRadius: "8px", display: "flex", alignItems: "center",
            justifyContent: "flex-start",
            color: active ? "#fff" : "rgba(180,200,195,0.6)",
            bgcolor: active ? "rgba(255,255,255,0.07)" : "transparent",
            "&:hover": { bgcolor: active ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)", color: "#fff" },
            transition: "all 0.15s", overflow: "hidden",
          }}>
            <Box sx={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Badge badgeContent={href === "/inbox" && unreadCount > 0 ? (unreadCount > 99 ? "99+" : unreadCount) : 0} color="error" sx={{ "& .MuiBadge-badge": { fontSize: 9, height: 16, minWidth: 16 } }}>
                <Icon sx={{ fontSize: 22 }} />
              </Badge>
            </Box>
            <Typography sx={{ 
              ml: 0.5, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
              opacity: sidebarOpen ? 1 : 0, transition: "opacity 0.2s",
            }}>
              {label}
            </Typography>
          </Box>
        </Link>
      </Tooltip>
    );
  }

  return (
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* ── Sidebar ── */}
      <Box 
        sx={{
          width: sidebarOpen ? 240 : SIDEBAR_W, 
          flexShrink: 0, display: "flex", flexDirection: "column",
          py: 2, gap: 0.5,
          background: "#0d1b16",
          transition: "width 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          zIndex: 50, position: "relative",
          overflowX: "hidden",
      }}>
        <Box sx={{ display: "flex", alignItems: "center", px: "13px", mb: 2.5, height: 46 }}>
          <Link href="/dashboard" style={{ textDecoration: "none", overflow: "hidden", display: "flex", alignItems: "center" }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: "8px", overflow: "hidden", flexShrink: 0,
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}>
              <img src="/simpulx_logo.png" alt="Simpulx" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </Box>
            <Typography sx={{
              ml: 1.5, fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: "#fff",
              opacity: sidebarOpen ? 1 : 0, transition: "opacity 0.2s", whiteSpace: "nowrap"
            }}>
              Simpul<span style={{ color: "#F5A623" }}>x</span>
            </Typography>
          </Link>
        </Box>

        {/* Top nav */}
        {NAV_TOP.map((n) => <NavItem key={n.href} {...n} />)}

        <Box sx={{ flex: 1 }} />

        {/* ── Toggle Sidebar ── */}
        <Box sx={{ px: 2, pb: 2, display: "flex", justifyContent: sidebarOpen ? "flex-end" : "center" }}>
          <IconButton size="small" onClick={() => setSidebarOpen(!sidebarOpen)} sx={{ color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)", "&:hover": { color: "#fff", bgcolor: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.2)" } }}>
             {sidebarOpen ? <ChevronLeftRoundedIcon fontSize="small" /> : <ChevronRightRoundedIcon fontSize="small" />}
          </IconButton>
        </Box>

        {/* Bottom nav */}
        {NAV_BOTTOM.map((n) => <NavItem key={n.href} {...n} />)}
      </Box>

      {/* ── Main content ── */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        {/* Top Header Bar */}
        <Box sx={{
          height: 56, flexShrink: 0, display: "flex", alignItems: "center", px: 2, gap: 2,
          bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider",
        }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "text.secondary", textTransform: "uppercase" }}>
              {pageInfo.category}
            </Typography>
            <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2, mt: -0.25 }}>
              {pageInfo.title}
            </Typography>
          </Box>

          {/* Search (Functional) */}
          <Box onClick={() => setSearchOpen(true)} sx={{
            display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 0.75, borderRadius: "8px",
            border: "1px solid", borderColor: "divider", bgcolor: "background.default",
            minWidth: 220, cursor: "pointer",
            "&:hover": { borderColor: "rgba(0,0,0,0.2)" }, transition: "border-color 0.15s",
          }}>
            <SearchRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
            <Typography sx={{ fontSize: 13, color: "text.disabled", flex: 1 }}>Search</Typography>
            <Box sx={{
              display: "flex", alignItems: "center", gap: 0.25, px: 0.75, py: 0.25,
              borderRadius: "4px", bgcolor: "rgba(0,0,0,0.06)", fontSize: 11, fontWeight: 600, color: "text.secondary",
            }}>
              Ctrl K
            </Box>
          </Box>

          {/* Notifications */}
          <Tooltip title="Notifications">
            <IconButton size="small" sx={{ color: "text.secondary" }} onClick={(e) => setNotifAnchor(e.currentTarget)}>
              <Badge variant="dot" color="error" invisible>
                <NotificationsNoneRoundedIcon sx={{ fontSize: 22 }} />
              </Badge>
            </IconButton>
          </Tooltip>

          {/* User Avatar (clickable with menu) */}
          <Box onClick={(e) => setUserMenu(e.currentTarget)} sx={{
            display: "flex", alignItems: "center", gap: 1, cursor: "pointer", borderRadius: "8px", px: 1, py: 0.5,
            "&:hover": { bgcolor: "action.hover" }, transition: "background 0.15s",
          }}>
            <Avatar sx={{ width: 32, height: 32, fontSize: 12, fontWeight: 700, bgcolor: "primary.main" }}>
              {initials(user.name)}
            </Avatar>
            <Typography sx={{ fontSize: 13, fontWeight: 600, display: { xs: "none", md: "block" } }}>
              {user.name}
            </Typography>
          </Box>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative" }}>
          {children}
        </Box>

      </Box>
      {/* ── User Menu ── */}
      <Menu anchorEl={userMenu} open={!!userMenu} onClose={() => setUserMenu(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { minWidth: 200, mt: 1 } } }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{user.name}</Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>{user.email || user.role}</Typography>
        </Box>
        <Divider />
        <MenuItem onClick={() => { setUserMenu(null); router.push("/settings"); }}>
          <ListItemIcon><PersonOutlineRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText slotProps={{ primary: { sx: { fontSize: 13 } } }}>Profile</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setUserMenu(null); logout(); }}>
          <ListItemIcon><LogoutRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText slotProps={{ primary: { sx: { fontSize: 13 } } }}>Sign out</ListItemText>
        </MenuItem>
      </Menu>

      {/* ── Notifications Popover ── */}
      <Popover open={!!notifAnchor} anchorEl={notifAnchor} onClose={() => setNotifAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: 340, mt: 1, borderRadius: "8px" } } }}
      >
        <Box sx={{ p: 2.5, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Notifications</Typography>
        </Box>
        <Box sx={{ p: 4, textAlign: "center" }}>
          <CheckCircleOutlineRoundedIcon sx={{ fontSize: 40, color: "divider", mb: 1 }} />
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>All caught up!</Typography>
          <Typography variant="caption" sx={{ color: "text.disabled" }}>No new notifications</Typography>
        </Box>
      </Popover>

      {/* ── Search Dialog (Ctrl+K) ── */}
      <Dialog open={searchOpen} onClose={() => { setSearchOpen(false); setSearchQuery(""); }}
        maxWidth="sm" fullWidth
        slotProps={{ paper: { sx: { borderRadius: "8px", mt: -10 } } }}
      >
        <DialogContent sx={{ p: 0 }}>
          <TextField
            autoFocus fullWidth placeholder="Search conversations, contacts, settings..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            slotProps={{ input: {
              startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: "text.secondary" }} /></InputAdornment>,
            }}}
            sx={{
              "& .MuiOutlinedInput-root": { borderRadius: "8px", "& fieldset": { border: "none" } },
              "& .MuiInputBase-input": { py: 2, fontSize: 15 },
            }}
          />
          <Divider />
          <Box sx={{ p: 2, textAlign: "center" }}>
            <Typography sx={{ fontSize: 13, color: "text.disabled" }}>
              {searchQuery ? `No results for "${searchQuery}"` : "Start typing to search..."}
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
