"use client";
import { memo } from "react";
import {
  Image as ImageIcon, Video, FileText, Headset, Zap, Clock, Phone, Sticker, Mic,
} from "lucide-react";
import { initials, channelColor, relTime, cn } from "@/lib/utils";
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
  dense?: boolean;      // compact density mode (tighter rows)
}

const PREVIEW_MEDIA: Record<string, { icon: any; label: string }> = {
  "[image]": { icon: ImageIcon, label: "Photo" },
  "[video]": { icon: Video, label: "Video" },
  "[document]": { icon: FileText, label: "Document" },
  "[sticker]": { icon: Sticker, label: "Sticker" },
  "[audio]": { icon: Mic, label: "Voice message" },
};

// Lead temperature -> a real semantic dot (never brand green).
const TEMP_DOT: Record<string, string> = { hot: "bg-hot", warm: "bg-warm", cold: "bg-cold" };
const TEMP_LABEL: Record<string, string> = { hot: "Hot lead", warm: "Warm lead", cold: "Cold lead" };

const ConversationCard = memo(function ConversationCard({
  conv: c, isActive, onClick, messages, showAgent, channelName, dense,
}: ConversationCardProps) {
  // Last responder: agent reply vs awaiting us
  const agentReplied = (() => {
    if (isActive && messages && messages.length > 0) {
      return messages[messages.length - 1].direction !== "inbound";
    }
    return c.unread_count === 0 && c.last_message_direction === "agent";
  })();

  const unread = c.unread_count > 0;
  const time = relTime(c.last_message_at);

  // Hot/Warm + unread -> nudge to follow up now (BR-28: lead_score stays hidden)
  const needsFollowUp = (c.interest_level === "hot" || c.interest_level === "warm") && unread;
  // Hot + never called -> nudge to call (BR-30)
  const needsCall = c.interest_level === "hot" && (c.call_attempts === null || c.call_attempts === 0);
  // WhatsApp 24h service window closed
  const windowExpired = (() => {
    if (!c.last_message_at || c.channel !== "whatsapp") return false;
    return Date.now() - new Date(c.last_message_at).getTime() > 24 * 60 * 60 * 1000;
  })();

  // One left accent, by priority: unread > call > follow-up. Active is bg only.
  const accent = unread ? "bg-primary" : needsCall ? "bg-info" : needsFollowUp ? "bg-warm" : "";
  const temp = c.interest_level && TEMP_DOT[c.interest_level] ? c.interest_level : null;

  const media = c.last_message_preview ? PREVIEW_MEDIA[c.last_message_preview] : undefined;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex gap-2.5 pl-3.5 pr-3 cursor-pointer border-b border-border/60 transition-colors duration-100",
        dense ? "py-1.5" : "py-2.5",
        isActive ? "bg-primary/[0.07]" : "hover:bg-muted/50",
      )}
    >
      {accent && <span aria-hidden className={cn("absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full", accent)} />}

      {/* Avatar + channel dot */}
      <div className="relative shrink-0 self-center">
        <div
          className="w-9 h-9 rounded-full grid place-items-center text-[12px] font-bold ring-1 ring-inset ring-black/5"
          style={{ backgroundColor: channelColor(c.channel) + "1A", color: channelColor(c.channel) }}
        >
          {initials(c.contact_name || c.contact_phone)}
        </div>
        <Tip label={channelName || c.channel} side="top">
          <span
            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-card"
            style={{ backgroundColor: channelColor(c.channel) }}
          />
        </Tip>
      </div>

      <div className="flex-1 min-w-0">
        {/* Line 1: temperature dot + name + (manager agent) + time */}
        <div className="flex items-center gap-1.5">
          {temp && (
            <Tip label={TEMP_LABEL[temp]} side="top">
              <span className={cn("shrink-0 w-2 h-2 rounded-full", TEMP_DOT[temp])} />
            </Tip>
          )}
          <p className={cn(
            "flex-1 truncate text-[14px] leading-tight",
            unread ? "font-bold text-foreground" : "font-semibold text-foreground/90",
          )}>
            {c.contact_name || c.contact_phone || "Unknown"}
          </p>
          {showAgent && c.agent_name && (
            <Tip label={`Assigned: ${c.agent_name}`} side="top">
              <span className="shrink-0 w-[18px] h-[18px] rounded-full bg-muted text-muted-foreground text-[9px] font-bold grid place-items-center ring-1 ring-inset ring-black/5">
                {initials(c.agent_name)}
              </span>
            </Tip>
          )}
          {time && (
            <span className={cn(
              "shrink-0 flex items-center gap-1 text-[11px] tabular-nums",
              unread ? "text-primary-text font-bold" : "text-muted-foreground font-medium",
            )}>
              {agentReplied && !unread && <Headset className="w-3 h-3 text-primary/70" />}
              {time}
            </span>
          )}
        </div>

        {/* Line 2: preview + one urgent signal + unread count */}
        <div className={cn("flex items-center gap-2", dense ? "mt-0.5" : "mt-1")}>
          <span className={cn(
            "flex-1 min-w-0 truncate text-[12.5px] leading-snug",
            unread ? "text-foreground/80 font-medium" : "text-muted-foreground",
          )}>
            {media ? (
              <span className="inline-flex items-center gap-1"><media.icon className="w-3.5 h-3.5 shrink-0" />{media.label}</span>
            ) : (
              c.last_message_preview || <span className="italic text-muted-foreground/60">No messages yet</span>
            )}
          </span>
          {needsCall ? (
            <Tip label="Call this hot lead" side="top"><Phone className="w-3.5 h-3.5 text-info shrink-0" /></Tip>
          ) : needsFollowUp ? (
            <Tip label="Follow up now" side="top"><Zap className="w-3.5 h-3.5 text-warm shrink-0" /></Tip>
          ) : windowExpired ? (
            <Tip label="24h window closed" side="top"><Clock className="w-3.5 h-3.5 text-hot shrink-0" /></Tip>
          ) : null}
          {unread && (
            <span className="shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center tabular-nums">
              {c.unread_count > 99 ? "99+" : c.unread_count}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

export default ConversationCard;
