"use client";
// ── Full inbox-grade chat popup ─────────────────────────────────────────────
// Shared overlay used by Contacts, System Logs and anywhere a conversation needs
// to open in-place. Reuses the inbox MessageBubble + Composer and listens to the
// app-wide WebSocket so it behaves exactly like the inbox (media, voice, calls,
// AI assist, attachments, live updates) instead of a stripped-down clone.
import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { api } from "@/lib/api";
import { initials, avatarColor } from "@/lib/utils";
import type { Conversation, Message } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import MessageBubble, { rewriteLocalMedia } from "@/app/(app)/inbox/components/MessageBubble";
import Composer from "@/app/(app)/inbox/components/Composer";

export default function ChatPopup({ conversationId, name, phone, channel, onClose, notify }: {
  conversationId: string;
  name?: string | null;
  phone?: string | null;
  channel?: string | null;
  onClose: () => void;
  notify: (m: string, s?: "success" | "info" | "warning" | "error") => void;
}) {
  const { t } = useI18n();
  const convId = conversationId;
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingPreviews, setPendingPreviews] = useState<(string | null)[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const reload = () => api.getMessages(convId).then((m) => setMessages(m || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => {
    reload();
    api.listConversations().then((l) => setActive((l || []).find((c) => c.id === convId) ?? null)).catch(() => {});
  }, [convId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onWS = (e: Event) => {
      const ev = (e as CustomEvent).detail; const data = ev?.data || ev;
      if (data?.conversation_id === convId || ev?.conversation_id === convId) reload();
    };
    window.addEventListener("ws_message", onWS);
    return () => window.removeEventListener("ws_message", onWS);
  }, [convId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [messages]);

  const activeConv = (active || ({ id: convId, contact_name: name, contact_phone: phone, channel, status: "open" } as unknown)) as Conversation;

  function fileTooBig(f: File): string | null {
    const mb = f.size / (1024 * 1024);
    let max = 100, label = "File";
    if (f.type.startsWith("image/")) { max = 5; label = "Image"; }
    else if (f.type.startsWith("video/")) { max = 16; label = "Video"; }
    else if (f.type.startsWith("audio/")) { max = 16; label = "Audio"; }
    return mb > max ? `${label} too large (${mb.toFixed(1)} MB). Max ${max} MB.` : null;
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (fileRef.current) fileRef.current.value = "";
    if (!files.length) return;
    const ok: File[] = [];
    for (const f of files) { const tooBig = fileTooBig(f); if (tooBig) { notify(tooBig, "warning"); continue; } ok.push(f); }
    if (!ok.length) return;
    setPendingFiles((p) => [...p, ...ok]);
    setPendingPreviews((p) => [...p, ...ok.map((f) => (f.type.startsWith("image/") || f.type.startsWith("video/")) ? URL.createObjectURL(f) : null)]);
  }
  function removePendingFile(i: number) {
    setPendingFiles((p) => p.filter((_, x) => x !== i));
    setPendingPreviews((p) => { const c = [...p]; if (c[i]) URL.revokeObjectURL(c[i]!); c.splice(i, 1); return c; });
  }
  function cancelSendFile() {
    pendingPreviews.forEach((p) => p && URL.revokeObjectURL(p));
    setPendingFiles([]); setPendingPreviews([]);
  }
  async function confirmSendFile() {
    if (!pendingFiles.length) return;
    setBusy(true); setUploadProgress(0);
    try {
      const ups: { url: string; type: string; name: string }[] = [];
      for (const f of pendingFiles) ups.push(await api.uploadFile(f, (pct) => setUploadProgress(pct)));
      for (let i = 0; i < ups.length; i++) await api.sendMedia(convId, ups[i].type, ups[i].url, i === 0 ? draft.trim() : "");
      pendingPreviews.forEach((p) => p && URL.revokeObjectURL(p));
      setDraft(""); setPendingFiles([]); setPendingPreviews([]); await reload();
    } catch (err) { notify(err instanceof Error ? err.message : t("components.uploadFailed"), "error"); }
    finally { setBusy(false); setUploadProgress(null); }
  }
  async function submit() {
    if (pendingFiles.length) { await confirmSendFile(); return; }
    if (!draft.trim()) return;
    if (tab === 1) { try { await api.addNote(convId, draft.trim()); setDraft(""); notify(t("components.noteAdded")); } catch { notify(t("contacts.couldNotAddNote"), "error"); } return; }
    setBusy(true);
    try { await api.sendMessage(convId, draft.trim()); setDraft(""); await reload(); }
    catch { notify(t("contacts.failedToSend"), "error"); } finally { setBusy(false); }
  }
  async function sendVoice(blob: Blob) {
    setBusy(true);
    try {
      const file = new File([blob], "voice_message.webm", { type: "audio/webm" });
      const up = await api.uploadFile(file);
      await api.sendMedia(convId, "audio", up.url, "");
      await reload();
    } catch (err) { notify("Voice error: " + (err instanceof Error ? err.message : "Unknown"), "error"); }
    finally { setBusy(false); }
  }

  const previewMsg = messages.find((m) => m.id === previewId);
  const previewUrl = previewMsg?.media_url ? rewriteLocalMedia(previewMsg.media_url) : "";
  const previewIsVideo = !!previewMsg && (previewMsg.type === "video" || /\.(mp4|mov|webm|avi|mkv)$/i.test(previewMsg.media_url || ""));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative w-[540px] max-w-full h-[660px] max-h-[90vh] rounded-xl border border-border bg-card shadow-2xl animate-scale-in flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
          <div className="w-9 h-9 rounded-full grid place-items-center text-xs font-bold text-white"
            style={{ backgroundColor: avatarColor(name || phone) }}>
            {initials(name || phone)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-[14px] text-foreground truncate">{name || phone || t("broadcasts.unknown")}</p>
            <p className="text-[11.5px] text-muted-foreground tabular-nums">{phone}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none"><X className="w-[18px] h-[18px]" /></button>
        </div>

        {/* Messages */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-3 py-3 bg-muted/30">
          {loading ? (
            <div className="h-full grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : messages.length === 0 ? (
            <p className="text-center text-[13px] text-muted-foreground py-8">{t("contacts.noMessagesYet")}</p>
          ) : (
            <div className="space-y-1">
              {messages.map((m) => (
                <MessageBubble key={m.id} m={m} active={activeConv} conversationId={convId}
                  onPreviewMedia={(id) => setPreviewId(id)}
                  onCopyText={(txt) => { navigator.clipboard.writeText(txt); notify(t("contacts.copiedToClipboard"), "info"); }}
                  onUseInComposer={(txt) => setDraft(txt)} />
              ))}
            </div>
          )}
        </div>

        {/* Composer (the real inbox composer) */}
        <Composer
          draft={draft} setDraft={setDraft}
          tab={tab} setTab={setTab}
          quickReplies={[]}
          pendingFiles={pendingFiles} pendingPreviews={pendingPreviews}
          fileRef={fileRef} onFile={onFile} cancelSendFile={cancelSendFile} removePendingFile={removePendingFile}
          busy={busy} onSubmit={submit} onSendVoice={sendVoice} notify={notify}
          windowExpired={activeConv?.channel === "whatsapp" && !!activeConv?.last_message_at && (Date.now() - new Date(activeConv.last_message_at).getTime() > 24 * 60 * 60 * 1000)}
          phone={phone || ""} conversationId={convId}
          aiSummary={activeConv?.lead_summary}
          uploadProgress={uploadProgress}
          onAddNote={async (body) => { await api.addNote(convId, body); notify(t("components.noteAdded")); }}
        />
      </div>

      {/* Media preview */}
      {previewMsg && previewUrl && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 animate-fade-in" onClick={() => setPreviewId(null)}>
          {previewIsVideo
            ? <video src={previewUrl} controls autoPlay className="max-w-[90vw] max-h-[85vh] rounded-md" onClick={(e) => e.stopPropagation()} />
            : <img src={previewUrl} className="max-w-[90vw] max-h-[85vh] object-contain rounded-md" onClick={(e) => e.stopPropagation()} alt="" />}
        </div>
      )}
    </div>
  );
}
