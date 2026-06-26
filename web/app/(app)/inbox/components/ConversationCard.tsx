"use client";
import { memo } from "react";
import {
  Image as ImageIcon, Video, FileText, Headset, Zap, Clock, Phone, Sticker, Mic, User,
} from "lucide-react";
import { initials, channelColor, avatarColor, relTime, cn } from "@/lib/utils";
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

  const media = c.last_message_preview ? PREVIEW_MEDIA[c.last_message_preview] : undefined;
  const previewFull = media ? media.label : (c.last_message_preview || "No messages yet");
  const cc = channelColor(c.channel);
  const ac = avatarColor(c.contact_name || c.contact_phone);
  const hasMeta = !!c.campaign_name || (showAgent && !!c.agent_name);

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex gap-3 pl-4 pr-3 cursor-pointer border-b border-border/40 transition-colors duration-100",
        dense ? "py-2" : "py-3",
        isActive ? "bg-primary/[0.06]" : "hover:bg-muted/40",
      )}
    >

      {/* Avatar (dynamic per-contact colour, WhatsApp-style) + channel dot */}
      <div className="relative shrink-0 self-start mt-0.5">
        <div
          className="w-9 h-9 rounded-full grid place-items-center text-[13px] font-semibold"
          style={{ backgroundColor: ac + "1F", color: ac }}
        >
          {initials(c.contact_name || c.contact_phone)}
        </div>
        <Tip label={channelName || c.channel} side="top">
          <span
            className="absolute -bottom-0.5 -right-0.5 w-[12px] h-[12px] rounded-full ring-[2.5px] ring-card"
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

        {/* Line 2: preview (full text on hover) + one urgent signal + unread count */}
        <div className={cn("flex items-center gap-1.5", dense ? "mt-1" : "mt-1.5")}>
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
          {needsCall ? (
            <Tip label="Call this hot lead" side="top"><Phone className="w-3.5 h-3.5 text-info shrink-0" /></Tip>
          ) : needsFollowUp ? (
            <Tip label="Follow up now" side="top"><Zap className="w-3.5 h-3.5 text-warm shrink-0" /></Tip>
          ) : windowExpired ? (
            <Tip label="24h window closed" side="top"><Clock className="w-3.5 h-3.5 text-hot shrink-0" /></Tip>
          ) : null}
          {unread && (
            <span className="shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold grid place-items-center tabular-nums animate-unread">
              {c.unread_count > 99 ? "99+" : c.unread_count}
            </span>
          )}
        </div>

        {/* Line 3: agent (left) + campaign (right) — full names */}
        {hasMeta && (
          <div className={cn("flex items-center gap-1.5 min-w-0", dense ? "mt-1" : "mt-2")}>
            {showAgent && c.agent_name && (
              <Tip label={`Assigned: ${c.agent_name}`} side="top">
                <span className="inline-flex items-center gap-1 h-[19px] px-1.5 rounded-md bg-muted text-foreground/70 text-[11px] font-medium truncate min-w-0 max-w-[55%]">
                  <User className="w-2.5 h-2.5 shrink-0 opacity-70" />{c.agent_name}
                </span>
              </Tip>
            )}
            {c.campaign_name && (
              <Tip label={c.campaign_name} side="top">
                <span className="inline-flex items-center h-[19px] px-2 rounded-md bg-primary/[0.08] text-primary-text text-[11px] font-medium truncate min-w-0 ml-auto max-w-[58%]">
                  {c.campaign_name}
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
