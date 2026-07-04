"use client";
import { useEffect, useState, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  MessageCircle, Settings,
  ChevronLeft, ChevronRight, Bell, LogOut, User as UserIcon,
  CheckCircle2, Loader2, ChevronDown, Activity, LayoutDashboard, MessagesSquare, Users, SlidersHorizontal, Megaphone, Wrench, Globe,
  ScrollText, BarChart3, ShieldCheck, FileText, Radio, GitBranch, Plug, Search, Repeat, ClipboardList, Building2, FormInput
} from "lucide-react";
import { WS_URL } from "@/lib/api";
import { api, clearSession, getToken, getUser, setSession } from "@/lib/api";
import { initials, cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";
import { usePermissions } from "@/lib/permissions";
import type { AppNotification, User } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import IncomingCallListener from "@/components/IncomingCallListener";
import CommandPalette from "@/components/CommandPalette";
import KeyboardHelp from "@/components/KeyboardHelp";
import { registerPush, unregisterPush } from "@/lib/push";

function relAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// One shared AudioContext, unlocked on the first user gesture (browsers block
// audio until then). Re-using it avoids the "AudioContext was not allowed" warning
// and leaking a context per notification.
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (_audioCtx.state === "suspended") void _audioCtx.resume();
    return _audioCtx;
  } catch { return null; }
}
function playBeep(freq = 880, dur = 0.15) {
  const ctx = getAudioCtx();
  if (!ctx || ctx.state !== "running") return; // not unlocked by a gesture yet
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq; osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
  } catch { /* ignore */ }
}

const NAV_TOP = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard", perm: "menu_dashboard" },
  { href: "/inbox", icon: MessageCircle, labelKey: "nav.inbox", perm: "menu_chats" },
  { href: "/contacts", icon: Users, labelKey: "nav.contacts", perm: "menu_contacts" },
  { href: "/broadcasts", icon: Megaphone, labelKey: "nav.broadcasts", perm: "menu_broadcasts" },
  { href: "/drip", icon: Repeat, labelKey: "nav.drip", perm: "menu_broadcasts" },
];

const NAV_BOTTOM = [
  { href: "/settings", icon: Settings, labelKey: "nav.settings", perm: "menu_settings" },
];

const SIDEBAR_W = 72;

const PAGE_TITLES: Record<string, { category: string; title: string }> = {
  "/dashboard": { category: "OVERVIEW", title: "Dashboard" },
  "/inbox": { category: "INBOX", title: "My Inbox" },
  "/contacts": { category: "GROUPS", title: "Contacts" },
  "/campaigns": { category: "CAMPAIGNS", title: "Campaigns" },
  "/broadcasts": { category: "OUTREACH", title: "Broadcasts" },
  "/drip": { category: "OUTREACH", title: "Drip campaigns" },
  "/templates": { category: "OUTREACH", title: "Message Templates" },
  "/automation": { category: "AUTOMATION", title: "Automation" },
  "/channels": { category: "SETUP", title: "Channels" },
  "/integrations": { category: "SETUP", title: "Web API" },
  // Settings sub-pages (more specific than "/settings" so each gets its own title + icon).
  "/settings/general": { category: "PREFERENCES", title: "General" },
  "/settings/custom-fields": { category: "CUSTOM_FIELDS", title: "Custom Fields" },
  "/settings/people": { category: "TEAM", title: "Team Members" },
  "/settings/roles": { category: "ROLES", title: "Roles & Permissions" },
  "/settings/campaigns": { category: "CAMPAIGNS", title: "Campaigns" },
  "/settings/templates": { category: "TEMPLATES", title: "Message Templates" },
  "/settings/automation": { category: "AUTOMATION", title: "Automation" },
  "/settings/wa-forms": { category: "FORMS", title: "WhatsApp Forms" },
  "/settings/channels": { category: "CHANNELS", title: "Channels" },
  "/settings/ads": { category: "ANALYTICS", title: "Ad Performance" },
  "/settings/integrations": { category: "INTEGRATIONS", title: "Web API Sources" },
  "/settings/audit": { category: "SYSTEM", title: "System Logs" },
  "/settings": { category: "PREFERENCES", title: "Settings" },
  "/account": { category: "ACCOUNT", title: "Account Settings" },
};

const CATEGORY_ICONS: Record<string, any> = {
  "OVERVIEW": LayoutDashboard,
  "INBOX": MessagesSquare,
  "GROUPS": Users,
  "CAMPAIGNS": Building2,
  "OUTREACH": Megaphone,
  "AUTOMATION": GitBranch,
  "SETUP": Wrench,
  "PREFERENCES": SlidersHorizontal,
  "CUSTOM_FIELDS": FormInput,
  "ACCOUNT": UserIcon,
  "TEAM": UserIcon,
  "ROLES": ShieldCheck,
  "TEMPLATES": FileText,
  "FORMS": ClipboardList,
  "CHANNELS": Radio,
  "ANALYTICS": BarChart3,
  "INTEGRATIONS": Plug,
  "SYSTEM": ScrollText,
};

// Resolve the page title/category by the most specific (longest) matching prefix,
// so /settings/audit wins over /settings.
function resolvePageInfo(pathname: string) {
  return Object.entries(PAGE_TITLES)
    .filter(([k]) => pathname.startsWith(k))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[1];
}

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [brand, setBrand] = useState("Simpulx");
  const { can } = usePermissions();
  const { t, setLang, lang } = useI18n();
  const [metaTitle, setMetaTitle] = useState("");
  const [orgSettings, setOrgSettings] = useState<any>({});
  const orgSettingsRef = useRef<any>({});
  const convNamesRef = useRef<Map<string, string>>(new Map());
  const notifiedRef = useRef<Set<string>>(new Set());
  
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasNotifs, setHasNotifs] = useState(false);
  const [alerts, setAlerts] = useState<{ id: string; title: string; body: string; time: Date }[]>([]);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [notifUnread, setNotifUnread] = useState(0);

  const loadNotifs = () => {
    if (!getToken()) return;
    api.listNotifications().then((r) => { setNotifs(r.notifications || []); setNotifUnread(r.unread || 0); }).catch(() => {});
  };
  // Unlock the shared AudioContext on the first user gesture so notification beeps
  // can play (browsers block audio until then -> the console warning).
  useEffect(() => {
    const unlock = () => getAudioCtx();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);

  // Cmd/Ctrl-K opens the command palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // "?" opens the shortcuts cheatsheet; "g" then d/i/c/b/s navigates (Linear-style).
  useEffect(() => {
    let gPending = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") { e.preventDefault(); setHelpOpen((v) => !v); return; }
      if (gPending) {
        gPending = false; if (t) clearTimeout(t);
        const map: Record<string, string> = { d: "/dashboard", i: "/inbox", c: "/contacts", b: "/broadcasts", s: "/settings" };
        if (map[e.key]) { e.preventDefault(); router.push(map[e.key]); }
        return;
      }
      if (e.key === "g") { gPending = true; t = setTimeout(() => { gPending = false; }, 1000); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (t) clearTimeout(t); };
  }, [router]);

  // Remember the sidebar collapsed/expanded choice across reloads.
  useEffect(() => {
    const v = localStorage.getItem("sidebarOpen");
    if (v !== null) setSidebarOpen(v === "1");
  }, []);
  useEffect(() => { localStorage.setItem("sidebarOpen", sidebarOpen ? "1" : "0"); }, [sidebarOpen]);

  // Clicking a background (service worker) notification posts here -> open the chat.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (d && d.type === "open-conversation" && d.convId) {
        router.push(`/inbox?c=${d.convId}`);
        window.dispatchEvent(new CustomEvent("inbox:open", { detail: d.convId }));
      }
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [router]);

  useEffect(() => {
    loadNotifs();
    registerPush(loadNotifs); // FCM device-token registration (no-op until VAPID is set)
    const t = setInterval(loadNotifs, 30000); // safety poll
    // Near-instant refresh: any websocket activity (incl. the snooze-due relay)
    // re-pulls the bell after a short debounce.
    let deb: ReturnType<typeof setTimeout>;
    const onWs = () => { clearTimeout(deb); deb = setTimeout(loadNotifs, 800); };
    window.addEventListener("ws_message", onWs);
    return () => { clearInterval(t); window.removeEventListener("ws_message", onWs); clearTimeout(deb); };
  }, []);
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    orgSettingsRef.current = orgSettings;
  }, [orgSettings]);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    const cached = getUser();
    setUser(cached);
    // Refresh from the server so a verified email change / rename shows in the
    // header without a re-login (the cached session is set once at login).
    api.me().then((me) => {
      const token = getToken();
      if (!token) return;
      const merged = { ...(cached || {}), ...me } as User;
      setUser(merged);
      setSession(token, merged);
    }).catch(() => {});
  }, [router]);

  useEffect(() => {
    if (!getToken()) return;
    api.getOrganization()
      .then((o) => {
        setBrand(o.settings?.branding?.page_title || "Simpulx");
        setMetaTitle(o.settings?.branding?.meta_title || "");
        setOrgSettings(o.settings || {});
        // Adopt the workspace default language unless this device already chose one.
        const orgLocale = (o.settings as any)?.locale;
        if (orgLocale && !localStorage.getItem("simpulx_lang")) setLang(orgLocale);
      })
      .catch(() => {});
  }, []);

  const refreshUnread = () => {
    api.listConversations().then((convs) => {
      setUnreadCount(convs.reduce((acc, c) => acc + (c.unread_count || 0), 0));
      // Cache id -> name so message notifications can show the contact's name.
      convs.forEach((c) => { if (c.id) convNamesRef.current.set(c.id, c.contact_name || c.contact_phone || "New message"); });
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
      ws = new WebSocket(`${WS_URL}/ws?token=${getToken()}&org=${u.org_id}`);
      ws.onopen = () => { attempt = 0; };
      ws.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          window.dispatchEvent(new CustomEvent("ws_message", { detail: ev }));

          const prefs = orgSettingsRef.current?.notifications || { sound: true, newMessages: true, newConversations: true };
          let payload = ev.data || ev;
          if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch {} }

          // Aggressive OS notification (stays until dismissed, click opens the chat).
          const showNotif = (title: string, body: string, convId?: string) => {
            if (prefs.newMessages === false) return;
            // Only show the in-app popup when this tab is visible; when it's hidden
            // the FCM service worker shows the OS notification (avoids a duplicate).
            if (document.visibilityState !== "visible") return;
            if (!("Notification" in window) || Notification.permission !== "granted") return;
            try {
              const n = new Notification(title, { body, requireInteraction: true, tag: convId || undefined, icon: "/simpulx_logo.png" });
              n.onclick = () => { window.focus(); if (convId) { router.push(`/inbox?c=${convId}`); window.dispatchEvent(new CustomEvent("inbox:open", { detail: convId })); } n.close(); };
            } catch {}
          };

          if (ev.type === "alert" || ev.type === "notification.alert") {
            if (prefs.sound !== false) playBeep(1200, 0.3);
            showNotif(payload.title || "Alert", payload.body || "You have a new notification");
            setAlerts(prev => [{ id: Math.random().toString(), title: payload.title || "Alert", body: payload.body || "You have a new notification", time: new Date() }, ...prev]);
            setHasNotifs(true);
          } else if (ev.type === "audit.created" && payload.type === "snooze_due") {
            // Snooze reopened: beep + bell. The OS popup is owned by FCM (push.ts
            // foreground / service worker background) to avoid a duplicate.
            if (prefs.sound !== false) playBeep(1000, 0.25);
            loadNotifs();
          } else if (ev.type === "message.persisted") {
            const mine = !payload.assigned_agent_id || payload.assigned_agent_id === u.id;
            if (payload.direction === "inbound" && mine) {
              const convId: string | undefined = payload.conversation_id;
              const mid = String(payload.message_id || `${convId}:${payload.preview}`);
              const onThisConv = document.visibilityState === "visible" && !!convId && window.location.search.includes(`c=${convId}`);
              if (!notifiedRef.current.has(mid) && !onThisConv) {
                notifiedRef.current.add(mid);
                if (notifiedRef.current.size > 300) notifiedRef.current.clear();
                if (prefs.sound !== false) playBeep(880, 0.15);
              }
            }
            refreshUnread();
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

  useEffect(() => {
    const info = resolvePageInfo(pathname);
    const base = info?.title ? `${info.title} - ${brand}` : brand;
    document.title = unreadCount > 0 ? `(${unreadCount}) ${base}` : base;
  }, [pathname, brand, unreadCount]);

  useEffect(() => {
    if (!metaTitle) return;
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement("meta"); m.setAttribute("name", "description"); document.head.appendChild(m); }
    m.setAttribute("content", metaTitle);
  }, [metaTitle]);


  // Optimistic logout: clear the session + redirect IMMEDIATELY so it feels
  // instant. The server-side token revoke + FCM cleanup are slow (the FCM token
  // dance can take seconds), so fire them in the background — never awaited.
  // api.logout() reads the refresh token synchronously before the session clears.
  function logout() {
    api.logout().catch(() => {});
    unregisterPush().catch(() => {});
    clearSession();
    router.replace("/login");
  }

  const pageInfo = resolvePageInfo(pathname) || { category: "", title: "Simpulx" };

  if (!user) return (
    <div className="grid place-items-center h-screen bg-background text-muted-foreground text-sm">
      <Loader2 className="w-5 h-5 animate-spin text-primary" />
    </div>
  );

  // Presence: undefined (legacy session) is treated as online; only an explicit false is offline.
  const online = user.is_online !== false;

  function NavItem({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
    const active = pathname.startsWith(href);
    const item = (
      <Link
        href={href}
        className={cn("group relative w-full block outline-none", sidebarOpen ? "px-2.5" : "px-2")}
      >
        {active && <span aria-hidden className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />}
        <div className={cn(
          "h-10 rounded-lg flex items-center transition-colors duration-200",
          sidebarOpen ? "w-full justify-start" : "w-10 mx-auto justify-center",
          // Darker, filled pill on the active tab (like the mobile bottom-nav).
          active ? "bg-primary/[0.16]" : "hover:bg-foreground/[0.04]"
        )}>
          <div className="relative w-10 h-10 shrink-0 flex items-center justify-center">
            {href === "/inbox" && unreadCount > 0 && (
              <span className="absolute top-0.5 right-0 min-w-[15px] h-[15px] rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center px-0.5 z-10 pointer-events-none shadow-sm">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
            <Icon
              strokeWidth={active ? 2 : 1.75}
              // Lucide icons are stroke-only; fill the active glyph so it reads
              // as a solid (filled) icon like the mobile bottom-nav selected tab.
              fill={active ? "currentColor" : "none"}
              className={cn(
                "w-[20px] h-[20px] transition-colors duration-200",
                active ? "text-primary-text" : "text-muted-foreground group-hover:text-foreground"
              )}
            />
          </div>
          {sidebarOpen && (
            <span className={cn(
              "text-[13px] font-semibold whitespace-nowrap",
              active ? "text-primary-text" : "text-muted-foreground group-hover:text-foreground",
            )}>
              {label}
            </span>
          )}
        </div>
      </Link>
    );
    // Collapsed rail shows the label as a portaled tooltip (managed by Base UI —
    // closes on click/navigation, so it never gets stuck).
    return sidebarOpen ? item : <Tip side="right" label={label}>{item}</Tip>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <div
        role="navigation"
        aria-label="Main"
        className="shrink-0 flex flex-col py-4 gap-0.5 bg-muted border-r border-border transition-[width] duration-200 ease-out z-50 relative overflow-x-hidden"
        style={{ width: sidebarOpen ? 240 : SIDEBAR_W }}
      >
        <div className={cn("flex items-center mb-5 h-[46px]", sidebarOpen ? "px-3.5" : "justify-center")}>
          <Link href="/dashboard" className="flex items-center outline-none">
            <div className={cn(
              "rounded-lg overflow-hidden shrink-0 shadow-md transition-[width,height] duration-200",
              sidebarOpen ? "w-9 h-9" : "w-8 h-8",
            )}>
              <img src="/simpulx_logo.png" alt="Simpulx" className="w-full h-full object-cover" />
            </div>
            {sidebarOpen && (
              <span className="ml-3 text-[20px] font-extrabold tracking-tight text-foreground whitespace-nowrap">
                Simpul<span className="text-amber">x</span>
              </span>
            )}
          </Link>
        </div>

        {NAV_TOP.filter((n) => can(n.perm)).map((n) => <NavItem key={n.href} href={n.href} icon={n.icon} label={t(n.labelKey)} />)}
        <div className="flex-1" />

        <div className={cn("px-4 pb-4 flex", sidebarOpen ? "justify-end" : "justify-center")}>
          <button
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 rounded-md text-muted-foreground border border-border hover:text-foreground hover:bg-foreground/5 transition-colors outline-none"
          >
            {sidebarOpen ? <ChevronLeft className="w-[18px] h-[18px]" /> : <ChevronRight className="w-[18px] h-[18px]" />}
          </button>
        </div>
        {NAV_BOTTOM.filter((n) => can(n.perm)).map((n) => <NavItem key={n.href} href={n.href} icon={n.icon} label={t(n.labelKey)} />)}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-background">
        {/* Top Header */}
        <div role="banner" className="h-16 shrink-0 flex items-center px-5 gap-3 bg-card border-b border-border">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase leading-none mb-1">
              {pageInfo.category || " "}
            </p>
            <h1 className="text-[19px] font-bold leading-normal truncate text-foreground flex items-center gap-2">
              {(() => {
                const Icon = CATEGORY_ICONS[pageInfo.category] || Activity;
                return <Icon key={pathname} className="w-[18px] h-[18px] text-primary animate-pop-icon shrink-0" />;
              })()}
              {pageInfo.title}
            </h1>
          </div>

          <div className="flex-1" />

          {/* Command palette trigger */}
          <button
            onClick={() => setCmdOpen(true)}
            className="hidden sm:flex items-center gap-2 h-9 pl-2.5 pr-2 rounded-lg border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors outline-none"
          >
            <Search className="w-4 h-4" />
            <span className="text-[13px]">Search</span>
            <kbd className="text-[10px] font-semibold bg-card border border-border rounded px-1 py-0.5 leading-none">{"⌘"} K</kbd>
          </button>

          {/* Notifications */}
          <Tip label="Notifications" side="bottom">
            <button aria-label="Notifications" onClick={() => { const next = !notifOpen; setNotifOpen(next); setHasNotifs(false); if (next) loadNotifs(); }} className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors relative outline-none">
              <Bell className="w-[20px] h-[20px]" />
              {notifUnread > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 grid place-items-center text-[10px] font-bold text-white bg-red-500 rounded-full ring-2 ring-card">{notifUnread > 9 ? "9+" : notifUnread}</span>
              ) : hasNotifs ? (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-card" />
              ) : null}
            </button>
          </Tip>

          {/* Avatar + name + chevron */}
          <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="flex items-center gap-2 pl-1 pr-2 h-10 rounded-lg hover:bg-muted transition-colors outline-none relative">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-brand-gradient text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
              {user.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" /> : initials(user.name)}
            </div>
            <span className="text-[13px] font-semibold hidden md:block truncate max-w-[120px] text-foreground/90">
              {user.name}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground hidden md:block shrink-0" />
          </button>
        </div>

        {/* Content — instant page switches (no fade/slide), matching enterprise apps */}
        <main role="main" className="flex-1 min-h-0 relative overflow-y-auto overflow-x-hidden">
          <div className="h-full">
            {children}
          </div>
        </main>
      </div>
      
      {/* Modals / Popovers (simulated simply) */}
      {userMenuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setUserMenuOpen(false); setLangOpen(false); }} />
          <div className="absolute top-16 right-4 w-[280px] bg-popover border border-border shadow-xl rounded-xl z-50 flex flex-col animate-scale-in origin-top-right overflow-hidden">
            {/* Header: avatar + name + email */}
            <div className="px-5 pt-5 pb-4 flex items-center gap-3 border-b border-border">
              <div className="w-11 h-11 rounded-full overflow-hidden bg-brand-gradient text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-sm">
                {user.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" /> : initials(user.name)}
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-foreground truncate">{user.name}</p>
                <p className="text-[12px] text-muted-foreground truncate">{user.email || user.role}</p>
              </div>
            </div>

            {/* Manage Account CTA */}
            <div className="px-4 py-3 border-b border-border">
              <Link
                href="/account"
                onClick={() => setUserMenuOpen(false)}
                className="w-full h-9 rounded-lg border border-primary text-primary text-[13px] font-semibold flex items-center justify-center hover:bg-primary/5 transition-colors"
              >
                {t("menu.manage_account")}
              </Link>
            </div>

            {/* PREFERENCES section */}
            <div className="py-2 border-b border-border">
              <p className="px-4 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("menu.preferences")}</p>
              {/* Presence — current state + toggle switch */}
              <button
                type="button"
                onClick={() => {
                  const next = !online;
                  const updated = { ...user, is_online: next };
                  setUser(updated as any);
                  setSession(getToken()!, updated as any);
                  api.setPresence(next).catch(() => {
                    // revert on failure so the dot never lies about real state
                    setUser(user);
                    setSession(getToken()!, user);
                  });
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted text-left transition-colors"
              >
                <span className="relative flex w-2 h-2 shrink-0">
                  {online && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />}
                  <span className={cn("relative inline-flex w-2 h-2 rounded-full", online ? "bg-emerald-500" : "bg-muted-foreground/50")} />
                </span>
                <span className="flex-1 text-[13px] font-medium text-foreground/85">
                  {online ? t("menu.online") : t("menu.offline")}
                </span>
                <span className={cn("relative w-9 h-5 rounded-full transition-colors shrink-0", online ? "bg-emerald-500" : "bg-muted")}>
                  <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform", online && "translate-x-4")} />
                </span>
              </button>

              {/* Language — inline expand on click */}
              <button
                type="button"
                onClick={() => setLangOpen((v) => !v)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                  langOpen ? "bg-muted/60" : "hover:bg-muted",
                )}
              >
                <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-[13px] font-medium text-foreground/85 flex-1">{t("menu.language")}</span>
                <span className="text-[11px] font-semibold text-muted-foreground">{lang === "id" ? "Indonesia" : "English"}</span>
                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", langOpen && "rotate-180")} />
              </button>
              {langOpen && (
                <div className="animate-fade-in">
                  {[{ code: "en", label: "English" }, { code: "id", label: "Indonesia" }].map((opt) => {
                    const active = lang === opt.code;
                    return (
                      <button
                        key={opt.code}
                        type="button"
                        onClick={() => {
                          setOrgSettings((prev: any) => ({ ...prev, locale: opt.code }));
                          api.updateOrganization({ settings: { ...orgSettingsRef.current, locale: opt.code } }).catch(() => {});
                          setLang(opt.code);
                          setLangOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center py-2 pl-11 pr-4 text-[13px] font-medium text-left transition-colors",
                          active ? "bg-primary/10 text-primary" : "text-foreground/75 hover:bg-muted",
                        )}
                      >
                        {opt.label}
                        {active && <CheckCircle2 className="w-4 h-4 ml-auto" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* GENERAL section */}
            <div className="py-1">
              <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted text-left transition-colors">
                <LogOut className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-[13px] font-medium text-foreground/85">{t("menu.sign_out")}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {notifOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
          <div className="absolute top-16 right-20 w-80 bg-popover border border-border shadow-xl rounded-lg z-50 flex flex-col max-h-[560px] animate-scale-in origin-top-right">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-[15px] text-foreground">Notifications</h3>
              {notifUnread > 0 && (
                <button
                  onClick={() => { api.markNotificationsRead().catch(() => {}); setNotifs((ns) => ns.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))); setNotifUnread(0); }}
                  className="text-xs text-muted-foreground hover:text-foreground font-semibold"
                >Mark all read</button>
              )}
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {notifs.length === 0 ? (
                <div className="p-8 flex flex-col items-center justify-center text-center">
                  <div className="w-11 h-11 rounded-xl bg-muted grid place-items-center mb-2.5">
                    <CheckCircle2 className="w-6 h-6 text-primary/50" />
                  </div>
                  <p className="text-[13px] text-foreground font-semibold">All caught up</p>
                  <p className="text-xs text-muted-foreground">No new notifications</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {notifs.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        if (!n.read_at) { api.markNotificationsRead(n.id).catch(() => {}); setNotifs((ns) => ns.map((x) => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)); setNotifUnread((u) => Math.max(0, u - 1)); }
                        setNotifOpen(false);
                        if (n.conversation_id) { router.push(`/inbox?c=${n.conversation_id}`); window.dispatchEvent(new CustomEvent("inbox:open", { detail: n.conversation_id })); }
                      }}
                      className={cn("w-full text-left p-3 rounded-md hover:bg-muted transition-colors border-l-2", n.read_at ? "border-transparent opacity-70" : "border-primary")}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {!n.read_at && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                        <p className="text-[13px] font-bold text-foreground flex-1 truncate">{n.title}</p>
                        <span className="text-[10px] text-muted-foreground shrink-0">{relAgo(n.created_at)}</span>
                      </div>
                      {n.body && <p className="text-xs text-muted-foreground leading-snug">{n.body}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Global inbound WhatsApp call ringer (rings the assigned agent anywhere) */}
      <IncomingCallListener />

      {/* Cmd/Ctrl-K command palette + "?" shortcuts cheatsheet */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

export default Shell;
