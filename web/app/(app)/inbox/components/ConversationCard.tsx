"use client";
import { memo } from "react";
import {
  Image as ImageIcon, Video, FileText, Headset, Zap, Clock, Phone, Sticker, Mic, User,
  Flame, Thermometer, Snowflake,
} from "lucide-react";
import { initials, channelColor, channelTextColor, relTime, cn } from "@/lib/utils";
import { channelMeta } from "@/components/ChannelIcon";
import { Tip } from "@/components/ui/tooltip";
import type { Conversation, Message } from "@/lib/types";

interface ConversationCardProps {
  conv: Conversation;
  isActive: boolean;
  onClick: () => void;
  onCopy: (text: string) => void;
  messages?: Message[]; // only for active conv to determine last responder
  showAgent?: boolean;  // manager/admin: show the assigned agent
  channelName?: string; // display name of the channel (e.g. "Simpulx Test Channel")
}

const PREVIEW_MEDIA: Record<string, { icon: any; label: string }> = {
  "[image]": { icon: ImageIcon, label: "Photo" },
  "[video]": { icon: Video, label: "Video" },
  "[document]": { icon: FileText, label: "Document" },
  "[sticker]": { icon: Sticker, label: "Sticker" },
  "[audio]": { icon: Mic, label: "Voice message" },
};

// Interest level → styled pill badge (solid deep colors)
const INTEREST_BADGE: Record<string, { label: string; icon: any; bg: string; text: string }> = {
  hot:  { label: "Hot",  icon: Flame,       bg: "bg-hot",    text: "text-white" },
  warm: { label: "Warm", icon: Thermometer, bg: "bg-amber-500", text: "text-white" },
  cold: { label: "Cold", icon: Snowflake,   bg: "bg-cold",   text: "text-white" },
};

const ConversationCard = memo(function ConversationCard({
  conv: c, isActive, onClick, messages, showAgent, channelName,
}: ConversationCardProps) {
  const agentReplied = (() => {
    if (isActive && messages && messages.length > 0) {
      return messages[messages.length - 1].direction !== "inbound";
    }
    return c.unread_count === 0 && c.last_message_direction === "agent";
  })();

  const unread = c.unread_count > 0;
  const time = relTime(c.last_message_at);

  const needsFollowUp = (c.interest_level === "hot" || c.interest_level === "warm") && unread;
  const needsCall = c.interest_level === "hot" && (c.call_attempts === null || c.call_attempts === 0);
  const windowExpired = (() => {
    if (!c.last_message_at || c.channel !== "whatsapp") return false;
    return Date.now() - new Date(c.last_message_at).getTime() > 24 * 60 * 60 * 1000;
  })();

  const interest = c.interest_level && INTEREST_BADGE[c.interest_level] ? INTEREST_BADGE[c.interest_level] : null;

  const media = c.last_message_preview ? PREVIEW_MEDIA[c.last_message_preview] : undefined;
  const previewFull = media ? media.label : (c.last_message_preview || "No messages yet");
  const cc = channelColor(c.channel);
  const cm = channelMeta(c.channel);
  const ChannelSvg = cm.icon;
  const hasMeta = !!c.campaign_name || (showAgent && !!c.agent_name) || !!interest;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex gap-3.5 pl-4 pr-3 py-4 cursor-pointer border-b border-border/40 transition-colors duration-100",
        isActive ? "bg-primary/[0.06]" : "hover:bg-muted/40",
      )}
    >

      {/* Avatar (darkened channel color) + channel icon badge */}
      <div className="relative shrink-0 self-start mt-0.5">
        <div
          className="w-11 h-11 rounded-full grid place-items-center text-[15px] font-bold shadow-sm relative overflow-hidden"
          style={{ backgroundColor: cc, color: "#ffffff" }}
        >
          <div className="absolute inset-0 bg-black/20 pointer-events-none" />
          <span className="relative z-10">{initials(c.contact_name || c.contact_phone)}</span>
        </div>
        {/* Channel icon badge at bottom-right with Tooltip */}
        <Tip label={channelName || c.channel} side="top">
          <span
            className="absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full ring-[2.5px] ring-card grid place-items-center cursor-default"
            style={{ background: cm.gradient ?? cm.color }}
          >
            <ChannelSvg className="w-[10px] h-[10px] text-white" />
          </span>
        </Tip>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        {/* Line 1: name + urgent signals + time */}
        <div className="flex items-center gap-2">
          <p className={cn(
            "flex-1 truncate text-[14.5px] leading-snug",
            unread ? "font-semibold text-foreground" : "font-medium text-foreground/90",
          )}>
            {c.contact_name || c.contact_phone || "Unknown"}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {needsCall ? (
              <Tip label="Call this hot lead" side="top"><Phone className="w-3.5 h-3.5 text-info" /></Tip>
            ) : needsFollowUp ? (
              <Tip label="Follow up now" side="top"><Zap className="w-3.5 h-3.5 text-warm" /></Tip>
            ) : windowExpired ? (
              <Tip label="24h window closed" side="top"><Clock className="w-3.5 h-3.5 text-hot" /></Tip>
            ) : null}
            {time && (
              <span className={cn(
                "text-[11px] tabular-nums",
                unread ? "text-primary-text font-semibold" : "text-muted-foreground",
              )}>
                {time}
              </span>
            )}
          </div>
        </div>

        {/* Line 2: preview (full text on hover) + unread count */}
        <div className="flex items-center gap-1.5 mt-2">
          <Tip label={<span className="block max-w-[300px] whitespace-pre-wrap leading-snug text-left text-[12px]">{previewFull}</span>} side="bottom" align="start">
            <span className={cn(
              "flex-1 min-w-0 truncate text-[12px] leading-snug",
              unread ? "text-foreground/85" : "text-muted-foreground",
            )}>
              {agentReplied && !unread && <Headset className="inline-block w-3 h-3 mr-1 -mt-0.5 text-primary/60 align-middle" />}
              {media ? (
                <span className="inline-flex items-center gap-1 align-middle"><media.icon className="w-3.5 h-3.5 shrink-0" />{media.label}</span>
              ) : (
                c.last_message_preview || <span className="italic text-muted-foreground/60">No messages yet</span>
              )}
            </span>
          </Tip>
          {unread && (
            <span className="shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold grid place-items-center tabular-nums animate-unread ml-1">
              {c.unread_count > 99 ? "99+" : c.unread_count}
            </span>
          )}
        </div>

        {/* Line 3: interest badge + agent + campaign */}
        {hasMeta && (
          <div className="flex items-center gap-1.5 min-w-0 mt-2.5">
            {interest && (
              <span className={cn(
                "inline-flex items-center gap-1 h-[20px] px-2 rounded-full text-[11px] font-semibold shrink-0",
                interest.bg, interest.text,
              )}>
                <interest.icon className="w-3 h-3" />
                {interest.label}
              </span>
            )}
            {showAgent && c.agent_name && (
              <Tip label={`Assigned: ${c.agent_name}`} side="top">
                <span className="inline-flex items-center gap-1 h-[20px] px-2.5 rounded-full bg-foreground/90 text-background text-[11px] font-semibold min-w-0 max-w-[55%] shadow-sm">
                  <User className="w-3 h-3 shrink-0 opacity-80" />
                  <span className="truncate">{c.agent_name}</span>
                </span>
              </Tip>
            )}
            {c.campaign_name && (
              <Tip label={c.campaign_name} side="top">
                <span className="inline-flex items-center h-[20px] px-2.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold min-w-0 ml-auto max-w-[58%] shadow-sm">
                  <span className="truncate">{c.campaign_name}</span>
                </span>
              </Tip>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default ConversationCard;
