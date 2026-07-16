"use client";
import { useI18n } from "@/lib/i18n";
import { useState, useRef, useEffect, useCallback } from "react";
import { Smile, Paperclip, Zap, Send, Lock, X, FileText, Loader2, Clock, Phone, Mic, Trash2, Pause, Play, Sparkles, RefreshCw, Check, Plus } from "lucide-react";
import EmojiPicker from "emoji-picker-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Tip } from "@/components/ui/tooltip";
import TemplateWizard from "./TemplateWizard";
import { AiStatusBadge } from "./AiStatusBadge";
import type { QuickReply, Template } from "@/lib/types";

interface ComposerProps {
  draft: string;
  setDraft: (v: string | ((d: string) => string)) => void;
  tab: number;                 // 0 = reply, 1 = internal note
  setTab: (n: number) => void;
  quickReplies: QuickReply[];
  pendingFiles: File[];
  pendingPreviews: (string | null)[];
  fileRef: React.RefObject<HTMLInputElement>;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  cancelSendFile: () => void;
  removePendingFile: (index: number) => void;
  busy: boolean;
  onSubmit: () => void;        // routes file vs text vs note internally
  notify: (msg: string, severity?: "success" | "info" | "warning" | "error") => void;
  onSendVoice: (blob: Blob) => Promise<void>;
  windowExpired?: boolean;     // WhatsApp 24h window closed
  phone?: string | null;       // Contact phone for call button
  conversationId?: string | null; // For call tracking API
  callingEnabled?: boolean;    // channel has WhatsApp calling enabled -> show call button
  onRequestCall?: () => void;  // WhatsApp Business Calling API: request call permission
  // Simpuler (AI) briefing — last persisted text seeds the summary; regenerated on demand.
  aiSummary?: string | null;
  uploadProgress?: number | null; // 0-100 while an attachment uploads
  onAddNote?: (body: string) => Promise<void>; // AI Smart Summary -> Confirm posts a note
  smartSummaryEnabled?: boolean;               // per-campaign toggle; hides the button when false
  aiThinking?: boolean;                          // Simpuler is drafting a reply (WS-C)
  isBotActive?: boolean;                         // Simpuler currently auto-replies to this chat
  agentName?: string | null;                     // assigned agent (for "Manual · {name}")
  onToggleBot?: (active: boolean) => void;       // AI takeover (false) / hand back to Simpuler (true)
  canHandBack?: boolean;                         // false once an agent replied (AI can't come back)
}

export default function Composer({
  draft, setDraft, tab, setTab, quickReplies,
  pendingFiles, pendingPreviews, fileRef, onFile, cancelSendFile, removePendingFile,
  busy, onSubmit, notify, onSendVoice, windowExpired, phone, conversationId, callingEnabled, onRequestCall,
  aiSummary, uploadProgress, onAddNote, smartSummaryEnabled = true, aiThinking,
  isBotActive, agentName, onToggleBot, canHandBack = true,
}: ComposerProps) {
  const { t } = useI18n();
  const [showQR, setShowQR] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // WhatsApp templates (approved only) the agent can drop into the message box.
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  useEffect(() => { api.listTemplates().then((t) => setTemplates((t || []).filter((x) => x.status === "APPROVED"))).catch(() => {}); }, []);

  // Per-account quick replies (shortcuts). Each user manages their own set.
  const [qrList, setQrList] = useState<QuickReply[]>(quickReplies);
  const loadQR = useCallback(() => { api.listQuickReplies().then((r) => setQrList(r || [])).catch(() => {}); }, []);
  useEffect(() => { loadQR(); }, [loadQR]);
  const [qrForm, setQrForm] = useState<{ shortcut: string; title: string; body: string } | null>(null);
  async function saveQR() {
    if (!qrForm || !qrForm.shortcut.trim() || !qrForm.body.trim()) { notify(t("inbox.shortcutAndMessageAreRequired"), "warning"); return; }
    const sc = qrForm.shortcut.trim().startsWith("/") ? qrForm.shortcut.trim() : "/" + qrForm.shortcut.trim();
    try { await api.createQuickReply(sc, qrForm.title.trim() || sc, qrForm.body.trim()); setQrForm(null); loadQR(); notify(t("inbox.shortcutSaved")); }
    catch (e) { notify(e instanceof Error ? e.message : t("inbox.couldNotSave"), "error"); }
  }
  // Inline "/code" autocomplete: the last token starting with "/" filters shortcuts.
  const slashMatch = draft.match(/(?:^|\s)(\/[^\s]*)$/)?.[1] || null;
  const slashResults = slashMatch !== null ? qrList.filter((q) => q.shortcut.toLowerCase().startsWith(slashMatch.toLowerCase())) : [];
  const applySlash = (q: QuickReply) => {
    setDraft((d) => { const m = d.match(/(?:^|\s)(\/[^\s]*)$/); return m ? d.slice(0, d.length - m[1].length) + q.body : d + q.body; });
    setTimeout(() => textareaRef.current?.focus(), 0);
  };
  // ── Composer link preview (WhatsApp-style): pasting a URL shows a
  // dismissible OG card above the input while you type. ──
  const [linkPrev, setLinkPrev] = useState<{ url: string; title?: string; description?: string; image?: string; site_name?: string } | null>(null);
  const [linkPrevDismissed, setLinkPrevDismissed] = useState<string | null>(null);
  useEffect(() => {
    const url = tab === 0 ? draft.match(/(?:https?:\/\/|www\.)[^\s<>"']+/i)?.[0] : undefined;
    if (!url) { setLinkPrev(null); setLinkPrevDismissed(null); return; }
    if (linkPrevDismissed === url || linkPrev?.url === url) return;
    const t = setTimeout(() => {
      const target = url.startsWith("http") ? url : `https://${url}`;
      api.linkPreview(target)
        .then((d) => { if (d && (d.title || d.image)) setLinkPrev({ ...d, url }); else setLinkPrev(null); })
        .catch(() => setLinkPrev(null));
    }, 450);
    return () => clearTimeout(t);
  }, [draft, tab, linkPrevDismissed, linkPrev?.url]);
  useEffect(() => { setLinkPrev(null); setLinkPrevDismissed(null); }, [conversationId]);

  // Focus the message box when a conversation opens (cursor ready to type).
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!conversationId) return;
    const t = setTimeout(() => textareaRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [conversationId]);

  // ── Smart Summary (Internal note tab only) ──
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiState, setAiState] = useState<"idle" | "streaming" | "done" | "error">("idle");
  const [aiConfirmed, setAiConfirmed] = useState(false); // drives the submit gesture
  const aiAbortRef = useRef<AbortController | null>(null);

  // Switching conversation resets the assistant + aborts any in-flight stream.
  useEffect(() => {
    aiAbortRef.current?.abort();
    setAiOpen(false); setAiText(""); setAiState("idle"); setAiConfirmed(false);
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Switching to Reply tab closes the AI panel (Smart Reply removed).
  useEffect(() => {
    if (tab === 0 && aiOpen) {
      aiAbortRef.current?.abort();
      setAiOpen(false); setAiText(""); setAiState("idle"); setAiConfirmed(false);
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => aiAbortRef.current?.abort(), []);

  const generateAI = useCallback(async () => {
    if (!conversationId) return;
    aiAbortRef.current?.abort();
    const ctrl = new AbortController();
    aiAbortRef.current = ctrl;
    setAiText(""); setAiState("streaming"); setAiConfirmed(false);
    const stream = api.streamSummary;
    try {
      await stream(conversationId, (t) => setAiText((p) => p + t), ctrl.signal);
      setAiState("done");
    } catch {
      if (ctrl.signal.aborted) return;
      setAiState("error");
    }
  }, [conversationId]);

  const openAI = () => {
    const next = !aiOpen;
    setAiOpen(next);
    if (!next || aiText || aiState === "streaming") return;
    // Summary reuses the last persisted briefing (saves a call).
    if (aiSummary) { setAiText(aiSummary); setAiState("done"); }
    else generateAI();
  };

  const summaryBullets = (t: string) => t
    .replace(/\s*[—–]\s*/g, ", ")
    .split("\n")
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);

  const confirmAI = async () => {
    if (aiState !== "done" || !aiText.trim()) return;
    const body = summaryBullets(aiText).map((b) => "• " + b).join("\n");
    if (!body) return;
    setAiConfirmed(true);
    try {
      if (onAddNote) await onAddNote(body);
      setTimeout(() => { setAiOpen(false); setAiConfirmed(false); }, 420);
    } catch {
      setAiConfirmed(false);
      notify(t("contacts.couldNotAddNote"), "error");
    }
  };

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // Live waveform (real mic amplitude, not a static fake).
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      // Tap the live mic stream with an analyser (not routed to output -> no feedback).
      try {
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        ctx.createMediaStreamSource(stream).connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
      } catch { /* waveform is best-effort */ }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start();
      setIsRecording(true);
      setIsPaused(false);
      setRecordTime(0);

      timerRef.current = setInterval(() => {
        setRecordTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied:", err);
      notify(t("inbox.pleaseAllowMicrophoneAccessTo"), "error");
    }
  };

  const stopAndSendRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = () => {
        const type = mediaRecorderRef.current?.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type });
        onSendVoice(blob);
        cleanupRecording();
      };
      mediaRecorderRef.current.stop();
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = null; // Prevent sending
      mediaRecorderRef.current.stop();
    }
    cleanupRecording();
  };

  const cleanupRecording = () => {
    setIsRecording(false);
    setIsPaused(false);
    setRecordTime(0);
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;
    }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    analyserRef.current = null;
    audioChunksRef.current = [];
  };

  // Draw the live waveform while recording (paused => flat line).
  useEffect(() => {
    if (!isRecording) return;
    let raf = 0;
    const BARS = 28;
    const draw = () => {
      const canvas = canvasRef.current;
      const analyser = analyserRef.current;
      const g = canvas?.getContext("2d");
      if (canvas && analyser && g) {
        const w = canvas.width, h = canvas.height;
        const bins = analyser.frequencyBinCount;
        const data = new Uint8Array(bins);
        analyser.getByteFrequencyData(data);
        g.clearRect(0, 0, w, h);
        const step = Math.max(1, Math.floor(bins / BARS));
        const bw = w / BARS;
        for (let i = 0; i < BARS; i++) {
          const v = isPaused ? 0 : data[i * step] / 255;
          const bh = Math.max(3, v * (h - 4));
          const x = i * bw + bw * 0.25;
          const y = (h - bh) / 2;
          g.fillStyle = isPaused ? "#CBD5E1" : "#0E5B54";
          if (g.roundRect) { g.beginPath(); g.roundRect(x, y, bw * 0.5, bh, 2); g.fill(); }
          else g.fillRect(x, y, bw * 0.5, bh);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [isRecording, isPaused]);

  const togglePause = () => {
    if (mediaRecorderRef.current) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
        timerRef.current = setInterval(() => setRecordTime((prev) => prev + 1), 1000);
      } else {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const note = tab === 1;

  return (
    <div className="px-4 pb-4">
      {/* Live Simpuler indicator (WS-C): shows while the bot drafts a reply. */}
      {aiThinking && (
        <div className="pb-1.5 pt-0.5 flex items-center justify-end gap-2 text-[12px] font-medium text-ai-text">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{t("inbox.simpulerIsTyping")}</span>
          <span className="flex gap-0.5">
            <span className="w-1 h-1 rounded-full bg-ai animate-bounce [animation-delay:-0.2s]" />
            <span className="w-1 h-1 rounded-full bg-ai animate-bounce [animation-delay:-0.1s]" />
            <span className="w-1 h-1 rounded-full bg-ai animate-bounce" />
          </span>
        </div>
      )}
      <div
        className={cn(
          "relative rounded-lg border shadow-sm transition-all",
          note
            ? "border-amber-200 bg-amber-50"
            : "border-border bg-card",
        )}
      >
        {/* Quick replies (per-account shortcuts) */}
        {showQR && (
          <div className="border-b border-border">
            <div className="max-h-[200px] overflow-auto">
              {qrList.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-muted-foreground text-center">{t("inbox.noShortcutsYetAddOne")}</p>
              ) : qrList.map((q) => (
                <div key={q.id} className="group/qr flex items-start gap-2 px-4 py-2.5 border-b border-border/60 hover:bg-muted">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setDraft(q.body); setShowQR(false); notify(`"${q.shortcut}" inserted`, "info"); }}>
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-primary/10 text-primary">{q.shortcut}</span>
                      <span className="text-xs font-semibold text-foreground truncate">{q.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{q.body}</p>
                  </div>
                  <button onClick={() => api.deleteQuickReply(q.id).then(loadQR).catch(() => {})} className="p-1 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover/qr:opacity-100 outline-none shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            {qrForm ? (
              <div className="p-3 bg-muted/40 border-t border-border space-y-2">
                <div className="flex gap-2">
                  <input value={qrForm.shortcut} onChange={(e) => setQrForm({ ...qrForm, shortcut: e.target.value })} placeholder="/shortcut" className="w-28 h-8 px-2 rounded-md border border-input bg-background text-[12px] outline-none focus:border-primary" />
                  <input value={qrForm.title} onChange={(e) => setQrForm({ ...qrForm, title: e.target.value })} placeholder={t("inbox.titleOptional")} className="flex-1 h-8 px-2 rounded-md border border-input bg-background text-[12px] outline-none focus:border-primary" />
                </div>
                <textarea value={qrForm.body} onChange={(e) => setQrForm({ ...qrForm, body: e.target.value })} placeholder={t("automation.messageText")} rows={2} className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-[12px] outline-none focus:border-primary resize-none" />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setQrForm(null)} className="px-2.5 h-7 rounded-md text-[12px] font-semibold text-muted-foreground hover:bg-muted outline-none">{t("common.cancel")}</button>
                  <button onClick={saveQR} className="px-3 h-7 rounded-md text-[12px] font-bold text-white bg-primary hover:bg-primary-dark outline-none">{t("common.save")}</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setQrForm({ shortcut: "", title: "", body: "" })} className="w-full flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-semibold text-primary hover:bg-muted outline-none border-t border-border">
                <Plus className="w-3.5 h-3.5" />{t("inbox.newShortcut")}
              </button>
            )}
          </div>
        )}

        {/* "/code" autocomplete (shows while typing a slash command) */}
        {slashResults.length > 0 && (
          <div className="absolute bottom-full left-2 right-2 mb-1 z-50 max-h-[220px] overflow-auto rounded-lg border border-border bg-popover shadow-xl">
            {slashResults.map((q) => (
              <button key={q.id} onClick={() => applySlash(q)} className="w-full text-left px-3 py-2 border-b border-border/60 last:border-0 hover:bg-muted outline-none">
                <div className="flex items-center gap-2"><span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary">{q.shortcut}</span><span className="text-xs font-semibold text-foreground truncate">{q.title}</span></div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{q.body}</p>
              </button>
            ))}
          </div>
        )}

        {/* WhatsApp template wizard */}
        {showTemplates && (
          <TemplateWizard templates={templates}
            onClose={() => setShowTemplates(false)}
            onUse={(text) => { setDraft(text); setShowTemplates(false); setTab(0); notify(t("inbox.templateInsertedReviewAndSend"), "info"); }} />
        )}

        {/* Tabs. Wrap on narrow (mobile) widths so the AI status / "Hand to
            Simpuler" chip drops to its own line instead of being clipped off-screen. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 pt-1.5">
          <button
            onClick={() => setTab(0)}
            className={cn("text-[13px] font-semibold pb-1 border-b-2 transition-colors outline-none", tab === 0 ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t("components.reply")}
          </button>
          <button
            onClick={() => setTab(1)}
            className={cn("text-[13px] font-semibold pb-1 border-b-2 transition-colors outline-none", tab === 1 ? "border-amber-700 text-amber-700" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t("components.internalNote")}
          </button>

          <div className="flex-1" />

          {/* Reply tab: AI handling indicator + one-click takeover (AI = indigo,
              human = petrol). Sits in the same top-right slot the old Smart Reply
              button used. Internal note tab: Smart Summary (unchanged). */}
          {!note && onToggleBot && (
            <div className="mb-1">
              <AiStatusBadge
                isBotActive={!!isBotActive}
                processing={aiThinking}
                agentName={agentName}
                busy={busy}
                canHandBack={canHandBack}
                onTakeOver={() => onToggleBot(false)}
                onRelease={() => onToggleBot(true)}
              />
            </div>
          )}

          {/* Smart Summary — Internal note tab only, and only if the campaign enables it */}
          {note && smartSummaryEnabled && (
            <button
              type="button"
              onClick={openAI}
              className={cn(
                "inline-flex items-center gap-1.5 h-6 px-2 mb-1 rounded-md text-[12px] font-semibold outline-none transition-colors",
                aiOpen ? "bg-amber-100 text-amber-800" : "text-amber-700 hover:bg-amber-100",
              )}
            >
              <Sparkles className={cn("w-3.5 h-3.5", aiState === "streaming" && "animate-pulse")} />
              {t("inbox.smartSummary")}
            </button>
          )}
        </div>

        {/* AI assistant card (streams a draft; Confirm submits with a gesture) */}
        {aiOpen && (
          <div className={cn(
            "mx-3 mt-2 rounded-xl border bg-card shadow-sm overflow-hidden transition-all duration-300 origin-bottom",
            "border-amber-200",
            aiConfirmed ? "opacity-0 -translate-y-2 scale-[0.97]" : "animate-scale-in",
          )}>
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-amber-200 bg-amber-50">
              <Sparkles className="w-4 h-4 text-amber-700" />
              <p className="text-[13px] font-bold text-foreground">{t("inbox.smartSummary")}</p>
              <div className="ml-auto flex items-center gap-0.5">
                {aiState !== "streaming" && (
                  <Tip label={t("inbox.regenerate")}>
                    <button onClick={generateAI} className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground outline-none">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </Tip>
                )}
                <button onClick={() => setAiOpen(false)} className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground outline-none">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="px-3.5 py-3 max-h-[200px] overflow-auto">
              {aiState === "streaming" && !aiText ? (
                <div>
                  <div className="flex items-center gap-1.5 text-primary mb-2.5">
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    <span className="text-[12px] font-semibold">{t("inbox.summarizingTheConversation")}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="h-2.5 rounded skeleton w-[92%]" />
                    <div className="h-2.5 rounded skeleton w-full" />
                    <div className="h-2.5 rounded skeleton w-[76%]" />
                  </div>
                </div>
              ) : aiState === "error" ? (
                <div className="py-2 text-center">
                  <p className="text-xs text-muted-foreground mb-2">{t("inbox.couldNotGenerateASummary")}</p>
                  <button onClick={generateAI} className="text-[12px] font-semibold text-primary hover:underline outline-none">{t("inbox.tryAgain")}</button>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {summaryBullets(aiText).map((line, i, arr) => {
                    const last = i === arr.length - 1;
                    const isAction = last && aiState !== "streaming";
                    return (
                      <li key={i} className="flex gap-2 text-xs leading-relaxed text-foreground/90 animate-bullet-in"
                        style={{ animationDelay: aiState === "streaming" ? "0ms" : `${Math.min(i, 6) * 45}ms` }}>
                        <span className={cn("mt-[6px] w-1.5 h-1.5 rounded-full shrink-0 transition-shadow duration-300",
                          isAction ? "bg-amber-500 shadow-[0_0_0_3px_rgba(245,166,35,0.18)]" : "bg-primary/60")} />
                        <span>{line}{aiState === "streaming" && last && <span className="inline-block w-[2px] h-3.5 ml-0.5 bg-primary/70 align-middle animate-pulse" />}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {aiState === "done" && aiText.trim() && (
              <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/30">
                <button onClick={() => { setAiText(""); setAiState("idle"); setAiOpen(false); }}
                  className="text-[12px] font-semibold text-muted-foreground hover:text-foreground outline-none">
                  {t("common.clear")}
                </button>
                <div className="flex-1" />
                <button onClick={confirmAI}
                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[12px] font-bold text-white bg-amber hover:bg-amber/90 outline-none transition-colors shadow-sm">
                  <Check className="w-3.5 h-3.5" />
                  {t("inbox.addAsNote")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 24h window warning */}
        {windowExpired && tab === 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200">
            <Clock className="w-4 h-4 text-red-700 shrink-0" />
            <p className="text-[12px] font-semibold text-red-700">
              {t("inbox.24HourWindowClosedOnly")}
            </p>
          </div>
        )}

        {/* Pending Files */}
        {pendingFiles && pendingFiles.length > 0 && (
          <div className="px-4 pt-4 flex gap-3 overflow-x-auto">
            {pendingFiles.map((file, i) => {
              const isVid = file.type.startsWith("video/");
              const mb = file.size / (1024 * 1024);
              const sizeLabel = mb >= 1 ? `${mb.toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`;
              return (
              <div key={i} className="flex-shrink-0 relative group flex items-center gap-3 p-3 bg-muted border border-border rounded-lg pr-12 min-w-[200px] max-w-[280px]">
                {pendingPreviews[i] ? (
                  <div className="w-10 h-10 rounded-md bg-card border border-border flex-shrink-0 flex items-center justify-center overflow-hidden relative">
                    {isVid ? (
                      <>
                        <video src={pendingPreviews[i]! + "#t=0.1"} preload="metadata" className="w-full h-full object-cover" />
                        <Play className="w-4 h-4 text-white absolute drop-shadow" fill="white" />
                      </>
                    ) : (
                      <img src={pendingPreviews[i]!} className="max-w-full max-h-full object-cover" alt="" />
                    )}
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-md bg-card border border-border flex items-center justify-center flex-shrink-0 text-muted-foreground">
                    <FileText className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">{file.name}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">{sizeLabel}</p>
                  {busy && typeof uploadProgress === "number" && (
                    <div className="mt-1.5 h-1 rounded-full bg-border overflow-hidden">
                      <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  )}
                </div>
                {!busy && (
                  <button
                    type="button"
                    onClick={() => removePendingFile(i)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-md transition-colors outline-none"
                  >
                    <X className="w-[18px] h-[18px]" />
                  </button>
                )}
              </div>
              );
            })}
          </div>
        )}

        {!isRecording && (
          <>
        {/* Link preview for a URL in the draft (WhatsApp style, dismissible) */}
        {tab === 0 && linkPrev && (
          <div className="mx-3 mt-2 flex items-stretch gap-0 rounded-lg overflow-hidden border border-border bg-muted/40">
            {linkPrev.image && (
              <img src={linkPrev.image} className="w-16 h-16 object-cover shrink-0" alt=""
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            )}
            <div className="flex-1 min-w-0 px-2.5 py-1.5">
              {linkPrev.title && <p className="text-[12.5px] font-bold text-foreground leading-tight line-clamp-2">{linkPrev.title}</p>}
              {(() => { try { return <p className="text-[11px] text-muted-foreground mt-0.5">{new URL(linkPrev.url.startsWith("http") ? linkPrev.url : `https://${linkPrev.url}`).hostname.replace(/^www\./, "")}</p>; } catch { return null; } })()}
            </div>
            <button
              type="button"
              onClick={() => { setLinkPrevDismissed(linkPrev.url); setLinkPrev(null); }}
              className="px-2 text-muted-foreground hover:text-foreground outline-none shrink-0"
              aria-label={t("inbox.removeLinkPreview")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          data-flat
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
          placeholder={note ? t("inbox.addAnInternalNoteVisible") : t("inbox.typeYourMessageHere")}
          className="block w-full border-none outline-none resize-none min-h-[56px] max-h-[150px] px-4 py-2 text-[13px] bg-transparent text-foreground placeholder:text-muted-foreground/70"
        />

        {/* Action row */}
        <div className="relative flex items-center gap-1 pl-3 pr-4 pb-3">
          {/* Emoji */}
          <Tip label={t("inbox.emoji")}>
            <button onClick={() => setEmojiOpen((v) => !v)} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors">
              <Smile className="w-[18px] h-[18px]" />
            </button>
          </Tip>
          {emojiOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setEmojiOpen(false)} />
              <div className="absolute bottom-full left-0 mb-2 z-50 rounded-lg overflow-hidden shadow-xl border border-border">
                <EmojiPicker
                  onEmojiClick={(e) => { setDraft((d) => d + e.emoji); setEmojiOpen(false); }}
                  searchDisabled={false}
                  skinTonesDisabled
                  lazyLoadEmojis
                />
              </div>
            </>
          )}

          <input ref={fileRef} type="file" multiple hidden onChange={onFile} />
          <Tip label={t("inbox.attachFile")}>
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none disabled:opacity-50 transition-colors">
              <Paperclip className="w-[18px] h-[18px]" />
            </button>
          </Tip>
          <Tip label={t("inbox.quickReplies")}>
            <button onClick={() => { setShowQR((v) => !v); setShowTemplates(false); }} className={cn("p-1.5 rounded-md hover:bg-muted outline-none transition-colors", showQR ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
              <Zap className="w-[18px] h-[18px]" />
            </button>
          </Tip>
          <Tip label={t("automation.sendTemplate")}>
            <button onClick={() => { setShowTemplates((v) => !v); setShowQR(false); }} className={cn("p-1.5 rounded-md hover:bg-muted outline-none transition-colors", showTemplates ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
              <FileText className="w-[18px] h-[18px]" />
            </button>
          </Tip>
          {phone && !note && callingEnabled && (
            <Tip label={t("inbox.callViaWhatsapp")}>
              <button
                onClick={() => {
                  if (onRequestCall) onRequestCall();
                }}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-primary outline-none transition-colors"
              >
                <Phone className="w-[18px] h-[18px]" />
              </button>
            </Tip>
          )}

          <div className="flex-1" />
          <span className="text-[11px] text-muted-foreground tabular-nums mr-1">{draft.length}/4096</span>

          {!note && (
            <Tip label={t("inbox.recordVoiceMessage")}>
              <button
                onClick={startRecording}
                disabled={busy}
                className="p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors mr-1"
              >
                <Mic className="w-5 h-5" />
              </button>
            </Tip>
          )}

          <button
            onClick={onSubmit}
            aria-label={note ? t("inbox.addInternalNote") : t("inbox.sendMessage")}
            disabled={busy || (!draft.trim() && pendingFiles.length === 0)}
            className={cn(
              "w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-white transition-colors disabled:opacity-50",
              note ? "bg-amber hover:bg-amber/90 shadow-sm" : "bg-primary hover:bg-primary-dark shadow-sm",
            )}
          >
            {busy ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : note ? <Lock className="w-[18px] h-[18px]" /> : <Send className="w-[18px] h-[18px]" />}
          </button>
        </div>
        </>
        )}

        {/* Recording UI - live mic waveform */}
        {isRecording && (
          <div className="flex items-center gap-3 px-3 py-2.5 min-h-[56px] bg-card rounded-lg">
            <Tip label={t("inbox.cancelRecording")}>
              <button
                onClick={cancelRecording}
                className="p-2 rounded-full text-muted-foreground hover:text-red-500 hover:bg-red-50 outline-none transition-colors shrink-0"
              >
                <Trash2 className="w-[18px] h-[18px]" />
              </button>
            </Tip>
            <div className="flex items-center gap-2 shrink-0">
              <span className={cn("w-2 h-2 rounded-full bg-red-500", !isPaused && "animate-pulse")} />
              <span className="text-[13px] font-semibold text-foreground/80 tabular-nums">{formatTime(recordTime)}</span>
            </div>
            <canvas ref={canvasRef} width={480} height={32} className="flex-1 min-w-0 h-8" />
            <Tip label={isPaused ? t("inbox.resumeRecording") : t("inbox.pauseRecording")}>
              <button
                onClick={togglePause}
                className="p-2 rounded-full text-foreground/70 hover:bg-muted outline-none transition-colors shrink-0"
              >
                {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
              </button>
            </Tip>
            <Tip label={t("inbox.sendVoiceMessage")}>
              <button
                onClick={stopAndSendRecording}
                disabled={busy}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-primary hover:bg-primary-dark text-white transition-colors disabled:opacity-50 outline-none shadow-sm shrink-0"
              >
                {busy ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <Send className="w-[18px] h-[18px]" />}
              </button>
            </Tip>
          </div>
        )}
      </div>
    </div>
  );
}
