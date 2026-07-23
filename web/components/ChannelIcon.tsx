"use client";
import { MessageCircle, Send, MessageSquare, FlaskConical } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Brand icons removed from lucide-react v1.x · lightweight inline replacements.
const Facebook: LucideIcon = Object.assign(
  ({ className, style, ...props }: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} {...props}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
    </svg>
  ),
  { displayName: "Facebook" }
) as unknown as LucideIcon;

// WhatsApp's own mark rather than a generic bubble, so a WhatsApp lead is
// recognisable at a glance (matches the mobile app). Filled path, not stroked.
const WhatsApp: LucideIcon = Object.assign(
  ({ className, style, ...props }: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className={className} style={style} {...props}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  ),
  { displayName: "WhatsApp" }
) as unknown as LucideIcon;

const Telegram: LucideIcon = Object.assign(
  ({ className, style, ...props }: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className={className} style={style} {...props}>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  ),
  { displayName: "Telegram" }
) as unknown as LucideIcon;

const Instagram: LucideIcon = Object.assign(
  ({ className, style, ...props }: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} {...props}>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
    </svg>
  ),
  { displayName: "Instagram" }
) as unknown as LucideIcon;

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
    type: "testing", name: "Testing channel", color: "#2D8B73", icon: FlaskConical,
    blurb: "Simulated sandbox",
    description: "Experiment with Simpulx features in a safe space. Actions here are simulated and won't reach real customers.",
    available: true,
  },
  {
    type: "whatsapp", name: "WhatsApp Business API", color: "#25D366", icon: WhatsApp,
    blurb: "Official Cloud API",
    description: "Connect a WhatsApp Business number via the Meta Cloud API to send and receive messages, run broadcasts, and use templates.",
    available: true,
  },
  {
    type: "messenger", name: "Facebook Messenger", color: "#0084FF", icon: Facebook,
    blurb: "Facebook Pages",
    description: "Reply to Messenger conversations from your Facebook Pages directly inside the shared Chat.",
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
    type: "telegram", name: "Telegram", color: "#229ED9", icon: Telegram,
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
    blurb: "Public Account",
    description: "Connect a Viber Public Account with its auth token to receive and reply to Viber messages in the shared Chat.",
    available: true,
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
