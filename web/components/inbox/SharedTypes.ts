"use client";
import type { Message, InternalNote } from "@/lib/types";

export type TimelineItem =
  | { kind: "date"; key: string; label: string }
  | { kind: "msg"; key: string; m: Message }
  | { kind: "note"; key: string; n: InternalNote };

export function formatCountdown(isoDate: string): string {
  if (!isoDate) return "";
  const diff = Date.now() - new Date(isoDate).getTime();
  if (diff < 0) return "just now";
  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ${hrs % 24}h ${mins % 60}m`;
  if (hrs > 0) return `${hrs}h ${mins % 60}m ${secs % 60}s`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

export function getMediaUrl(m: Message) {
  let url = m.media_url || "";
  if (typeof window !== "undefined" && window.location.hostname === "localhost" && url.includes("ngrok-free.dev")) {
    url = url.replace(/https?:\/\/[^\/]+/, "http://localhost:8080");
  }
  return url;
}
