"use client";
import { Box } from "@mui/material";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import FacebookIcon from "@mui/icons-material/Facebook";
import InstagramIcon from "@mui/icons-material/Instagram";
import TelegramIcon from "@mui/icons-material/Telegram";
import SmsIcon from "@mui/icons-material/Sms";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import ScienceRoundedIcon from "@mui/icons-material/ScienceRounded";
import type { SvgIconComponent } from "@mui/icons-material";

// Brand metadata for every channel platform the dashboard knows about.
// `available: false` => surfaced in the catalog but rendered as "Coming soon".
export type ChannelMeta = {
  type: string;
  name: string;
  color: string;        // brand color (icon tile + accents)
  gradient?: string;    // optional brand gradient (Instagram)
  icon: SvgIconComponent;
  blurb: string;        // one-line description in the catalog row
  description: string;  // detail-panel paragraph
  available: boolean;
};

export const CHANNEL_CATALOG: ChannelMeta[] = [
  {
    type: "testing", name: "Testing channel", color: "#2D8B73", icon: ScienceRoundedIcon,
    blurb: "Simulated sandbox",
    description: "Experiment with Simpulx features in a safe space. Actions here are simulated and won't reach real customers.",
    available: true,
  },
  {
    type: "whatsapp", name: "WhatsApp Business API", color: "#25D366", icon: WhatsAppIcon,
    blurb: "Official Cloud API",
    description: "Connect a WhatsApp Business number via the Meta Cloud API to send and receive messages, run broadcasts, and use templates.",
    available: true,
  },
  {
    type: "messenger", name: "Facebook Messenger", color: "#0084FF", icon: FacebookIcon,
    blurb: "Facebook Pages",
    description: "Reply to Messenger conversations from your Facebook Pages directly inside the shared inbox.",
    available: true,
  },
  {
    type: "instagram", name: "Instagram", color: "#E1306C",
    gradient: "linear-gradient(45deg,#F58529,#DD2A7B 45%,#8134AF 75%,#515BD4)",
    icon: InstagramIcon,
    blurb: "Direct messages",
    description: "Handle Instagram DMs and story replies from business accounts linked to your connected Facebook Pages.",
    available: true,
  },
  {
    type: "telegram", name: "Telegram", color: "#229ED9", icon: TelegramIcon,
    blurb: "Bot API",
    description: "Connect a Telegram bot to chat with customers on Telegram.",
    available: false,
  },
  {
    type: "sms", name: "SMS", color: "#6B7280", icon: SmsIcon,
    blurb: "Text messaging",
    description: "Send and receive SMS through a connected telephony provider.",
    available: false,
  },
  {
    type: "line", name: "LINE", color: "#06C755", icon: ForumRoundedIcon,
    blurb: "LINE Official Account",
    description: "Connect a LINE Official Account to message customers on LINE.",
    available: false,
  },
  {
    type: "viber", name: "Viber", color: "#7360F2", icon: ForumRoundedIcon,
    blurb: "Business messages",
    description: "Reach customers on Viber with a connected business account.",
    available: false,
  },
];

export function channelMeta(type: string): ChannelMeta {
  return CHANNEL_CATALOG.find((c) => c.type === type)
    ?? { type, name: type, color: "#6B7280", icon: ForumRoundedIcon, blurb: "", description: "", available: false };
}

export default function ChannelIcon({ type, size = 40, radius = 11 }: { type: string; size?: number; radius?: number }) {
  const m = channelMeta(type);
  const Icon = m.icon;
  return (
    <Box
      sx={{
        width: size, height: size, borderRadius: `${radius}px`,
        display: "grid", placeItems: "center", flexShrink: 0,
        background: m.gradient ?? m.color,
        color: "#fff",
      }}
    >
      <Icon sx={{ fontSize: size * 0.55 }} />
    </Box>
  );
}
