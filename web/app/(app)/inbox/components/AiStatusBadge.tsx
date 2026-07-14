"use client";
import { Bot, UserRound, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { HandoffMark } from "@/components/simpul/Glyphs";

// AI handling indicator + takeover control for a conversation. Colour rule that
// runs across the whole app: AI/Simpuler = indigo, human agent = petrol.
//   - processing (Simpuler drafting a reply)  -> indigo "Processing" + spinner
//   - is_bot_active                            -> indigo "Auto · Simpuler" + Take over
//   - manual                                   -> petrol "Manual · {agent}" + Hand back
// State is fed by live data (WS conversation.updated / ai.activity), so the badge
// updates without a reload; the REST poll is the fallback.
export function AiStatusBadge({
  isBotActive, processing, agentName, busy, compact, canHandBack = true, onTakeOver, onRelease,
}: {
  isBotActive: boolean;
  processing?: boolean;
  agentName?: string | null;
  busy?: boolean;
  compact?: boolean;
  // Once an agent has replied in the thread, the AI stands down permanently for
  // that conversation (orchestrator human-takeover guard), so handing back would
  // do nothing — the button is hidden in that case.
  canHandBack?: boolean;
  onTakeOver: () => void;
  onRelease: () => void;
}) {
  const { t } = useI18n();
  const ai = isBotActive || processing;

  const badge = processing ? (
    <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-ai/10 text-ai-text text-[11px] font-bold">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      {t("inbox.aiProcessing")}
    </span>
  ) : isBotActive ? (
    <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-ai/10 text-ai-text text-[11px] font-bold">
      <span className="relative flex w-2 h-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-ai opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex w-2 h-2 rounded-full bg-ai" />
      </span>
      <Bot className="w-3.5 h-3.5" />
      {t("inbox.aiAuto")}
      <span className="opacity-60">·</span>
      {t("inbox.aiSimpuler")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-primary/10 text-primary-text text-[11px] font-bold">
      <UserRound className="w-3.5 h-3.5" />
      {t("inbox.aiManual")}
      {agentName && (<><span className="opacity-60">·</span><span className="truncate max-w-[92px]">{agentName}</span></>)}
    </span>
  );

  const button = ai ? (
    <button
      type="button"
      disabled={busy}
      onClick={onTakeOver}
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-primary/40 text-primary-text text-[11px] font-bold hover:bg-primary/[0.06] disabled:opacity-50 outline-none transition-colors"
    >
      <HandoffMark size={14} strokeWidth={2} />
      {t("inbox.aiTakeOver")}
    </button>
  ) : canHandBack ? (
    <button
      type="button"
      disabled={busy}
      onClick={onRelease}
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-ai/40 text-ai-text text-[11px] font-bold hover:bg-ai/[0.06] disabled:opacity-50 outline-none transition-colors"
    >
      <Bot className="w-3.5 h-3.5" />
      {t("inbox.aiHandBack")}
    </button>
  ) : null;

  return (
    <div className={cn("flex items-center gap-1.5 shrink-0", compact && "gap-1")}>
      {badge}
      {!compact && button}
    </div>
  );
}

export default AiStatusBadge;
