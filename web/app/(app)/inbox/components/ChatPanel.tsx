"use client";
import { useState, useEffect } from "react";
import {
  MessageSquare, ChevronRight, Check, Copy, X, Search,
  CheckCircle, RotateCcw, PanelRight, Lock, ChevronUp, ChevronDown,
  Download, XCircle, User,
} from "lucide-react";
import { cn, fmtTime } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";
import type { Conversation, Disposition, InternalNote, QuickReply, Stage, Message } from "@/lib/types";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { UseInfiniteQueryResult } from "@tanstack/react-query";
import MessageBubble from "./MessageBubble";
import Composer from "./Composer";
import LostReasonDialog from "./LostReasonDialog";

// --- Timeline types (shared with page.tsx) ---
export type Item =
  | { kind: "date"; key: string; label: string }
  | { kind: "msg"; key: string; m: Message }
  | { kind: "note"; key: string; n: InternalNote };

// --- Stage color map (semantic data colors) ---
const stageColorMap: Record<string, string> = {
  new_lead: "#EF4444", "new lead": "#EF4444",
  contacted: "#FF9800", qualified: "#F5A623",
  pending_payment: "#2196F3", "pending payment": "#2196F3",
  customer: "#2D8B73", won: "#2E7D32",
  lost: "#9C27B0", no_reply: "#6366F1", "no reply": "#6366F1",
};
function getDotColor(name: string): string {
  return stageColorMap[name.toLowerCase()] || stageColorMap[name.toLowerCase().replace(/\s+/g, "_")] || "#FF9800";
}

// --- Stage menu (custom dropdown, no MUI) ---
// Pipeline stages = progress (New ... Booking). Lost/Spam are terminal OUTCOMES
// (dispositions + reason), not stages — so they live in their own section here.
function StageMenu({
  stages, currentStageId, onSelect, onMarkOutcome, onClear,
}: {
  stages: Stage[];
  currentStageId: string | null;
  onSelect: (id: string) => void;
  onMarkOutcome: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = stages.find((s) => s.id === currentStageId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 h-8 rounded-l-md text-[13px] font-semibold text-foreground hover:bg-muted transition-colors outline-none"
      >
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: current ? getDotColor(current.name) : "hsl(var(--muted-foreground))" }} />
        {current?.name || "Select stage"}
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1.5 z-50 w-56 bg-popover rounded-lg border border-border shadow-xl py-1 max-h-[400px] overflow-auto animate-scale-in origin-top-left">
            <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pipeline stage</p>
            {stages.map((s) => (
              <button
                key={s.id}
                onClick={() => { onSelect(s.id); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-foreground/90 hover:bg-muted outline-none"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getDotColor(s.name) }} />
                {s.name}
                {s.id === currentStageId && <Check className="w-4 h-4 text-primary ml-auto" />}
              </button>
            ))}
            <div className="border-t border-border my-1" />
            <p className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Outcome</p>
            <button
              onClick={() => { onMarkOutcome(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 outline-none"
            >
              <XCircle className="w-3.5 h-3.5" />
              Mark as lost / spam
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// --- Media Preview Modal ---
function MediaPreview({ media, onClose }: { media: { url: string; type: string }; onClose: () => void }) {
  const isImage = media.type === "image" || ["jpg", "jpeg", "png", "gif", "webp", "svg"].some(ext => media.url.toLowerCase().endsWith(ext));
  const isVideo = media.type === "video" || ["mp4", "mov", "webm", "avi", "mkv"].some(ext => media.url.toLowerCase().endsWith(ext));

  if (!isImage && !isVideo) {
    window.open(media.url, "_blank");
    onClose();
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B141A]/95 animate-fade-in" onClick={onClose}>
      <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/60 to-transparent flex items-center justify-end px-4 gap-2 z-10" onClick={(e) => e.stopPropagation()}>
        <Tip label="Download" side="bottom">
          <a href={media.url} download target="_blank" rel="noreferrer" className="p-2 rounded-full text-white hover:bg-white/10 transition-colors outline-none">
            <Download className="w-5 h-5" />
          </a>
        </Tip>
        <Tip label="Close" side="bottom">
          <button onClick={onClose} className="p-2 rounded-full text-white hover:bg-white/10 transition-colors outline-none">
            <X className="w-6 h-6" />
          </button>
        </Tip>
      </div>
      <div className="w-full h-full flex items-center justify-center p-4 md:p-12" onClick={(e) => e.stopPropagation()}>
        {isImage ? (
          <img src={media.url} className="max-w-full max-h-full object-contain select-none rounded-md" alt="Preview" />
        ) : (
          <video src={media.url} controls autoPlay className="max-w-full max-h-full object-contain outline-none rounded-md" />
        )}
      </div>
    </div>
  );
}

const STATUS_CHIP: Record<string, string> = {
  open: "bg-success/10 text-success",
  pending: "bg-warning/15 text-amber-700",
  closed: "bg-muted text-muted-foreground",
};

// --- ChatPanel props ---
export interface ChatPanelProps {
  active: Conversation | null;
  timeline: Item[];
  messagesQuery: UseInfiniteQueryResult<any, any>;
  bodyRef: React.RefObject<HTMLDivElement>;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  stages: Stage[];
  dispositions: Disposition[];
  onStageChange: (stageId: string) => void;
  onOverride: (patch: { stage_id?: string; disposition_id?: string; interest_level?: string; lost_reason?: string }, label: string) => void;
  onResolve: () => void;
  onReopen: () => void;
  onCopyText: (text: string) => void;
  draft: string;
  setDraft: (v: string | ((d: string) => string)) => void;
  tab: number;
  setTab: (n: number) => void;
  quickReplies: QuickReply[];
  pendingFiles: File[];
  pendingPreviews: (string | null)[];
  fileRef: React.RefObject<HTMLInputElement>;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  cancelSendFile: () => void;
  removePendingFile: (index: number) => void;
  busy: boolean;
  onSubmit: () => void;
  showDetails: boolean;
  onToggleDetails: () => void;
  notify: (msg: string, severity?: "success" | "info" | "warning" | "error") => void;
  onSendVoice: (blob: Blob) => Promise<void>;
  showAgent?: boolean; // manager/admin: show assigned agent in the header
  onForward?: (text: string) => void;
}

export default function ChatPanel({
  active, timeline, messagesQuery, bodyRef, rowVirtualizer,
  stages, dispositions,
  onStageChange, onOverride, onResolve, onReopen, onCopyText,
  draft, setDraft, tab, setTab, quickReplies,
  pendingFiles, pendingPreviews, fileRef, onFile, cancelSendFile, removePendingFile,
  busy, onSubmit, onSendVoice, showDetails, onToggleDetails, notify, showAgent, onForward,
}: ChatPanelProps) {
  const [previewMedia, setPreviewMedia] = useState<{ url: string; type: string } | null>(null);
  const [outcomeOpen, setOutcomeOpen] = useState(false);

  // ── In-conversation search (Ctrl+F) ──
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchIdx, setSearchIdx] = useState(0);

  const searchMatches = searchTerm.length >= 2
    ? timeline
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => {
        if (it.kind === "msg" && it.m.body) return it.m.body.toLowerCase().includes(searchTerm.toLowerCase());
        if (it.kind === "note") return it.n.body.toLowerCase().includes(searchTerm.toLowerCase());
        return false;
      })
    : [];

  useEffect(() => { setSearchIdx(Math.max(0, searchMatches.length - 1)); }, [searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchMatches.length > 0 && searchMatches[searchIdx]) {
      rowVirtualizer.scrollToIndex(searchMatches[searchIdx].i, { align: "center" });
    }
  }, [searchIdx, searchMatches.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl+F handler
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearchTerm("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, searchOpen]);

  // Stage pipeline helpers
  const currentStageIdx = stages.findIndex((s) => s.id === active?.stage_id);
  const nextStage = currentStageIdx >= 0 && currentStageIdx + 1 < stages.length
    ? stages[currentStageIdx + 1]
    : null;

  return (
    <>
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {!active ? (
          /* WhatsApp-style Animated Empty State */
          <div className="flex flex-col items-center justify-center h-full px-6 text-center bg-background">
            {/* Animated Illustration */}
            <div className="relative w-[200px] h-[160px] mb-8 animate-empty-1">
              {/* Chat bubble left (incoming) */}
              <div className="absolute left-2 top-6 animate-bubble-2">
                <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm max-w-[130px]">
                  <div className="h-2 w-20 rounded-full bg-muted-foreground/20 mb-1.5" />
                  <div className="h-2 w-14 rounded-full bg-muted-foreground/15" />
                </div>
              </div>
              
              {/* Chat bubble right (outgoing) */}
              <div className="absolute right-2 top-[52px] animate-bubble-1">
                <div className="bg-primary/10 border border-primary/20 rounded-2xl rounded-br-sm px-4 py-2.5 shadow-sm max-w-[140px]">
                  <div className="h-2 w-24 rounded-full bg-primary/30 mb-1.5" />
                  <div className="h-2 w-16 rounded-full bg-primary/20" />
                </div>
              </div>
              
              {/* Small chat bubble */}
              <div className="absolute left-8 bottom-0 animate-bubble-1">
                <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-3 py-2 shadow-sm">
                  <div className="h-2 w-12 rounded-full bg-muted-foreground/15" />
                </div>
              </div>
            </div>
            
            {/* Title */}
            <h2 className="text-xl font-bold tracking-tight text-foreground mb-2 animate-empty-2">
              Pick a conversation
            </h2>
            
            {/* Description */}
            <p className="text-[13px] text-muted-foreground max-w-[340px] leading-relaxed animate-empty-3">
              New chats will open here with the full message history, customer context, and reply box ready.
            </p>
            
            {/* Decorative line */}
            <div className="mt-8 w-[340px] max-w-full border-t border-border animate-empty-4" />
            
            {/* Bottom info */}
            <p className="mt-4 text-[11px] text-muted-foreground/60 animate-empty-4 flex items-center gap-1.5">
              <Lock className="w-3 h-3" /> End-to-end encrypted
            </p>
          </div>
        ) : (
          <>
            {/* ── Chat Header ── */}
            <div className="h-14 shrink-0 flex items-center px-3 gap-2 border-b border-border bg-card">
              {/* Contact name + phone (left) */}
              <div className="min-w-0 mr-1">
                <p className="text-sm font-bold text-foreground truncate leading-tight">
                  {active.contact_name || active.contact_phone || "Unknown"}
                </p>
                {active.contact_phone && (
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-muted-foreground tabular-nums">{active.contact_phone}</span>
                    <button onClick={() => onCopyText(active.contact_phone!)} className="p-0.5 outline-none text-primary/70 hover:text-primary">
                      <Copy className="w-[11px] h-[11px]" />
                    </button>
                  </div>
                )}
              </div>

              {/* Stage chip + advance */}
              <div className="flex items-center border border-border rounded-md h-8 bg-background shrink-0">
                <StageMenu
                  stages={stages}
                  currentStageId={active.stage_id}
                  onSelect={(id) => {
                    onStageChange(id);
                    const s = stages.find((x) => x.id === id);
                    notify(`Stage updated to "${s?.name || "Unknown"}"`);
                  }}
                  onMarkOutcome={() => setOutcomeOpen(true)}
                  onClear={() => onOverride({ stage_id: "" }, "Stage")}
                />
                <div className="w-px h-full bg-border" />
                <Tip label={nextStage ? `Next: ${nextStage.name}` : "Last stage"}>
                  <button
                    disabled={!nextStage}
                    onClick={() => {
                      if (nextStage) {
                        onStageChange(nextStage.id);
                        notify(`Stage -> "${nextStage.name}"`);
                      }
                    }}
                    className="w-8 h-full flex items-center justify-center rounded-r-md text-primary hover:bg-primary/[0.08] disabled:opacity-30 disabled:cursor-not-allowed outline-none transition-colors"
                  >
                    <ChevronRight className="w-[18px] h-[18px]" />
                  </button>
                </Tip>
              </div>

              <div className="flex-1" />

              {/* Assigned agent (manager/admin) */}
              {showAgent && (
                <span className={cn("inline-flex items-center gap-1 px-2 h-6 rounded-md text-[11px] font-semibold max-w-[150px]", active.agent_name ? "bg-muted text-muted-foreground" : "bg-amber-50 text-amber-700")}>
                  <User className="w-3 h-3 shrink-0" />
                  <span className="truncate">{active.agent_name || "Unassigned"}</span>
                </span>
              )}

              {/* Status chip */}
              <span className={cn("inline-flex items-center px-2.5 h-6 rounded-md text-[11px] font-semibold capitalize", STATUS_CHIP[active.status] ?? STATUS_CHIP.closed)}>
                {active.status}
              </span>

              {/* Reopen if closed */}
              {active.status === "closed" && (
                <button
                  onClick={onReopen}
                  className="inline-flex items-center gap-1 px-2.5 h-8 rounded-md border border-border text-xs font-semibold text-foreground/80 hover:bg-muted outline-none transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reopen
                </button>
              )}

              {/* Resolve */}
              {active.status !== "closed" && (
                <Tip label="Resolve conversation">
                  <button
                    onClick={onResolve}
                    className="p-1.5 rounded-md text-success hover:bg-success/10 outline-none transition-colors"
                  >
                    <CheckCircle className="w-5 h-5" />
                  </button>
                </Tip>
              )}

              {/* Search messages */}
              <Tip label="Search messages (Ctrl+F)">
                <button
                  onClick={() => setSearchOpen((v) => !v)}
                  className={cn(
                    "p-1.5 rounded-md outline-none transition-colors",
                    searchOpen ? "text-primary bg-primary/[0.08]" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Search className="w-5 h-5" />
                </button>
              </Tip>

              {/* Toggle details */}
              <Tip label={showDetails ? "Hide details" : "Show details"}>
                <button
                  onClick={onToggleDetails}
                  className={cn(
                    "p-1.5 rounded-md outline-none transition-colors",
                    showDetails ? "text-primary bg-primary/[0.08]" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <PanelRight className="w-5 h-5" />
                </button>
              </Tip>
            </div>

            {/* ── Search bar (Ctrl+F) ── */}
            {searchOpen && (
              <div className="h-11 shrink-0 flex items-center px-3 gap-2 border-b border-border bg-card">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search messages"
                  autoFocus
                  className="flex-1 h-7 text-sm outline-none bg-transparent text-foreground placeholder:text-muted-foreground/70"
                />
                {searchMatches.length > 0 && (
                  <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">
                    {searchIdx + 1}/{searchMatches.length}
                  </span>
                )}
                {searchTerm.length >= 2 && searchMatches.length === 0 && (
                  <span className="text-[11px] text-muted-foreground">No results</span>
                )}
                <Tip label="Previous match" side="bottom">
                  <button onClick={() => setSearchIdx((i) => (i > 0 ? i - 1 : searchMatches.length - 1))} disabled={searchMatches.length === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30 outline-none">
                    <ChevronUp className="w-4 h-4 text-foreground/70" />
                  </button>
                </Tip>
                <Tip label="Next match" side="bottom">
                  <button onClick={() => setSearchIdx((i) => (i < searchMatches.length - 1 ? i + 1 : 0))} disabled={searchMatches.length === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30 outline-none">
                    <ChevronDown className="w-4 h-4 text-foreground/70" />
                  </button>
                </Tip>
                <Tip label="Close search" side="bottom">
                  <button onClick={() => { setSearchOpen(false); setSearchTerm(""); }} className="p-1 rounded hover:bg-muted outline-none">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </Tip>
              </div>
            )}

            {/* ── Message timeline ── */}
            <div ref={bodyRef} className="flex-1 overflow-auto px-4 pt-5 pb-10 flex flex-col">
              {messagesQuery.isFetchingNextPage && (
                <p className="text-center text-xs text-muted-foreground my-2">Loading older messages...</p>
              )}
              <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() + 40 }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const it = timeline[virtualRow.index];
                  const content = (() => {
                    if (it.kind === "date") return (
                      <div className="flex items-center gap-3 py-1">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[11px] font-semibold text-muted-foreground bg-card px-3 py-1 rounded-full border border-border shadow-xs">
                          {it.label}
                        </span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    );
                    if (it.kind === "note") return (
                      <div className="ml-auto max-w-[72%] rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 shadow-xs">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Lock className="w-3 h-3 text-amber-700" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Internal note</span>
                        </div>
                        <p className="text-sm text-foreground">{it.n.body}</p>
                        <p className="text-xs text-muted-foreground mt-1">{it.n.author || "Unknown"} - {fmtTime(it.n.created_at)}</p>
                      </div>
                    );
                    return (
                      <MessageBubble
                        m={it.m}
                        active={active}
                        onPreviewMedia={(url, type) => setPreviewMedia({ url, type })}
                        conversationId={active.id}
                        onCopyText={onCopyText}
                        onUseInComposer={(t) => setDraft(t)}
                        onForward={onForward}
                      />
                    );
                  })();
                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className={`absolute top-0 left-0 w-full pt-[3px] ${virtualRow.index === timeline.length - 1 ? 'pb-[40px]' : 'pb-[3px]'}`}
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Composer ── */}
            <Composer
              draft={draft} setDraft={setDraft}
              tab={tab} setTab={setTab}
              quickReplies={quickReplies}
              pendingFiles={pendingFiles} pendingPreviews={pendingPreviews}
              fileRef={fileRef} onFile={onFile} cancelSendFile={cancelSendFile}
              removePendingFile={removePendingFile}
              busy={busy} onSubmit={onSubmit} onSendVoice={onSendVoice} notify={notify}
              windowExpired={active?.channel === "whatsapp" && !!active?.last_message_at && (Date.now() - new Date(active.last_message_at).getTime() > 24 * 60 * 60 * 1000)}
              phone={active?.contact_phone}
              conversationId={active?.id}
              callingEnabled={active?.calling_enabled}
              aiSummary={active?.lead_summary}
            />
          </>
        )}
      </div>

      {/* ── Lost / Spam reason picker (FR-34) ── */}
      <LostReasonDialog
        open={outcomeOpen}
        onClose={() => setOutcomeOpen(false)}
        onSubmit={(reason, category) => {
          if (!active) { setOutcomeOpen(false); return; }
          if (category === "spam") {
            const spam = dispositions.find((d) => d.category === "spam");
            if (spam) onOverride({ disposition_id: spam.id, lost_reason: reason }, "Marked as spam");
            else { onOverride({ lost_reason: reason }, "Spam reason saved"); notify("Spam disposition missing", "warning"); }
          } else {
            // Lost is a disposition (category 'lost'), not a pipeline stage.
            const lost = dispositions.find((d) => d.name?.toLowerCase() === "lost") || dispositions.find((d) => d.category === "lost");
            if (lost) onOverride({ disposition_id: lost.id, lost_reason: reason }, "Marked as lost");
            else { onOverride({ lost_reason: reason }, "Lost reason saved"); notify("Lost disposition missing", "warning"); }
          }
          setOutcomeOpen(false);
        }}
      />

      {/* ── Media Preview Modal ── */}
      {previewMedia && <MediaPreview media={previewMedia} onClose={() => setPreviewMedia(null)} />}
    </>
  );
}
