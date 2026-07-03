"use client";
import { memo } from "react";
import {
  Image as ImageIcon, Video, FileText, Headset, Bot, CheckCircle, Zap, Clock, Phone, Sticker, Mic, User, Megaphone,
} from "lucide-react";
import { initials, channelColor, avatarColor, cn } from "@/lib/utils";
import { WindowTime, WindowCountdownBadge } from "./WindowTime";
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
  conv: c, isActive, onClick, showAgent, channelName, dense,
}: ConversationCardProps) {
  const unread = c.unread_count > 0;

  const needsFollowUp = (c.interest_level === "hot" || c.interest_level === "warm") && unread;
  const needsCall = c.interest_level === "hot" && (c.call_attempts === null || c.call_attempts === 0);
  // Last responder derived from who actually sent the latest message: a human
  // agent (headset) vs Simpuler (robot). is_bot_active only means the bot is
  // enabled, not who replied, so it must not drive this.
  const repliedByBot = c.last_sender_type === "bot";
  const repliedByAgent = c.last_sender_type === "agent" || c.last_sender_type === "system";
  const responder: "human" | "bot" | null = repliedByBot ? "bot" : repliedByAgent ? "human" : null;
  const responderLabel = repliedByBot ? "Replied by Simpuler" : "Replied by agent";
  // The 24h session window counts down from the last message (any direction);
  // sending a reply restarts it. While open, the line-1 slot shows a live
  // countdown; once elapsed it becomes the plain date with a "24H" badge in the
  // responder-icon slot to its left.
  const sessionAnchor = c.last_message_at;
  const isWa = c.channel === "whatsapp" && !!sessionAnchor;
  const winAge = sessionAnchor ? Date.now() - new Date(sessionAnchor).getTime() : Infinity;
  const windowOpen = isWa && winAge < 24 * 60 * 60 * 1000;
  const windowExpired = isWa && winAge >= 24 * 60 * 60 * 1000;

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
          className="w-9 h-9 rounded-full grid place-items-center text-[13px] font-bold text-white"
          style={{ backgroundColor: ac }}
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
        {/* Line 1: name + [responder icon | 24H badge] + [countdown pill | date] */}
        <div className="flex items-center gap-1.5">
          <p className={cn(
            "min-w-0 truncate text-[13px] leading-snug",
            unread ? "font-semibold text-foreground" : "font-medium text-foreground/90",
          )}>
            {c.contact_name || c.contact_phone || "Unknown"}
          </p>
          <span className="flex-1" />
          {windowOpen ? (
            <Tip label={responder ? responderLabel : "24h session window"} side="top">
              <WindowCountdownBadge lastMessageAt={sessionAnchor} responder={responder} />
            </Tip>
          ) : windowExpired ? (
            <>
              <Tip label="24h window closed - template only" side="top">
                <span className="shrink-0 inline-flex items-center gap-0.5 h-[18px] px-1.5 rounded-lg bg-hot text-white text-[9px] font-bold tabular-nums leading-none">
                  <Clock className="w-2.5 h-2.5" />24H
                </span>
              </Tip>
              <WindowTime lastMessageAt={c.last_message_at} unread={unread} />
            </>
          ) : (
            <>
              {responder && (
                <Tip label={responderLabel} side="top">
                  {responder === "bot"
                    ? <Bot className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    : <Headset className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                </Tip>
              )}
              <WindowTime lastMessageAt={c.last_message_at} unread={unread} />
            </>
          )}
        </div>

        {/* Line 2: preview + one signal + unread count */}
        <div className={cn("flex items-center gap-1.5", dense ? "mt-0.5" : "mt-1")}>
          <Tip label={<span className="block max-w-[300px] whitespace-pre-wrap leading-snug text-left text-[12px]">{previewFull}</span>} side="bottom" align="start">
            <span className={cn(
              "flex-1 min-w-0 truncate text-[12px] leading-snug",
              unread ? "text-foreground/85" : "text-muted-foreground",
            )}>
              {media ? (
                <span className="inline-flex items-center gap-1 align-middle"><media.icon className="w-3.5 h-3.5 shrink-0" />{media.label}</span>
              ) : (
                c.last_message_preview || <span className="italic text-muted-foreground/60">No messages yet</span>
              )}
            </span>
          </Tip>
          {c.status === "closed" ? (
            <Tip label="Closed" side="top"><CheckCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" /></Tip>
          ) : c.status === "snoozed" ? (
            <Tip label="Snoozed" side="top"><Clock className="w-3.5 h-3.5 text-warm shrink-0" /></Tip>
          ) : needsCall ? (
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

        {/* Line 3: agent + campaign as icon + text (no pills) */}
        {hasMeta && (
          <div className={cn("flex items-center gap-3 min-w-0", dense ? "mt-1" : "mt-1.5")}>
            {showAgent && c.agent_name && (
              <Tip label={`Assigned: ${c.agent_name}`} side="top">
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate min-w-0 max-w-[50%]">
                  <User className="w-3 h-3 shrink-0 opacity-70" />{c.agent_name}
                </span>
              </Tip>
            )}
            {c.campaign_name && (
              <Tip label={c.campaign_name} side="top">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-text truncate min-w-0 max-w-[60%]">
                  <Megaphone className="w-3 h-3 shrink-0 opacity-80" />{c.campaign_name}
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
