export function initials(name?: string | null): string {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

export function fmtTime(ts?: string | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(ts?: string | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function dateLabel(ts: string): string {
  const d = new Date(ts), today = new Date(), y = new Date();
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function channelColor(ch?: string | null): string {
  switch (ch?.toLowerCase()) {
    case "whatsapp": return "#25D366";
    case "instagram": return "#E1306C";
    case "telegram": return "#0088CC";
    case "messenger": return "#0084FF";
    case "email": return "#EA4335";
    case "webchat": return "#2D8B73";
    default: return "#6B7280";
  }
}

export function interestColor(level?: string | null): string {
  switch (level?.toLowerCase()) {
    case "hot": return "#D32F2F";
    case "warm": return "#ED6C02";
    case "cold": return "#0288D1";
    default: return "#9CA3AF";
  }
}
