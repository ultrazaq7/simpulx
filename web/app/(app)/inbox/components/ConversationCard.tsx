"use client";
import { memo } from "react";
import {
  Image as ImageIcon, Video, FileText, Headset, Zap, Clock, Phone, Sticker, Mic,
} from "lucide-react";
import { initials, channelColor, channelTextColor, relTime, cn } from "@/lib/utils";
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

// Lead temperature -> a small semantic dot (never brand green), shown only as a
// last-resort signal for hot/warm leads that have no more urgent flag.
const TEMP_DOT: Record<string, string> = { hot: "bg-hot", warm: "bg-warm" };
const TEMP_LABEL: Record<string, string> = { hot: "Hot lead", warm: "Warm lead" };

const ConversationCard = memo(function ConversationCard({
  conv: c, isActive, onClick, messages, showAgent, channelName, dense,
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

  // One left accent, by priority: unread > call > follow-up.
  const accent = unread ? "bg-primary" : needsCall ? "bg-info" : needsFollowUp ? "bg-warm" : "";
  // Temperature dot only as a fallback signal for hot/warm.
  const temp = (c.interest_level === "hot" || c.interest_level === "warm") ? c.interest_level : null;

  const media = c.last_message_preview ? PREVIEW_MEDIA[c.last_message_preview] : undefined;
  const cc = channelColor(c.channel);

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex gap-3 pl-4 pr-3 cursor-pointer border-b border-border/40 transition-colors duration-100",
        dense ? "py-2" : "py-2.5",
        isActive ? "bg-primary/[0.06]" : "hover:bg-muted/40",
      )}
    >
      {accent && <span aria-hidden className={cn("absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full", accent)} />}

      {/* Avatar + channel dot */}
      <div className="relative shrink-0 self-center">
        <div
          className="w-9 h-9 rounded-full grid place-items-center text-[13px] font-semibold"
          style={{ backgroundColor: cc + "14", color: channelTextColor(c.channel) }}
        >
          {initials(c.contact_name || c.contact_phone)}
        </div>
        <Tip label={channelName || c.channel} side="top">
          <span
            className="absolute -bottom-0.5 -right-0.5 w-[11px] h-[11px] rounded-full ring-[2.5px] ring-card"
            style={{ backgroundColor: cc }}
          />
        </Tip>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        {/* Line 1: name + time */}
        <div className="flex items-baseline gap-2">
          <p className={cn(
            "flex-1 truncate text-[14px] leading-snug",
            unread ? "font-semibold text-foreground" : "font-medium text-foreground/90",
          )}>
            {c.contact_name || c.contact_phone || "Unknown"}
          </p>
          {time && (
            <span className={cn(
              "shrink-0 text-[11px] tabular-nums",
              unread ? "text-primary-text font-semibold" : "text-muted-foreground",
            )}>
              {time}
            </span>
          )}
        </div>

        {/* Line 2: preview + one signal + unread count */}
        <div className={cn("flex items-center gap-1.5", dense ? "mt-0.5" : "mt-1")}>
          <span className={cn(
            "flex-1 min-w-0 truncate text-[13px] leading-snug",
            unread ? "text-foreground/70" : "text-muted-foreground",
          )}>
            {agentReplied && !unread && <Headset className="inline-block w-3 h-3 mr-1 -mt-0.5 text-primary/60 align-middle" />}
            {media ? (
              <span className="inline-flex items-center gap-1 align-middle"><media.icon className="w-3.5 h-3.5 shrink-0" />{media.label}</span>
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
          ) : temp ? (
            <Tip label={TEMP_LABEL[temp]} side="top"><span className={cn("w-1.5 h-1.5 rounded-full shrink-0", TEMP_DOT[temp])} /></Tip>
          ) : null}
          {unread && (
            <span className="shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold grid place-items-center tabular-nums">
              {c.unread_count > 99 ? "99+" : c.unread_count}
            </span>
          )}
        </div>
      </div>

      {/* Assignee (managers/admins): a subtle avatar on the right edge */}
      {showAgent && c.agent_name && (
        <Tip label={`Assigned: ${c.agent_name}`} side="top">
          <span className="self-center shrink-0 w-5 h-5 rounded-full bg-muted text-muted-foreground text-[9px] font-semibold grid place-items-center">
            {initials(c.agent_name)}
          </span>
        </Tip>
      )}
    </div>
  );
});

export default ConversationCard;
