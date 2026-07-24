"use client";
import { useI18n } from "@/lib/i18n";
import { memo } from "react";
import {
  Image as ImageIcon, Video, FileText, Headset, Bot, CheckCircle, Zap, Clock, Phone, Sticker, Mic, User, Building2,
  Check, CheckCheck, AlertCircle,
} from "lucide-react";
import { initials, channelColor, avatarColor, cn } from "@/lib/utils";
import { channelMeta } from "@/components/ChannelIcon";
import { WindowTime, WindowCountdownBadge } from "./WindowTime";
import { Tip } from "@/components/ui/tooltip";
import type { Conversation } from "@/lib/types";

interface ConversationCardProps {
  conv: Conversation;
  isActive: boolean;
  onClick: () => void;
  onCopy: (text: string) => void;
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
  // Backend previews are emoji-prefixed ("🖼️ Sticker") - match by prefix so
  // the list shows a proper icon instead of a raw emoji.
  "📷": { icon: ImageIcon, label: "Photo" },
  "🎥": { icon: Video, label: "Video" },
  "📄": { icon: FileText, label: "Document" },
  "🖼": { icon: Sticker, label: "Sticker" },
  "🎤": { icon: Mic, label: "Voice message" },
  "👤": { icon: User, label: "Contact" },
};

function previewMedia(preview: string | null | undefined) {
  if (!preview) return undefined;
  if (PREVIEW_MEDIA[preview]) return PREVIEW_MEDIA[preview];
  for (const key of Object.keys(PREVIEW_MEDIA)) {
    if (preview.startsWith(key)) return PREVIEW_MEDIA[key];
  }
  return undefined;
}

const ConversationCard = memo(function ConversationCard({
  conv: c, isActive, onClick, showAgent, channelName, dense,
}: ConversationCardProps) {
  const { t } = useI18n();
  const unread = c.unread_count > 0;

  const needsFollowUp = (c.interest_level === "hot" || c.interest_level === "warm") && unread;
  const needsCall = c.interest_level === "hot" && (c.call_attempts === null || c.call_attempts === 0);

  // Last responder: who sent the latest message
  const repliedByBot = c.last_sender_type === "bot";
  const repliedByAgent = c.last_sender_type === "agent" || c.last_sender_type === "system";
  const responder: "human" | "bot" | null = repliedByBot ? "bot" : repliedByAgent ? "human" : null;
  const responderLabel = repliedByBot ? "Replied by Simpuler" : "Replied by agent";

  // 24h window expired badge (template only)
  const isWa = c.channel === "whatsapp" && !!c.last_message_at;
  const winAge = c.last_message_at ? Date.now() - new Date(c.last_message_at).getTime() : Infinity;
  const windowExpired = isWa && winAge >= 24 * 60 * 60 * 1000;

  // Delivery status for outbound messages
  const outboundStatus = c.last_message_direction === "agent" ? c.last_outbound_status : null;

  const media = previewMedia(c.last_message_preview);
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

      {/* Avatar + channel dot */}
      <div className="relative shrink-0 self-start mt-0.5">
        <div
          className="w-9 h-9 rounded-full grid place-items-center text-[13px] font-bold text-white"
          style={{ backgroundColor: ac }}
        >
          {initials(c.contact_name || c.contact_phone)}
        </div>
        {(() => {
          const m = channelMeta(c.channel);
          const CIcon = m.icon;
          return (
            <Tip label={channelName || m.name} side="top">
              <span
                className="absolute -bottom-0.5 -right-0.5 w-[13px] h-[13px] rounded-full ring-2 ring-card grid place-items-center text-white"
                style={{ background: m.gradient ?? m.color }}
              >
                <CIcon className="w-[8px] h-[8px]" />
              </span>
            </Tip>
          );
        })()}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        {/* Line 1: name + [responder icon] + [24H badge] + date */}
        <div className="flex items-center gap-1.5">
          <p className={cn(
            "min-w-0 truncate text-[13px] leading-snug",
            unread ? "font-semibold text-foreground" : "font-medium text-foreground/90",
          )}>
            {c.contact_name || c.contact_phone || t("broadcasts.unknown")}
          </p>
          <span className="flex-1" />
          {!windowExpired ? (
            responder ? (
              <Tip label={responderLabel} side="top">
                <span className="flex items-center">
                  <WindowCountdownBadge lastMessageAt={c.last_message_at} responder={responder} />
                </span>
              </Tip>
            ) : (
              <WindowCountdownBadge lastMessageAt={c.last_message_at} responder={responder} />
            )
          ) : (
            <>
              {responder && (
                <Tip label={responderLabel} side="top">
                  {responder === "bot"
                    ? <Bot className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    : <Headset className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                </Tip>
              )}
              {isWa && (
                <Tip label="24h window closed - template only" side="top">
                  <span className="shrink-0 inline-flex items-center gap-0.5 h-[18px] px-1.5 rounded-lg bg-hot text-white text-[9px] font-bold tabular-nums leading-none">
                    <Clock className="w-2.5 h-2.5" />24H
                  </span>
                </Tip>
              )}
              <WindowTime lastMessageAt={c.last_message_at} unread={unread} />
            </>
          )}
        </div>

        {/* Line 2: delivery check + preview + signal icon + unread count */}
        <div className={cn("flex items-center gap-1.5", dense ? "mt-0.5" : "mt-1")}>
          {/* Delivery status checkmarks for outbound */}
          {outboundStatus === "failed" ? (
            <Tip label={t("broadcasts.failed")} side="top"><AlertCircle className="w-3 h-3 shrink-0 text-hot" /></Tip>
          ) : outboundStatus === "read" ? (
            <Tip label={t("broadcasts.read")} side="top"><CheckCheck className="w-3.5 h-3.5 shrink-0 text-info" /></Tip>
          ) : outboundStatus === "delivered" ? (
            <Tip label={t("broadcasts.delivered")} side="top"><CheckCheck className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /></Tip>
          ) : outboundStatus === "sent" ? (
            <Tip label={t("broadcasts.sent")} side="top"><Check className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /></Tip>
          ) : null}
          <Tip label={<span className="block max-w-[300px] whitespace-pre-wrap leading-snug text-left text-[12px]">{previewFull}</span>} side="bottom" align="start">
            <span className={cn(
              "flex-1 min-w-0 truncate text-[12px] leading-snug",
              unread ? "text-foreground/85" : "text-muted-foreground",
            )}>
              {media ? (
                <span className="inline-flex items-center gap-1 align-middle"><media.icon className="w-3.5 h-3.5 shrink-0" />{t(media.label)}</span>
              ) : (
                c.last_message_preview || <span className="italic text-muted-foreground/60">{t("components.noMessagesYet")}</span>
              )}
            </span>
          </Tip>
          {c.status === "closed" ? (
            <Tip label={t("inbox.closed")} side="top"><CheckCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" /></Tip>
          ) : c.status === "snoozed" ? (
            <Tip label={t("inbox.snoozed")} side="top"><Clock className="w-3.5 h-3.5 text-warm shrink-0" /></Tip>
          ) : needsCall ? (
            <Tip label={t("inbox.callThisHotLead")} side="top"><Phone className="w-3.5 h-3.5 text-info shrink-0" /></Tip>
          ) : needsFollowUp ? (
            <Tip label={t("inbox.followUpNow")} side="top"><Zap className="w-3.5 h-3.5 text-warm shrink-0" /></Tip>
          ) : null}
          {unread && (
            <span className="shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold grid place-items-center tabular-nums animate-unread">
              {c.unread_count > 99 ? "99+" : c.unread_count}
            </span>
          )}
        </div>

        {/* Line 3: agent + campaign */}
        {hasMeta && (
          <div className={cn("flex items-center justify-end gap-3 min-w-0", dense ? "mt-1" : "mt-1.5")}>
            {showAgent && c.agent_name && (
              <Tip label={`Assigned: ${c.agent_name}`} side="top">
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate shrink min-w-0">
                  <User className="w-3 h-3 shrink-0 opacity-70" />
                  <span className="truncate">{c.agent_name}</span>
                </span>
              </Tip>
            )}
            {c.campaign_name && (
              <Tip label={c.campaign_name} side="top">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-text truncate shrink min-w-0">
                  <Building2 className="w-3 h-3 shrink-0 opacity-80" />
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
