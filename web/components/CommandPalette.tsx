"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, LayoutDashboard, MessageCircle, Users, Megaphone, Settings, CornerDownLeft, ArrowUp, ArrowDown,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, initials, channelColor, channelTextColor } from "@/lib/utils";
import type { Conversation } from "@/lib/types";

interface CmdItem {
  id: string;
  group: string;
  label: string;
  sub?: string;
  icon?: any;
  avatar?: { text: string; color: string; textColor: string };
  run: () => void;
}

// A Linear/Superhuman-style command palette: Cmd/Ctrl-K to jump to any
// conversation or navigate the app, fully keyboard-driven.
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(""); setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    api.listConversations("")
      .then((c: any) => setConvs(Array.isArray(c) ? c : (c?.data || [])))
      .catch(() => {});
    return () => clearTimeout(t);
  }, [open]);

  const NAV: CmdItem[] = useMemo(() => [
    { id: "nav-dashboard", group: "Go to", label: "Dashboard", icon: LayoutDashboard, run: () => router.push("/dashboard") },
    { id: "nav-inbox", group: "Go to", label: "Inbox", icon: MessageCircle, run: () => router.push("/inbox") },
    { id: "nav-contacts", group: "Go to", label: "Contacts", icon: Users, run: () => router.push("/contacts") },
    { id: "nav-broadcasts", group: "Go to", label: "Broadcasts", icon: Megaphone, run: () => router.push("/broadcasts") },
    { id: "nav-settings", group: "Go to", label: "Settings", icon: Settings, run: () => router.push("/settings") },
  ], [router]);

  const items: CmdItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const nav = NAV.filter((n) => !q || n.label.toLowerCase().includes(q));
    const matched = (q
      ? convs.filter((c) => (c.contact_name || "").toLowerCase().includes(q) || (c.contact_phone || "").includes(q))
      : convs
    ).slice(0, 8);
    const convItems: CmdItem[] = matched.map((c) => ({
      id: "conv-" + c.id,
      group: "Conversations",
      label: c.contact_name || c.contact_phone || "Unknown",
      sub: c.last_message_preview || c.contact_phone || undefined,
      avatar: { text: initials(c.contact_name || c.contact_phone), color: channelColor(c.channel), textColor: channelTextColor(c.channel) },
      run: () => {
        router.push(`/inbox?c=${c.id}`);
        window.dispatchEvent(new CustomEvent("inbox:open", { detail: c.id }));
      },
    }));
    return [...nav, ...convItems];
  }, [query, convs, NAV, router]);

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); const it = items[active]; if (it) { it.run(); onClose(); } }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, active, onClose]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  // Group while keeping a flat running index for keyboard selection.
  let idx = -1;
  const groups: { name: string; rows: { it: CmdItem; i: number }[] }[] = [];
  for (const it of items) {
    idx++;
    let g = groups.find((x) => x.name === it.group);
    if (!g) { g = { name: it.group, rows: [] }; groups.push(g); }
    g.rows.push({ it, i: idx });
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[14vh] px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px] animate-fade-in" />
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="relative w-full max-w-[600px] bg-card rounded-xl border border-border shadow-2xl overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border">
          <Search className="w-[18px] h-[18px] text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            aria-label="Search conversations or jump to a section"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations or jump to..."
            className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/70 outline-none border-0"
          />
          <kbd className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No results for &ldquo;{query}&rdquo;</div>
          ) : groups.map((g) => (
            <div key={g.name} className="mb-1">
              <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{g.name}</p>
              {g.rows.map(({ it, i }) => (
                <button
                  key={it.id}
                  data-idx={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => { it.run(); onClose(); }}
                  className={cn("w-full flex items-center gap-3 px-4 py-2 text-left outline-none", i === active && "bg-primary/[0.08]")}
                >
                  {it.avatar ? (
                    <span className="w-7 h-7 rounded-full grid place-items-center text-[10px] font-bold shrink-0" style={{ backgroundColor: it.avatar.color + "1A", color: it.avatar.textColor }}>{it.avatar.text}</span>
                  ) : it.icon ? (
                    <span className={cn("w-7 h-7 grid place-items-center shrink-0", i === active ? "text-primary" : "text-muted-foreground")}><it.icon className="w-[18px] h-[18px]" /></span>
                  ) : null}
                  <span className="flex-1 min-w-0">
                    <span className={cn("block text-[13.5px] truncate", i === active ? "text-foreground font-semibold" : "text-foreground/90 font-medium")}>{it.label}</span>
                    {it.sub && <span className="block text-[11.5px] text-muted-foreground truncate">{it.sub}</span>}
                  </span>
                  {i === active && <CornerDownLeft className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 px-4 h-9 border-t border-border text-[11px] text-muted-foreground bg-muted/30">
          <span className="flex items-center gap-1"><ArrowUp className="w-3 h-3" /><ArrowDown className="w-3 h-3" />navigate</span>
          <span className="flex items-center gap-1"><CornerDownLeft className="w-3 h-3" />open</span>
          <span className="ml-auto font-semibold">Cmd K</span>
        </div>
      </div>
    </div>
  );
}
