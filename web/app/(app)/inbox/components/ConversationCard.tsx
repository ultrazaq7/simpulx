"use client";
import { memo } from "react";
import {
  Image as ImageIcon, Video, FileText, Headset, Zap, Clock, Phone, Sticker, Mic, User,
} from "lucide-react";
import { initials, channelColor, interestColor, relTime, cn } from "@/lib/utils";
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

function MetaTag({ tone, icon: Icon, active, children }: {
  tone: "amber" | "blue" | "red" | "neutral";
  icon?: any;
  active?: boolean;
  children: React.ReactNode;
}) {
  // On an active (green-tinted) row, switch to solid white pills + colored ring
  // so the chips don't blend into the background.
  const tones: Record<string, string> = active ? {
    amber: "bg-white text-amber-700",
    blue: "bg-white text-blue-700",
    red: "bg-white text-red-600",
    neutral: "bg-white text-slate-600",
  } : {
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-600",
    neutral: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 h-[18px] px-2 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0", tones[tone])}>
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
}

const PREVIEW_MEDIA: Record<string, { icon: any; label: string }> = {
  "[image]": { icon: ImageIcon, label: "Photo" },
  "[video]": { icon: Video, label: "Video" },
  "[document]": { icon: FileText, label: "Document" },
  "[sticker]": { icon: Sticker, label: "Sticker" },
  "[audio]": { icon: Mic, label: "Voice message" },
};

const ConversationCard = memo(function ConversationCard({
  conv: c, isActive, onClick, messages, showAgent, channelName,
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

  // Hot/Warm + unread → nudge to follow up now (BR-28: lead_score stays hidden)
  const needsFollowUp = (c.interest_level === "hot" || c.interest_level === "warm") && unread;
  // Hot + never called → nudge to call (BR-30)
  const needsCall = c.interest_level === "hot" && (c.call_attempts === null || c.call_attempts === 0);
  // WhatsApp 24h service window closed
  const windowExpired = (() => {
    if (!c.last_message_at || c.channel !== "whatsapp") return false;
    return Date.now() - new Date(c.last_message_at).getTime() > 24 * 60 * 60 * 1000;
  })();

  // Left accent: only signal bars (follow-up / call). Active is shown via bg only.
  const accent = needsFollowUp ? "bg-amber" : needsCall ? "bg-info" : "";

  const media = c.last_message_preview ? PREVIEW_MEDIA[c.last_message_preview] : undefined;

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex gap-3 pl-4 pr-3 py-3 cursor-pointer border-b border-border/50 transition-colors duration-100",
        isActive ? "bg-primary/[0.08]" : "hover:bg-muted/60",
      )}
    >
      {/* Unread: a glowing line slowly traces the row's border (no hover needed) */}
      {unread && <span aria-hidden className="unread-trace pointer-events-none absolute inset-1 rounded-lg" />}

      {/* Avatar + channel dot */}
      <div className="relative shrink-0 self-start mt-0.5">
        <div
          className="w-11 h-11 rounded-full grid place-items-center text-[13px] font-bold ring-1 ring-inset ring-black/5"
          style={{ backgroundColor: channelColor(c.channel) + "1A", color: channelColor(c.channel) }}
        >
          {initials(c.contact_name || c.contact_phone)}
        </div>
        <Tip label={channelName || c.channel} side="top">
          <span
            className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-card"
            style={{ backgroundColor: channelColor(c.channel) }}
          />
        </Tip>
      </div>

      <div className="flex-1 min-w-0">
        {/* Line 1: name + time */}
        <div className="flex items-center gap-2">
          <p className={cn(
            "flex-1 truncate text-[15px] leading-tight",
            unread ? "font-bold text-foreground" : "font-semibold text-foreground/90",
          )}>
            {c.contact_name || c.contact_phone || "Unknown"}
          </p>
          {time && (
            <span className={cn(
              "shrink-0 flex items-center gap-1 text-[11px] tabular-nums",
              unread ? "text-primary font-bold" : "text-muted-foreground font-medium",
            )}>
              {agentReplied && !unread && <Headset className="w-3 h-3 text-primary/70" />}
              {time}
            </span>
          )}
        </div>

        {/* Line 2: preview + unread count */}
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn(
            "flex-1 min-w-0 truncate flex items-center gap-1 text-[13px]",
            unread ? "text-foreground/80 font-medium" : "text-muted-foreground",
          )}>
            {media ? (
              <><media.icon className="w-4 h-4 shrink-0" /> {media.label}</>
            ) : (
              c.last_message_preview || <span className="italic text-muted-foreground/60">No messages yet</span>
            )}
          </span>
          {unread && (
            <span className="shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center tabular-nums">
              {c.unread_count > 99 ? "99+" : c.unread_count}
            </span>
          )}
        </div>

        {/* Line 3: signal tags (single line, no wrap) */}
        {(showAgent || needsFollowUp || needsCall || windowExpired || c.interest_level || c.campaign_name) && (
          <div className="flex items-center gap-1 mt-1.5 overflow-hidden">
            {showAgent && (
              c.agent_name
                ? <span className={cn("inline-flex items-center gap-1 h-[18px] px-2 rounded-full text-slate-600 text-[10px] font-semibold shrink-0 max-w-[110px] truncate", isActive ? "bg-white" : "bg-slate-100")}><User className="w-2.5 h-2.5 shrink-0" />{c.agent_name}</span>
                : <MetaTag tone="amber" icon={User} active={isActive}>Unassigned</MetaTag>
            )}
            {needsFollowUp && <MetaTag tone="amber" icon={Zap} active={isActive}>Follow up</MetaTag>}
            {needsCall && <MetaTag tone="blue" icon={Phone} active={isActive}>Call</MetaTag>}
            {windowExpired && <MetaTag tone="red" icon={Clock} active={isActive}>24h</MetaTag>}
            {c.interest_level && (
              <span className={cn("inline-flex items-center gap-1 h-[18px] px-2 rounded-full text-slate-600 text-[10px] font-semibold capitalize shrink-0", isActive ? "bg-white" : "bg-slate-100")}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: interestColor(c.interest_level) }} />
                {c.interest_level}
              </span>
            )}
            {c.campaign_name && (
              <span className={cn("ml-auto inline-flex items-center h-[18px] px-2 rounded-md text-primary text-[10px] font-semibold shrink-0 max-w-[120px] truncate", isActive ? "bg-white" : "bg-primary/10")}>
                {c.campaign_name}
              </span>
            )}
          </div>
        )}
        </div>
      </div>
  );
});

export default ConversationCard;
