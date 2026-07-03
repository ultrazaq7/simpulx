"use client";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { windowState, cn } from "@/lib/utils";

// Chat-list time cell: a live per-second countdown of the 24h session window,
// then the absolute international timestamp (MM/DD/YYYY HH:MM:SS) once elapsed.
// Ticks only while the window is open; a closed window is a static label.
export function WindowTime({ lastMessageAt, unread }: { lastMessageAt: string | null; unread?: boolean }) {
  const [, force] = useState(0);
  const st = windowState(lastMessageAt);
  useEffect(() => {
    if (!st.open) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [st.open, lastMessageAt]);

  if (!lastMessageAt || !st.text) return null;
  if (st.open) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums bg-primary/10 text-primary-text">
        <Clock className="w-2.5 h-2.5" />{st.text}
      </span>
    );
  }
  return (
    <span className={cn("shrink-0 text-[10.5px] tabular-nums", unread ? "text-primary-text font-semibold" : "text-muted-foreground")}>
      {st.text}
    </span>
  );
}
