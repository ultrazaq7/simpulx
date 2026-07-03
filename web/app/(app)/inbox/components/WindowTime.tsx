"use client";
import { cn } from "@/lib/utils";

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
