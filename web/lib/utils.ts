import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getAvatarColor(identifier: string | null | undefined): string {
  if (!identifier) return "#A0AEC0"; // fallback gray
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Curated list of vibrant colors for avatars (WhatsApp style)
  const colors = [
    "#25D366", "#34B7F1", "#FF7A00", "#E1306C", "#F56040",
    "#833AB4", "#405DE6", "#C13584", "#FD1D1D", "#E50914",
    "#1DA1F2", "#1877F2", "#0A66C2", "#16A34A", "#00AFF0",
    "#2196F3", "#4CAF50", "#FF9800", "#E91E63", "#9C27B0"
  ];
  return colors[Math.abs(hash) % colors.length];
}

export function fmtTime(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function fmtDate(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function dateLabel(dateStr: string | Date | undefined | null): string {
  return fmtDate(dateStr);
}

// Clean, sortable timestamp for CSV/data exports: "2026-06-21 9:03 AM",
// rendered in the given IANA timezone (the workspace tz) so columns aren't UTC.
export function fmtExportTs(dateStr: string | Date | undefined | null, tz?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz || undefined,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
}

// Compact, non-ticking relative time for dense lists (Linear/Superhuman style):
// "now", "5m", "2h", "3d", then a short weekday/date. No seconds jitter.
export function relTime(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  if (diff < 0) return "now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Single source of truth for durations across the whole dashboard (input = minutes).
// "-" empty · "45s" · "12m" · "3h 20m". No more per-section format drift.
export function fmtDuration(min: number | null | undefined): string {
  if (min == null || min <= 0) return "-";
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function initials(name: string | undefined | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function channelColor(channel: string | undefined | null): string {
  if (!channel) return "#9CA3AF";
  const map: Record<string, string> = {
    whatsapp: "#25D366",
    messenger: "#0084FF",
    instagram: "#E1306C",
    telegram: "#229ED9",
    sms: "#6B7280",
    line: "#06C755",
    viber: "#7360F2",
    testing: "#2D8B73"
  };
  return map[channel.toLowerCase()] || "#9CA3AF";
}

export function interestColor(val: string | undefined | null): string {
  if (!val) return "#6B7280";
  const map: Record<string, string> = { hot: "#EF4444", warm: "#F59E0B", cold: "#3B82F6" };
  return map[val.toLowerCase()] || "#6B7280";
}

// Darker channel color for TEXT on a light channel tint (the avatar pattern).
// The bright channelColor on its own 10% tint fails AA (e.g. WhatsApp green ~1.7);
// these dark variants clear 4.5:1 while keeping the channel identity.
export function channelTextColor(channel: string | undefined | null): string {
  if (!channel) return "#475569";
  const map: Record<string, string> = {
    whatsapp: "#0A6E40", messenger: "#0064D1", instagram: "#B01D5E",
    telegram: "#1675A3", sms: "#475569", line: "#04792F",
    viber: "#5A3FC0", testing: "#1F6B58",
  };
  return map[channel.toLowerCase()] || "#475569";
}

// Proper display casing for channel keys ("whatsapp" -> "WhatsApp"). CSS
// `capitalize` only fixes the first letter, so it produces "Whatsapp".
export function channelLabel(channel: string | undefined | null): string {
  if (!channel) return "Direct";
  const map: Record<string, string> = {
    whatsapp: "WhatsApp", messenger: "Messenger", instagram: "Instagram",
    telegram: "Telegram", facebook: "Facebook", sms: "SMS", line: "LINE",
    viber: "Viber", email: "Email", webchat: "Web chat", testing: "Testing",
  };
  const k = channel.toLowerCase();
  return map[k] || (channel.charAt(0).toUpperCase() + channel.slice(1));
}
