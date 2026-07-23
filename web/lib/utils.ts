import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import enLocale from "@/locales/en.json"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type StageLike = { name: string; system_key?: string | null };

// Localize a pipeline stage name (bilingual). A system stage (has system_key)
// that still holds its canonical English default is translated via
// t("stages.<key>"); a custom stage or a renamed system stage keeps its stored
// name. This lets default stages follow the language toggle while a dealer's own
// rename shows exactly as typed.
export function stageLabel(t: (k: string) => string, stage: StageLike | null | undefined): string {
  if (!stage) return "";
  const sk = stage.system_key;
  const enStages = (enLocale as { stages?: Record<string, string> }).stages;
  if (sk && enStages && enStages[sk] && stage.name === enStages[sk]) {
    const key = `stages.${sk}`;
    const tr = t(key);
    return tr === key ? stage.name : tr;
  }
  return stage.name;
}

// Same, when a call site only has the stage NAME (resolves system_key from the
// loaded stages list).
export function stageLabelByName(
  t: (k: string) => string,
  stages: StageLike[] | undefined | null,
  name: string | null | undefined,
): string {
  if (!name) return "";
  const st = stages?.find((s) => s.name === name);
  return st ? stageLabel(t, st) : name;
}

// Org-wide date format (set in Settings > General). Cached in localStorage so the
// pure formatters below can read it without a React context. Shell writes it on
// org load; the General page writes it on save so it applies immediately.
export function getDateFormat(): string {
  try { return (typeof localStorage !== "undefined" && localStorage.getItem("simpulx_date_format")) || "MM/DD/YYYY"; }
  catch { return "MM/DD/YYYY"; }
}
// Arrange a date's numeric parts per the org format: MM/DD/YYYY | DD/MM/YYYY | YYYY/MM/DD.
export function datePart(d: Date, fmt = getDateFormat()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const mm = p(d.getMonth() + 1), dd = p(d.getDate()), yyyy = d.getFullYear();
  if (fmt === "DD/MM/YYYY") return `${dd}/${mm}/${yyyy}`;
  if (fmt === "YYYY/MM/DD") return `${yyyy}/${mm}/${dd}`;
  return `${mm}/${dd}/${yyyy}`;
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

// Human, sortable-ish absolute timestamp: "22 Jun 2026 01:28" (24h, local).
// Used for created/updated/last-message columns across contacts + details.
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDateTimeShort(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${datePart(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
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

// International-standard absolute timestamp: MM/DD/YYYY HH:MM:SS (24h clock,
// local time). The single format used app-wide once a relative window elapses.
export function fmtDateTime(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${datePart(d)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// WhatsApp 24h session window derived from a conversation's last message time.
// While open -> the elapsed time since that message, counting UP from 0
// ("Xh Ym Zs"); once 24h passes -> the absolute date (window closed).
// Pure/stateless; the ticking is done by the caller.
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
export function windowState(dateStr: string | Date | undefined | null): { open: boolean; text: string } {
  if (!dateStr) return { open: false, text: "" };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { open: false, text: "" };
  let elapsed = Date.now() - d.getTime();
  if (elapsed < 0) elapsed = 0;
  if (elapsed >= SESSION_WINDOW_MS) {
    const p = (n: number) => String(n).padStart(2, "0");
    return { open: false, text: `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}` };
  }
  const h = Math.floor(elapsed / 3600000);
  const m = Math.floor((elapsed % 3600000) / 60000);
  const s = Math.floor((elapsed % 60000) / 1000);
  return { open: true, text: `${h}h ${m}m ${s}s` };
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

// Deterministic, WhatsApp-style avatar colour from a name/seed.
const AVATAR_PALETTE = [
  "#1B5E20", "#0D47A1", "#4A148C", "#BF360C", "#006064",
  "#880E4F", "#33691E", "#1A237E", "#3E2723", "#004D40",
];
export function avatarColor(seed: string | undefined | null): string {
  const s = (seed || "").trim();
  if (!s) return AVATAR_PALETTE[0];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
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

// Lead heat (temperature) · its own semantic axis, kept in sync with the --hot /
// --warm / --cold design tokens. Distinct from brand (petrol) and pipeline stage.
export function interestColor(val: string | undefined | null): string {
  if (!val) return "#64748B";
  const map: Record<string, string> = { hot: "#C4362B", warm: "#C0791A", cold: "#45657E" };
  return map[val.toLowerCase()] || "#64748B";
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

// Pick a readable text color (white ink or dark ink) for text placed ON a solid
// hex background. Uses WCAG relative luminance so labels stay legible on every
// step of a sequential ramp (fixes white-on-light-fill in funnel/gradient bars).
export function readableTextOn(hex: string): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // Contrast vs white is (1.05)/(L+0.05); use dark ink once white drops below ~4.5:1.
  return (1.05 / (L + 0.05)) >= 4.5 ? "#FFFFFF" : "#0C1614";
}

// Lead-score tier color (0-100): high=petrol green, mid=amber, low=slate. Shared
// by the contacts table and the inbox card so the same score reads identically.
export function scoreColor(n: number): string {
  return n >= 70 ? "#0E5B54" : n >= 40 ? "#C0791A" : "#64748B";
}
