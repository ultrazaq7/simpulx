"use client";
import { MessageCircle, Facebook, Instagram, Send, MessageSquare, TestTube } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Brand metadata for every channel platform the dashboard knows about.
// `available: false` => surfaced in the catalog but rendered as "Coming soon".
export type ChannelMeta = {
  type: string;
  name: string;
  color: string;        // brand color (icon tile + accents)
  gradient?: string;    // optional brand gradient (Instagram)
  icon: LucideIcon;
  blurb: string;        // one-line description in the catalog row
  description: string;  // detail-panel paragraph
  available: boolean;
};

export const CHANNEL_CATALOG: ChannelMeta[] = [
  {
    type: "testing", name: "Testing channel", color: "#2D8B73", icon: TestTube,
    blurb: "Simulated sandbox",
    description: "Experiment with Simpulx features in a safe space. Actions here are simulated and won't reach real customers.",
    available: true,
  },
  {
    type: "whatsapp", name: "WhatsApp Business API", color: "#25D366", icon: MessageCircle,
    blurb: "Official Cloud API",
    description: "Connect a WhatsApp Business number via the Meta Cloud API to send and receive messages, run broadcasts, and use templates.",
    available: true,
  },
  {
    type: "messenger", name: "Facebook Messenger", color: "#0084FF", icon: Facebook,
    blurb: "Facebook Pages",
    description: "Reply to Messenger conversations from your Facebook Pages directly inside the shared inbox.",
    available: true,
  },
  {
    type: "instagram", name: "Instagram", color: "#E1306C",
    gradient: "linear-gradient(45deg,#F58529,#DD2A7B 45%,#8134AF 75%,#515BD4)",
    icon: Instagram,
    blurb: "Direct messages",
    description: "Handle Instagram DMs and story replies from business accounts linked to your connected Facebook Pages.",
    available: true,
  },
  {
    type: "telegram", name: "Telegram", color: "#229ED9", icon: Send,
    blurb: "Bot API",
    description: "Connect a Telegram bot to chat with customers on Telegram.",
    available: false,
  },
  {
    type: "sms", name: "SMS", color: "#6B7280", icon: MessageSquare,
    blurb: "Text messaging",
    description: "Send and receive SMS through a connected telephony provider.",
    available: false,
  },
  {
    type: "line", name: "LINE", color: "#06C755", icon: MessageCircle,
    blurb: "LINE Official Account",
    description: "Connect a LINE Official Account to message customers on LINE.",
    available: false,
  },
  {
    type: "viber", name: "Viber", color: "#7360F2", icon: MessageCircle,
    blurb: "Business messages",
    description: "Reach customers on Viber with a connected business account.",
    available: false,
  },
];

export function channelMeta(type: string): ChannelMeta {
  return CHANNEL_CATALOG.find((c) => c.type === type)
    ?? { type, name: type, color: "#6B7280", icon: MessageCircle, blurb: "", description: "", available: false };
}

export default function ChannelIcon({ type, size = 40, radius = 11 }: { type: string; size?: number; radius?: number }) {
  const m = channelMeta(type);
  const Icon = m.icon;
  return (
    <div
      style={{
        width: size, height: size, borderRadius: `${radius}px`,
        background: m.gradient ?? m.color,
      }}
      className="flex items-center justify-center shrink-0 text-white shadow-sm"
    >
      <Icon style={{ width: size * 0.55, height: size * 0.55 }} />
    </div>
  );
}
