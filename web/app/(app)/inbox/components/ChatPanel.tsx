"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  MessageSquare, ChevronRight, ChevronLeft, Check, Copy, X, Search,
  CheckCircle, RotateCcw, PanelRight, Lock, ChevronUp, ChevronDown,
  Download, XCircle, User, FileText, Video, Clock,
} from "lucide-react";
import { cn, fmtTime, initials, channelColor, channelTextColor } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";
import type { Agent, Conversation, Disposition, InternalNote, QuickReply, Stage, Message } from "@/lib/types";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { UseInfiniteQueryResult } from "@tanstack/react-query";
import MessageBubble, { rewriteLocalMedia } from "./MessageBubble";
import Composer from "./Composer";
import LostReasonDialog from "./LostReasonDialog";
import CallOverlay from "./CallOverlay";
import { api } from "@/lib/api";

// Snooze quick presets, computed at click time.
function snoozePresets(): { label: string; until: Date }[] {
  const now = new Date();
  const plus = (h: number) => new Date(now.getTime() + h * 3600 * 1000);
  const tomorrow9 = new Date(now); tomorrow9.setDate(now.getDate() + 1); tomorrow9.setHours(9, 0, 0, 0);
  const nextMon = new Date(now); const add = ((8 - nextMon.getDay()) % 7) || 7; nextMon.setDate(now.getDate() + add); nextMon.setHours(9, 0, 0, 0);
  return [
    { label: "1 hour", until: plus(1) },
    { label: "3 hours", until: plus(3) },
    { label: "Tomorrow 9:00", until: tomorrow9 },
    { label: "Next Monday", until: nextMon },
  ];
}

// --- Timeline types (shared with page.tsx) ---
export type Item =
  | { kind: "date"; key: string; label: string }
  | { kind: "msg"; key: string; m: Message }
  | { kind: "note"; key: string; n: InternalNote };

// --- Stage color map (semantic data colors) ---
// Sales funnel colors (must match the dashboard's FUNNEL_COLORS order):
// New Lead -> Contacted -> Qualified -> Appointment -> Negotiation -> Purchase.
const stageColorMap: Record<string, string> = {
  new_lead: "#6366F1", "new lead": "#6366F1",
  contacted: "#0EA5E9",
  qualified: "#14B8A6",
  appointment: "#8B5CF6",
  negotiation: "#F59E0B",
  purchase: "#16A34A",
  // legacy aliases (pre-rename) so old data still colors sensibly
  test_drive: "#F59E0B", "test drive": "#F59E0B",
  booking: "#16A34A",
};
function getDotColor(name: string): string {
  return stageColorMap[name.toLowerCase()] || stageColorMap[name.toLowerCase().replace(/\s+/g, "_")] || "#64748B";
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

// --- Media kind helper (shared by the gallery + the media list) ---
function mediaKind(m: Message): "image" | "video" | "document" | null {
  if (!m.media_url) return null;
  if (m.type === "sticker" || m.type === "audio" || m.type === "call") return null;
  const ext = (m.media_url.split("?")[0].split(".").pop() || "").toLowerCase();
  if (["ogg", "mp3", "wav", "aac", "m4a", "opus"].includes(ext)) return null;
  if (m.type === "image" || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "image";
  if (m.type === "video" || ["mp4", "mov", "webm", "avi", "mkv"].includes(ext)) return "video";
  return "document";
}

// --- WhatsApp-style media gallery: slide through all media in the conversation ---
function MediaGallery({ messages, currentId, active, onClose, onNavigate }: {
  messages: Message[]; currentId: string; active: Conversation | null;
  onClose: () => void; onNavigate: (id: string) => void;
}) {
  const index = messages.findIndex((m) => m.id === currentId);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) onNavigate(messages[index - 1].id);
      else if (e.key === "ArrowRight" && index < messages.length - 1) onNavigate(messages[index + 1].id);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [index, messages, onClose, onNavigate]);

  const cur = messages[index];
  if (!cur) return null;
  const url = rewriteLocalMedia(cur.media_url || "");
  const kind = mediaKind(cur);
  const who = cur.direction === "inbound" ? (active?.contact_name || active?.contact_phone || "Contact") : "You";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0B141A]/96 backdrop-blur-sm animate-fade-in">
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-5 py-3 bg-gradient-to-b from-black/60 to-transparent">
        <div className="min-w-0">
          <p className="text-white text-[13px] font-semibold truncate">{who}</p>
          <p className="text-white/55 text-[11px]">{fmtTime(cur.created_at)} · {index + 1} of {messages.length}</p>
        </div>
        <div className="flex items-center gap-1">
          <Tip label="Download" side="bottom">
            <a href={url} download target="_blank" rel="noreferrer" className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors outline-none">
              <Download className="w-5 h-5" />
            </a>
          </Tip>
          <Tip label="Close" side="bottom">
            <button onClick={onClose} className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors outline-none">
              <X className="w-6 h-6" />
            </button>
          </Tip>
        </div>
      </div>

      {/* Main viewer */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-16 pt-16 pb-28 relative" onClick={onClose}>
        {index > 0 && (
          <button onClick={(e) => { e.stopPropagation(); onNavigate(messages[index - 1].id); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/40 hover:bg-black/70 text-white z-10 transition-colors">
            <ChevronLeft className="w-7 h-7" />
          </button>
        )}
        <div className="max-w-full max-h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          {kind === "image" ? (
            <img src={url} className="max-w-full max-h-[80vh] object-contain rounded-md select-none" alt="Preview" />
          ) : kind === "video" ? (
            <video key={url} src={url} controls autoPlay className="max-w-full max-h-[80vh] object-contain rounded-md outline-none" />
          ) : (
            <div className="w-[min(90vw,900px)] h-[80vh] bg-white rounded-lg overflow-hidden">
              <iframe src={url} className="w-full h-full border-none" title="Document preview" />
            </div>
          )}
        </div>
        {index < messages.length - 1 && (
          <button onClick={(e) => { e.stopPropagation(); onNavigate(messages[index + 1].id); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/40 hover:bg-black/70 text-white z-10 transition-colors">
            <ChevronRight className="w-7 h-7" />
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {messages.length > 1 && (
        <div className="absolute bottom-0 inset-x-0 z-20 bg-black/40 backdrop-blur-md py-3 flex justify-center">
          <div className="flex gap-2 overflow-x-auto max-w-full px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {messages.map((m) => {
              const k = mediaKind(m);
              const tUrl = rewriteLocalMedia(m.media_url || "");
              const sel = m.id === currentId;
              return (
                <button key={m.id} onClick={() => onNavigate(m.id)}
                  className={cn("w-14 h-14 shrink-0 rounded-lg overflow-hidden border-2 transition-all", sel ? "border-primary scale-105" : "border-transparent opacity-55 hover:opacity-100")}>
                  {k === "image" ? (
                    <img src={tUrl} className="w-full h-full object-cover" alt="" />
                  ) : k === "video" ? (
                    <div className="relative w-full h-full bg-black">
                      <video src={tUrl + "#t=0.1"} preload="metadata" className="w-full h-full object-cover" />
                      <Video className="w-3.5 h-3.5 text-white absolute bottom-1 left-1 drop-shadow" />
                    </div>
                  ) : (
                    <div className="w-full h-full bg-slate-100 grid place-items-center"><FileText className="w-5 h-5 text-slate-500" /></div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_CHIP: Record<string, string> = {
  open: "bg-success/10 text-success",
  snoozed: "bg-warm-bg text-warm",
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
  agents?: Agent[]; // roster for the (re)assign dropdown
  canAssign?: boolean; // owner/admin/manager: may (re)assign / unassign
  onReassign?: (agentId: string) => void;
  onUnassign?: () => void;
  onSnooze?: (untilISO: string) => void;
  onForward?: (text: string) => void;
  uploadProgress?: number | null; // 0-100 while an attachment uploads
  onAddNote?: (body: string) => Promise<void>; // post an internal note (AI Smart Summary -> Confirm)
}

export default function ChatPanel({
  active, timeline, messagesQuery, bodyRef, rowVirtualizer,
  stages, dispositions,
  onStageChange, onOverride, onResolve, onReopen, onCopyText,
  draft, setDraft, tab, setTab, quickReplies,
  pendingFiles, pendingPreviews, fileRef, onFile, cancelSendFile, removePendingFile,
  busy, onSubmit, onSendVoice, showDetails, onToggleDetails, notify, showAgent, onForward,
  agents, canAssign, onReassign, onUnassign, onSnooze,
  uploadProgress, onAddNote,
}: ChatPanelProps) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignQuery, setAssignQuery] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [customSnooze, setCustomSnooze] = useState("");
  const [closeStageOpen, setCloseStageOpen] = useState(false);
  const [closeStageId, setCloseStageId] = useState("");
  const doSnooze = (d: Date) => { onSnooze?.(d.toISOString()); setSnoozeOpen(false); };
  const [previewMediaId, setPreviewMediaId] = useState<string | null>(null);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [activeCallStatus, setActiveCallStatus] = useState<string>("requesting");

  // All media messages in this conversation, in timeline order, for the slideable gallery.
  const mediaMessages = useMemo(
    () => timeline.filter((i): i is Extract<Item, { kind: "msg" }> => i.kind === "msg" && !!mediaKind(i.m)).map((i) => i.m),
    [timeline],
  );

  // ── WhatsApp Business Calling API ──
  const handleRequestCall = useCallback(async () => {
    if (!active) return;
    try {
      const res = await api.requestCallPermission(active.id);
      setActiveCallStatus(res.status === "granted" ? "granted" : "requesting");
      setActiveCallId(res.call_id);
      notify(res.status === "granted" ? "Customer already allowed calls, you can call now" : "Call permission request sent", "info");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to request call";
      notify(msg, "error");
    }
  }, [active, notify]);

  // Clear call when switching conversations
  useEffect(() => { setActiveCallId(null); }, [active?.id]);

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
              {/* Contact avatar */}
              <div
                className="w-9 h-9 rounded-full grid place-items-center text-[13px] font-semibold shrink-0"
                style={{ backgroundColor: channelColor(active.channel) + "14", color: channelTextColor(active.channel) }}
              >
                {initials(active.contact_name || active.contact_phone)}
              </div>
              {/* Contact name + phone (left) */}
              <div className="min-w-0 mr-2">
                <p className="text-[16px] font-bold text-foreground truncate leading-tight">
                  {active.contact_name || active.contact_phone || "Unknown"}
                </p>
                {active.contact_phone && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[12.5px] text-muted-foreground tabular-nums">{active.contact_phone}</span>
                    <button aria-label="Copy phone number" onClick={() => onCopyText(active.contact_phone!)} className="p-0.5 outline-none text-primary/70 hover:text-primary">
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

              {/* Assigned agent (manager/admin) — clickable to (re)assign / unassign */}
              {showAgent && (canAssign ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAssignOpen((v) => !v)}
                    className={cn("inline-flex items-center gap-1 px-2 h-6 rounded-md text-[11px] font-semibold max-w-[170px] outline-none transition-colors", active.agent_name ? "bg-muted text-muted-foreground hover:bg-muted/70" : "bg-amber-50 text-amber-700 hover:bg-amber-100")}
                  >
                    <User className="w-3 h-3 shrink-0" />
                    <span className="truncate">{active.agent_name || "Unassigned"}</span>
                    <ChevronDown className={cn("w-3 h-3 shrink-0 opacity-60 transition-transform", assignOpen && "rotate-180")} />
                  </button>
                  {assignOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setAssignOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 z-50 w-60 max-h-[340px] flex flex-col rounded-lg border border-border bg-popover shadow-xl animate-scale-in">
                        <div className="p-2 border-b border-border shrink-0">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                            <input autoFocus value={assignQuery} onChange={(e) => setAssignQuery(e.target.value)} placeholder="Search name or email..."
                              className="w-full h-8 pl-8 pr-2 rounded-md border border-input bg-background text-[13px] outline-none focus:border-primary" />
                          </div>
                        </div>
                        <div className="overflow-auto py-1 flex-1 min-h-0">
                          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Assign to</p>
                          {(() => {
                            const q = assignQuery.trim().toLowerCase();
                            const matches = (agents || []).filter((ag) => ag.full_name.toLowerCase().includes(q) || (ag.email || "").toLowerCase().includes(q));
                            if (matches.length === 0) return <p className="text-center text-xs text-muted-foreground py-3">No agents</p>;
                            return matches.map((ag) => (
                              <button
                                key={ag.id}
                                type="button"
                                onClick={() => { onReassign?.(ag.id); setAssignOpen(false); setAssignQuery(""); }}
                                className={cn("w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-muted outline-none", ag.id === active.assigned_agent_id ? "bg-primary/[0.04]" : "")}
                              >
                                <User className={cn("w-3.5 h-3.5 shrink-0", ag.id === active.assigned_agent_id ? "text-primary" : "opacity-70")} />
                                <div className="min-w-0 flex-1">
                                  <p className={cn("text-[13px] truncate", ag.id === active.assigned_agent_id ? "text-primary font-semibold" : "text-foreground/90")}>{ag.full_name}</p>
                                  {ag.email && <p className="text-[11px] text-muted-foreground truncate">{ag.email}</p>}
                                </div>
                                {ag.id === active.assigned_agent_id && <Check className="w-3.5 h-3.5 shrink-0 text-primary" />}
                              </button>
                            ));
                          })()}
                          {active.assigned_agent_id && (
                            <>
                              <div className="my-1 border-t border-border" />
                              <button
                                type="button"
                                onClick={() => { onUnassign?.(); setAssignOpen(false); setAssignQuery(""); }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left text-amber-700 hover:bg-amber-50 outline-none"
                              >
                                <XCircle className="w-3.5 h-3.5 shrink-0" />Unassign
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <span className={cn("inline-flex items-center gap-1 px-2 h-6 rounded-md text-[11px] font-semibold max-w-[150px]", active.agent_name ? "bg-muted text-muted-foreground" : "bg-amber-50 text-amber-700")}>
                  <User className="w-3 h-3 shrink-0" />
                  <span className="truncate">{active.agent_name || "Unassigned"}</span>
                </span>
              ))}

              {/* Status action dropdown: Open / Snooze / Closed */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setStatusOpen((v) => !v)}
                  className={cn("inline-flex items-center gap-1 px-2.5 h-7 rounded-md text-[11px] font-semibold capitalize outline-none transition-opacity hover:opacity-90", STATUS_CHIP[active.status] ?? STATUS_CHIP.closed)}
                >
                  {active.status}
                  <ChevronDown className={cn("w-3 h-3 transition-transform", statusOpen && "rotate-180")} />
                </button>
                {statusOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setStatusOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-40 rounded-lg border border-border bg-popover shadow-xl py-1 animate-scale-in">
                      <button type="button" onClick={() => { setStatusOpen(false); if (active.status !== "open") onReopen(); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left hover:bg-muted outline-none">
                        <RotateCcw className="w-3.5 h-3.5 text-primary" />Open
                      </button>
                      <button type="button" onClick={() => { setStatusOpen(false); setSnoozeOpen(true); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left hover:bg-muted outline-none">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />Snooze
                      </button>
                      <button type="button" onClick={() => { setStatusOpen(false); setCloseStageId(active.stage_id || ""); setCloseStageOpen(true); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left hover:bg-muted outline-none">
                        <CheckCircle className="w-3.5 h-3.5 text-success" />Closed
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Snooze picker */}
              {snoozeOpen && (
                <div className="fixed inset-0 z-[60] grid place-items-center">
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={() => setSnoozeOpen(false)} />
                  <div className="relative bg-card rounded-xl border border-border shadow-2xl w-full max-w-xs p-5 animate-scale-in">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[15px] font-bold text-foreground flex items-center gap-2"><Clock className="w-4 h-4 text-amber-600" />Snooze until</h3>
                      <button onClick={() => setSnoozeOpen(false)} className="p-1 rounded-md text-muted-foreground hover:bg-muted outline-none"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {snoozePresets().map((p) => (
                        <button key={p.label} onClick={() => doSnooze(p.until)}
                          className="px-3 py-2 rounded-lg border border-border text-[13px] font-medium text-foreground/90 hover:border-primary/40 hover:bg-muted outline-none transition-colors">{p.label}</button>
                      ))}
                    </div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Custom date &amp; time</label>
                    <div className="flex gap-2">
                      <input type="datetime-local" value={customSnooze} onChange={(e) => setCustomSnooze(e.target.value)}
                        className="flex-1 min-w-0 h-9 px-3 rounded-md border border-input bg-background text-[13px] outline-none focus:border-primary" />
                      <button disabled={!customSnooze} onClick={() => { if (customSnooze) doSnooze(new Date(customSnooze)); }}
                        className="px-3 h-9 rounded-md bg-primary text-white text-[13px] font-semibold disabled:opacity-50 outline-none">Set</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Force final stage before closing */}
              {closeStageOpen && (
                <div className="fixed inset-0 z-[60] grid place-items-center">
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={() => setCloseStageOpen(false)} />
                  <div className="relative bg-card rounded-xl border border-border shadow-2xl w-full max-w-sm p-5 animate-scale-in">
                    <h3 className="text-[15px] font-bold text-foreground mb-1">Close conversation</h3>
                    <p className="text-[12.5px] text-muted-foreground mb-4">Pick the final stage for this lead before closing.</p>
                    <div className="space-y-1.5 max-h-[260px] overflow-auto mb-4">
                      {stages.map((st) => (
                        <button key={st.id} onClick={() => setCloseStageId(st.id)}
                          className={cn("w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-[13px] text-left outline-none transition-colors",
                            closeStageId === st.id ? "border-primary bg-primary/5 text-foreground font-semibold" : "border-border hover:bg-muted text-foreground/90")}>
                          <span className="flex-1 truncate">{st.name}</span>
                          {closeStageId === st.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setCloseStageOpen(false)} className="px-4 h-9 rounded-md border border-border text-[13px] font-semibold text-foreground/80 hover:bg-muted outline-none">Cancel</button>
                      <button disabled={!closeStageId} onClick={() => { onStageChange(closeStageId); onResolve(); setCloseStageOpen(false); }}
                        className="px-4 h-9 rounded-md bg-primary text-white text-[13px] font-semibold disabled:opacity-50 outline-none inline-flex items-center gap-1.5"><CheckCircle className="w-4 h-4" />Close</button>
                    </div>
                  </div>
                </div>
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
                  const prev = virtualRow.index > 0 ? timeline[virtualRow.index - 1] : undefined;
                  // Group back-to-back messages from the same sender (within 5 min):
                  // the continuation hides its avatar + name and sits tight.
                  const grouped = it.kind === "msg" && prev?.kind === "msg"
                    && it.m.type !== "call" && prev.m.type !== "call"
                    && it.m.direction === prev.m.direction
                    && it.m.sender_type === prev.m.sender_type
                    && (new Date(it.m.created_at).getTime() - new Date(prev.m.created_at).getTime() < 5 * 60 * 1000);
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
                        <p className="text-sm text-foreground whitespace-pre-line">{it.n.body}</p>
                        <p className="text-xs text-muted-foreground mt-1">{it.n.author || "Unknown"} - {fmtTime(it.n.created_at)}</p>
                      </div>
                    );
                    return (
                      <MessageBubble
                        m={it.m}
                        active={active}
                        grouped={grouped}
                        onPreviewMedia={(id) => setPreviewMediaId(id)}
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
                      className={`absolute top-0 left-0 w-full ${it.kind === "msg" && grouped ? 'pt-[2px]' : 'pt-[11px]'} ${virtualRow.index === timeline.length - 1 ? 'pb-[40px]' : 'pb-[2px]'}`}
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
              onRequestCall={handleRequestCall}
              aiSummary={active?.lead_summary}
              uploadProgress={uploadProgress}
              onAddNote={onAddNote}
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

      {/* ── Media Gallery (WhatsApp-style slideable preview) ── */}
      {previewMediaId && mediaMessages.length > 0 && (
        <MediaGallery
          messages={mediaMessages}
          currentId={previewMediaId}
          active={active}
          onClose={() => setPreviewMediaId(null)}
          onNavigate={setPreviewMediaId}
        />
      )}

      {/* ── WhatsApp Business Call Overlay ── */}
      {activeCallId && active && (
        <CallOverlay
          callId={activeCallId}
          conversationId={active.id}
          contactName={active.contact_name}
          contactPhone={active.contact_phone}
          onClose={() => setActiveCallId(null)}
          notify={notify}
          initialStatus={activeCallStatus}
        />
      )}
    </>
  );
}
