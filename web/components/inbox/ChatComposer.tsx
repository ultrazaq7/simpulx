"use client";

import { useI18n } from "@/lib/i18n";
import { useState, useRef } from "react";
import { useInbox } from "./InboxContext";
import { Send, Lock, Mic, Paperclip, Zap, Smile, FileText, Loader2, Pause, Play, Trash2, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker from "emoji-picker-react";
import { api } from "@/lib/api";

export function ChatComposer({ loadConvs, queryClient }: { loadConvs: () => void, queryClient: any }) {
  const { t } = useI18n();
  const { activeId, quickReplies, notify } = useInbox();
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<0 | 1>(0); // 0 = reply, 1 = note
  const [showQR, setShowQR] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; previewUrl: string | null }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);

  async function submit() {
    if (pendingFiles.length > 0) {
      await confirmSendFile();
      return;
    }
    if (!draft.trim() || !activeId) return;
    if (tab === 1) {
      setBusy(true);
      try {
        await api.addNote(activeId, draft.trim()); 
        setDraft("");
        queryClient.invalidateQueries({ queryKey: ["notes", activeId] });
        notify(t("components.noteAdded"));
      } catch {
        notify(t("components.failedToAddNote"), "error");
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    const text = draft.trim();
    const tempId = "temp-" + Date.now();
    try {
      queryClient.setQueryData(["messages", activeId], (old: any) => {
        if (!old || !Array.isArray(old)) return old;
        return [...old, {
          id: tempId,
          conversation_id: activeId,
          direction: "outbound",
          sender_type: "agent",
          type: "text",
          body: text,
          status: "queued",
          created_at: new Date().toISOString()
        }];
      });
      setDraft("");
      await api.sendMessage(activeId, text); 
    } catch (err: any) { 
      console.error("Submit error:", err);
      notify(`Failed to send: ${err?.message || "Unknown error"}`, "error"); 
      queryClient.invalidateQueries({ queryKey: ["messages", activeId] });
    } finally { 
      setBusy(false); 
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !activeId) return;
    const newFiles = files.map(file => ({
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null
    }));
    setPendingFiles(prev => [...prev, ...newFiles]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function confirmSendFile() {
    if (pendingFiles.length === 0 || !activeId) return;
    setBusy(true);
    try {
      for (let i = 0; i < pendingFiles.length; i++) {
        const { file } = pendingFiles[i];
        const up = await api.uploadFile(file);
        const fileUrl = up.url + (up.url.includes("?") ? "&" : "?") + "name=" + encodeURIComponent(file.name);
        await api.sendMedia(activeId, up.type, fileUrl, i === 0 ? draft.trim() : "");
      }
      setDraft(""); 
      pendingFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
      setPendingFiles([]);
      queryClient.invalidateQueries({ queryKey: ["messages", activeId] }); 
      loadConvs();
      notify(t("components.filesSent"));
    } catch { 
      notify(t("components.uploadFailed"), "error"); 
    } finally { 
      setBusy(false); 
    }
  }

  function cancelSendFile(index?: number) {
    if (typeof index === "number") {
       const pf = pendingFiles[index];
       if (pf && pf.previewUrl) URL.revokeObjectURL(pf.previewUrl);
       setPendingFiles(prev => prev.filter((_, i) => i !== index));
    } else {
       pendingFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
       setPendingFiles([]);
    }
  }

  // --- Voice Recording Logic (Skipped for brevity but included to match functionality) ---
  // We include a simplified version of the encoding logic from the original file
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.start();
      setIsRecording(true);
      setIsPaused(false);
      setRecordTime(0);
      recordIntervalRef.current = setInterval(() => setRecordTime(p => p + 1), 1000);
    } catch {
      notify(t("components.microphoneAccessDenied"), "error");
    }
  }

  function pauseRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    }
  }

  function resumeRecording() {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      recordIntervalRef.current = setInterval(() => setRecordTime(p => p + 1), 1000);
    }
  }

  function discardRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
    mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
    if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    setIsRecording(false);
    setIsPaused(false);
    setRecordTime(0);
    audioChunksRef.current = [];
  }

  async function sendRecording() {
    if (!mediaRecorderRef.current || !activeId) return;
    return new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = async () => {
        if (audioChunksRef.current.length === 0) {
          discardRecording(); resolve(); return;
        }
        const rawBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
        setIsRecording(false); setIsPaused(false); setRecordTime(0); audioChunksRef.current = [];
        setBusy(true);
        try {
          const lamejs = (window as any).lamejs;
          if (!lamejs || !lamejs.Mp3Encoder) throw new Error("lamejs missing");
          const arrayBuffer = await rawBlob.arrayBuffer();
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const channels = audioBuffer.numberOfChannels;
          const sampleRate = audioBuffer.sampleRate;
          const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128);
          let left = audioBuffer.getChannelData(0);
          let right = channels > 1 ? audioBuffer.getChannelData(1) : left;
          const mp3Data: Int8Array[] = [];
          
          function convert(data: Float32Array) {
            const res = new Int16Array(data.length);
            for (let i = 0; i < data.length; i++) {
              let s = Math.max(-1, Math.min(1, data[i]));
              res[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            return res;
          }
          const leftInt = convert(left);
          const rightInt = channels > 1 ? convert(right) : leftInt;
          for (let i = 0; i < leftInt.length; i += 1152) {
            let mp3buf = channels === 1 ? mp3encoder.encodeBuffer(leftInt.subarray(i, i + 1152)) : mp3encoder.encodeBuffer(leftInt.subarray(i, i + 1152), rightInt.subarray(i, i + 1152));
            if (mp3buf.length > 0) mp3Data.push(mp3buf);
          }
          const mp3buf = mp3encoder.flush();
          if (mp3buf.length > 0) mp3Data.push(mp3buf);
          
          const audioBlob = new Blob(mp3Data, { type: "audio/mpeg" });
          const file = new File([audioBlob], "voice_message.mp3", { type: "audio/mpeg" });
          const up = await api.uploadFile(file);
          const fileUrl = up.url + (up.url.includes("?") ? "&" : "?") + "name=" + encodeURIComponent(file.name);
          await api.sendMedia(activeId, "audio", fileUrl, "");
          queryClient.invalidateQueries({ queryKey: ["messages", activeId] }); loadConvs();
        } catch (e: any) {
          notify(e.message || t("components.audioError"), "error");
        } finally {
          setBusy(false); resolve();
        }
      };
      if (mediaRecorderRef.current!.state !== "inactive") mediaRecorderRef.current!.stop();
      mediaRecorderRef.current!.stream.getTracks().forEach(t => t.stop());
    });
  }

  return (
    <div className="px-4 pb-4">
      <div className={`rounded-xl border shadow-sm transition-all bg-white flex flex-col relative overflow-hidden ${tab === 1 ? "border-amber-300 bg-amber-50/50" : "border-slate-200"}`}>
        
        {/* Quick Replies Panel */}
        {showQR && (
          <div className="max-h-48 overflow-y-auto border-b border-slate-100 bg-slate-50/80 backdrop-blur">
            {quickReplies.length === 0 ? (
              <p className="p-4 text-sm text-slate-400 text-center">{t("components.noQuickRepliesYet")}</p>
            ) : quickReplies.map((q) => (
              <button key={q.id} onClick={() => { setDraft(q.body); setShowQR(false); notify(`Quick reply "${q.shortcut}" inserted`, "info"); }}
                      className="w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-100 transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">{q.shortcut}</span>
                  <span className="text-sm font-bold text-slate-700">{q.title}</span>
                </div>
                <p className="text-xs text-slate-500 truncate">{q.body}</p>
              </button>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center px-2 pt-2 gap-4">
          <button onClick={() => setTab(0)} className={`px-2 py-1 text-xs font-bold transition-colors ${tab === 0 ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-400 hover:text-slate-600 border-b-2 border-transparent"}`}>{t("components.reply")}</button>
          <button onClick={() => setTab(1)} className={`px-2 py-1 text-xs font-bold transition-colors ${tab === 1 ? "text-amber-700 border-b-2 border-amber-500" : "text-slate-400 hover:text-slate-600 border-b-2 border-transparent"}`}>{t("components.internalNote2")}</button>
        </div>

        {/* File Previews */}
        {pendingFiles.length > 0 && (
          <div className="px-4 pt-3 flex flex-wrap gap-2">
            {pendingFiles.map((pf, idx) => (
              <div key={idx} className="flex items-center gap-3 p-2 bg-slate-100 rounded-lg border border-slate-200">
                {pf.previewUrl ? (
                  <img src={pf.previewUrl} className="w-10 h-10 object-cover rounded" alt="preview" />
                ) : (
                  <div className="w-10 h-10 bg-slate-200 rounded flex items-center justify-center">
                    <FileText className="w-5 h-5 text-slate-500" />
                  </div>
                )}
                <div className="min-w-0 max-w-[120px]">
                  <p className="text-xs font-bold truncate text-slate-700">{pf.file.name}</p>
                  <p className="text-[10px] text-slate-500">{(pf.file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={() => cancelSendFile(idx)} className="p-1 rounded-full text-red-500 hover:bg-red-100 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {isRecording ? (
          <div className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
            <button onClick={discardRecording} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors">
              <Trash2 className="w-5 h-5" />
            </button>
            <div className="flex-1 flex items-center justify-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full bg-red-500 ${isPaused ? "" : "animate-pulse"}`} />
              <span className={`text-sm font-bold ${isPaused ? "text-slate-500" : "text-red-500"}`}>{isPaused ? t("automation.paused") : t("components.recording")}</span>
              <span className="text-sm text-slate-700">
                {Math.floor(recordTime / 60).toString().padStart(2, "0")}:{(recordTime % 60).toString().padStart(2, "0")}
              </span>
            </div>
            <button onClick={isPaused ? resumeRecording : pauseRecording} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors">
              {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
            </button>
            <button onClick={sendRecording} disabled={busy} className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-sm">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
            </button>
          </div>
        ) : (
          <>
            <textarea 
              value={draft} 
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder={tab === 0 ? t("broadcasts.typeYourMessageHere") : t("components.addAnInternalNoteVisible")}
              className={`w-full bg-transparent border-none outline-none resize-none min-h-[60px] max-h-[150px] px-4 py-3 text-sm placeholder:text-slate-400 ${tab === 1 ? "text-amber-900" : "text-slate-900"}`}
            />
            
            <div className="flex items-center gap-1 px-3 pb-3">
              <Popover>
                <PopoverTrigger className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors">
                  <Smile className="w-5 h-5" />
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={10} className="w-auto p-0 border-none shadow-2xl rounded-2xl overflow-hidden bg-transparent">
                  <EmojiPicker onEmojiClick={(e) => setDraft(d => d + e.emoji)} lazyLoadEmojis />
                </PopoverContent>
              </Popover>

              <input ref={fileRef} type="file" hidden multiple onChange={onFile} />
              <button onClick={() => fileRef.current?.click()} disabled={busy} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors">
                <Paperclip className="w-5 h-5" />
              </button>
              
              <button onClick={() => setShowQR(!showQR)} className={`p-2 rounded-full transition-colors ${showQR ? "text-blue-600 bg-blue-50" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"}`}>
                <Zap className="w-5 h-5" />
              </button>

              <div className="flex-1" />
              
              <span className="text-xs text-slate-400 font-medium mr-2">{draft.length}/4096</span>
              
              {tab === 0 && (
                <button onClick={startRecording} disabled={busy} className="p-2 mr-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors">
                  <Mic className="w-5 h-5" />
                </button>
              )}
              
              <button 
                onClick={pendingFiles.length > 0 ? confirmSendFile : submit}
                disabled={busy || (!draft.trim() && pendingFiles.length === 0)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-sm ${
                  tab === 1 
                    ? "bg-amber-500 hover:bg-amber-600 text-white" 
                    : "bg-slate-900 hover:bg-slate-800 text-white"
                } disabled:opacity-50 disabled:shadow-none`}
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : tab === 0 ? <Send className="w-4 h-4 ml-0.5" /> : <Lock className="w-4 h-4" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
