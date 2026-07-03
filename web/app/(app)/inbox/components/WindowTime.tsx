"use client";
import { useEffect, useState } from "react";
import { Bot, Headset } from "lucide-react";
import { cn, windowState } from "@/lib/utils";

// Chat-list date cell: always shows the static MM/dd/yyyy date.
export function WindowTime({ lastMessageAt, unread }: { lastMessageAt: string | null; unread?: boolean }) {
  if (!lastMessageAt) return null;
  const d = new Date(lastMessageAt);
  if (isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  const text = `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
  return (
    <span className={cn("shrink-0 text-[10.5px] tabular-nums", unread ? "text-primary-text font-semibold" : "text-muted-foreground")}>
      {text}
    </span>
  );
}

// Live per-second countdown of the 24h session window as a rounded brand badge
export function WindowCountdownBadge({ lastMessageAt, responder, className }: {
  lastMessageAt: string | null;
  responder?: "human" | "bot" | null;
  className?: string;
}) {
  const [st, setSt] = useState(() => windowState(lastMessageAt));
  
  useEffect(() => {
    const first = windowState(lastMessageAt);
    setSt(first);
    if (!first.open) return;
    const t = setInterval(() => {
      const s = windowState(lastMessageAt);
      setSt(s);
      if (!s.open) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [lastMessageAt]);
  
  if (!st.open) return null;
  
  const Icon = responder === "bot" ? Bot : responder === "human" ? Headset : null;
  
  return (
    <span className={cn(
      "shrink-0 inline-flex items-center gap-1.5 h-[21px] pl-1.5 pr-2.5 -mr-3 rounded-l-lg rounded-r-none bg-primary text-primary-foreground text-[10.5px] font-semibold tabular-nums leading-none",
      className,
    )}>
      {Icon && (
        <span className="grid place-items-center w-[15px] h-[15px] rounded-full bg-white/25">
          <Icon className="w-2.5 h-2.5" />
        </span>
      )}
      {st.text}
    </span>
  );
}
