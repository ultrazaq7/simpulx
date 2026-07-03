"use client";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn, windowState } from "@/lib/utils";

// Chat-list date cell: always shows the static MM/dd/yyyy date.
// The live countdown lives in WindowCountdownBadge (corner of the tile).
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

// Corner badge: live per-second countdown of the 24h session window as a
// solid blue pill ("Xh Ym Zs" + clock icon). Self-gating: renders nothing
// once the window elapses, and stops its own ticker.
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
      "inline-flex items-center gap-1 h-[18px] px-2 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold tabular-nums leading-none",
      className,
    )}>
      <Clock className="w-3 h-3 shrink-0" />
      {st.text}
    </span>
  );
}
