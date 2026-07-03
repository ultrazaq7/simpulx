"use client";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn, windowState } from "@/lib/utils";

// Chat-list date cell: the static MM/dd/yyyy date. Shown in the line-1 slot
// once the 24h session window has elapsed (the countdown pill takes this slot
// while the window is still open).
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

// Live per-second countdown of the 24h session window as a rounded brand pill
// ("Xh Ym Zs" with a clock chip), occupying the same line-1 slot the date uses
// once elapsed. Self-gating: renders null and stops its ticker at expiry.
export function WindowCountdownBadge({ lastMessageAt, className }: { lastMessageAt: string | null; className?: string }) {
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
  return (
    <span className={cn(
      "shrink-0 inline-flex items-center gap-1 h-[20px] pl-1 pr-2.5 rounded-full bg-primary text-primary-foreground text-[10.5px] font-semibold tabular-nums leading-none",
      className,
    )}>
      <span className="grid place-items-center w-[15px] h-[15px] rounded-full bg-white/25">
        <Clock className="w-2.5 h-2.5" />
      </span>
      {st.text}
    </span>
  );
}
