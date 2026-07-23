"use client";
import { useI18n } from "@/lib/i18n";
import { memo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Sparkles, Check, CheckCheck, Clock, AlertCircle, Play, Pause, Mic, User,
  FileText, FileSpreadsheet, FileImage, FileArchive, FileCode,
  File, Download, MoreHorizontal, Copy, ClipboardPaste, Link2, Megaphone, Forward,
  PhoneOutgoing, PhoneIncoming, PhoneMissed, MapPin, Phone, ExternalLink, Loader2, Sticker as StickerIcon,
} from "lucide-react";
import { initials, fmtTime, channelColor, channelTextColor, cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { Conversation, Message } from "@/lib/types";

/* ── URL helpers: first URL in a text + OSM map tile ───────── */
const FIRST_URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/i;

function osmTileUrl(lat: number, lng: number, z = 15): string {
  const x = Math.floor(((lng + 180) / 360) * 2 ** z);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z);
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

/* ── Open Graph link preview card (WhatsApp style) ─────────── */
type OgData = { url: string; title?: string; description?: string; image?: string; site_name?: string };
const ogCache = new Map<string, OgData | null>();

function LinkPreviewCard({ url, out }: { url: string; out: boolean }) {
  const [data, setData] = useState<OgData | null | undefined>(
    ogCache.has(url) ? ogCache.get(url) : undefined,
  );
  useEffect(() => {
    if (ogCache.has(url)) { setData(ogCache.get(url)); return; }
    let alive = true;
    const target = url.startsWith("http") ? url : `https://${url}`;
    api.linkPreview(target)
      .then((d) => {
        const val = d && (d.title || d.image) ? d : null;
        ogCache.set(url, val);
        if (alive) setData(val);
      })
      .catch(() => { ogCache.set(url, null); if (alive) setData(null); });
    return () => { alive = false; };
  }, [url]);

  if (!data) return null;
  const href = url.startsWith("http") ? url : `https://${url}`;
  let domain = "";
  try { domain = new URL(href).hostname.replace(/^www\./, ""); } catch { /* keep empty */ }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "block m-1 mb-0 rounded-lg overflow-hidden no-underline border",
        out ? "border-white/25 bg-white/10 hover:bg-white/15" : "border-border bg-muted/40 hover:bg-muted/70",
      )}
    >
      {data.image && (
        <img src={data.image} className="w-full max-h-[160px] object-cover block" loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      )}
      <div className="px-2.5 py-2">
        {data.title && (
          <p className={cn("text-[12.5px] font-bold leading-tight line-clamp-2", out ? "text-white" : "text-foreground")}>{data.title}</p>
        )}
        {data.description && (
          <p className={cn("text-[11.5px] leading-snug line-clamp-2 mt-0.5", out ? "text-white/75" : "text-muted-foreground")}>{data.description}</p>
        )}
        {domain && (
          <p className={cn("text-[10.5px] mt-1", out ? "text-white/60" : "text-muted-foreground/80")}>{domain}</p>
        )}
      </div>
    </a>
  );
}

/* ── Clickable links in message text (WhatsApp style) ──────── */
const URL_SPLIT_RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
function LinkifiedText({ text, out }: { text: string; out: boolean }) {
  const parts = text.split(URL_SPLIT_RE);
  return (
    <>
      {parts.map((p, i) => {
        if (!/^(https?:\/\/|www\.)/i.test(p)) return <span key={i}>{p}</span>;
        const href = p.startsWith("http") ? p : `https://${p}`;
        return (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn("underline underline-offset-2 break-all", out ? "text-white" : "text-[#0284C7]")}
          >
            {p}
          </a>
        );
      })}
    </>
  );
}

/* ── Status ticks (WhatsApp style) ─────────────────────────── */
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "sent": return <Check className="w-3.5 h-3.5 text-slate-400" />;
    case "delivered": return <CheckCheck className="w-3.5 h-3.5 text-slate-400" />;
    case "read": return <CheckCheck className="w-3.5 h-3.5 text-[#53BDEB]" />;
    case "failed": return <AlertCircle className="w-3.5 h-3.5 text-[#EF4444]" />;
    default: return <Clock className="w-3.5 h-3.5 text-slate-300" />;
  }
}

/* ── File-type helpers ─────────────────────────────────────── */
function extFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const dot = path.lastIndexOf(".");
    return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
  } catch { return ""; }
}

function filenameFromUrl(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    if (u.searchParams.has("name")) return u.searchParams.get("name")!;
    const parts = u.pathname.split("/");
    const last = parts[parts.length - 1] || "file";
    // Strip standard UUID v4 prefix (e.g. 123e4567-e89b-12d3-a456-426614174000-)
    return decodeURIComponent(last).replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "") || "Document";
  } catch { return "Document"; }
}

type DocStyle = { icon: React.ReactNode; bg: string; accent: string; label: string };

function docStyle(ext: string, out: boolean): DocStyle {
  const iconCls = "w-6 h-6";
  switch (ext) {
    case "pdf":
      return { icon: <FileText className={cn(iconCls, "text-[#E53935]")} />, bg: out ? "bg-white/15" : "bg-[#FDECEC]", accent: "#E53935", label: "PDF" };
    case "doc": case "docx":
      return { icon: <FileText className={cn(iconCls, "text-[#1976D2]")} />, bg: out ? "bg-white/15" : "bg-[#E3F2FD]", accent: "#1976D2", label: "DOC" };
    case "xls": case "xlsx": case "csv":
      return { icon: <FileSpreadsheet className={cn(iconCls, "text-[#2E7D32]")} />, bg: out ? "bg-white/15" : "bg-[#E8F5E9]", accent: "#2E7D32", label: "XLS" };
    case "ppt": case "pptx":
      return { icon: <FileText className={cn(iconCls, "text-[#E65100]")} />, bg: out ? "bg-white/15" : "bg-[#FFF3E0]", accent: "#E65100", label: "PPT" };
    case "zip": case "rar": case "7z": case "tar": case "gz":
      return { icon: <FileArchive className={cn(iconCls, "text-[#6D4C41]")} />, bg: out ? "bg-white/15" : "bg-[#EFEBE9]", accent: "#6D4C41", label: ext.toUpperCase() };
    case "png": case "jpg": case "jpeg": case "gif": case "webp": case "svg":
      return { icon: <FileImage className={cn(iconCls, "text-[#7B1FA2]")} />, bg: out ? "bg-white/15" : "bg-[#F3E5F5]", accent: "#7B1FA2", label: ext.toUpperCase() };
    case "js": case "ts": case "py": case "go": case "json": case "xml": case "html": case "css":
      return { icon: <FileCode className={cn(iconCls, "text-[#455A64]")} />, bg: out ? "bg-white/15" : "bg-[#ECEFF1]", accent: "#455A64", label: ext.toUpperCase() };
    default:
      return { icon: <File className={cn(iconCls, out ? "text-white/80" : "text-[#78909C]")} />, bg: out ? "bg-white/15" : "bg-[#F5F5F5]", accent: "#78909C", label: ext.toUpperCase() || "FILE" };
  }
}

/* ── Local dev: rewrite ngrok → localhost ───────────────────── */
export function rewriteLocalMedia(url: string): string {
  if (typeof window !== "undefined" && window.location.hostname === "localhost" && url.includes("ngrok-free.dev")) {
    return url.replace(/https?:\/\/[^/]+/, "http://localhost:8080");
  }
  return url;
}

/* ── formatFileSize ────────────────────────────────────────── */
function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/* ── CustomAudioPlayer ─────────────────────────────────────── */
function formatDuration(sec: number) {
  if (isNaN(sec) || !isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const waveCache = new Map<string, number[]>();

// Deterministic, natural-looking waveform from the URL · used as the initial render
// and the fallback when decodeAudioData fails (opus/CORS), so it NEVER shows flat dots.
function pseudoWave(seed: string, n = 40): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const r = (h % 1000) / 1000;                 // 0..1 pseudo-random
    const env = Math.sin((i / (n - 1)) * Math.PI); // fade-in/out envelope
    out.push(Math.max(2, Math.round((0.3 + 0.7 * r) * env * 10)));
  }
  return out;
}

function CustomAudioPlayer({ url, out }: { url: string; out: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(() => waveCache.get(url) || pseudoWave(url));

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const updateTime = () => setProgress(a.currentTime);
    const updateDur = () => setDuration(a.duration);
    const onEnd = () => { setPlaying(false); setProgress(0); };
    a.addEventListener("timeupdate", updateTime);
    a.addEventListener("loadedmetadata", updateDur);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", updateTime);
      a.removeEventListener("loadedmetadata", updateDur);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  // Generate actual waveform
  useEffect(() => {
    if (waveCache.has(url)) return;
    let isMounted = true;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    // Add ngrok-skip-browser-warning to prevent HTML warning page interception
    fetch(url, { headers: { "ngrok-skip-browser-warning": "1" } })
      .then(res => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.arrayBuffer();
      })
      .then(buf => {
        const ctx = new AudioContextClass();
        return ctx.decodeAudioData(buf);
      })
      .then(audioBuffer => {
        if (!isMounted) return;
        const channelData = audioBuffer.getChannelData(0);
        const samples = 40;
        const blockSize = Math.floor(channelData.length / samples);
        const peaks = [];
        for (let i = 0; i < samples; i++) {
          let maxPeak = 0;
          for (let j = 0; j < blockSize; j++) {
            const val = Math.abs(channelData[i * blockSize + j]);
            if (val > maxPeak) maxPeak = val;
          }
          peaks.push(maxPeak);
        }
        const highest = Math.max(...peaks, 0.01);
        const normalized = peaks.map(p => Math.max(1, Math.round((p / highest) * 10)));
        waveCache.set(url, normalized);
        setWaveform(normalized);
      })
      .catch(() => {
        // opus/CORS decode failure -> keep a natural pseudo waveform, never flat dots.
        if (isMounted) setWaveform(pseudoWave(url));
      });

    return () => { isMounted = false; };
  }, [url]);

  const toggle = () => {
    if (audioRef.current) {
      if (playing) audioRef.current.pause();
      else audioRef.current.play();
      setPlaying(!playing);
    }
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Number(e.target.value);
      setProgress(Number(e.target.value));
    }
  };

  const percent = duration > 0 ? progress / duration : 0;
  const activeColor = out ? "bg-white" : "bg-[#53BDEB]";
  const inactiveColor = out ? "bg-white/40" : "bg-black/20";

  return (
    <div className="flex items-center gap-3 w-[260px] pl-1 pr-3 py-1.5">
      <audio ref={audioRef} src={url} preload="metadata" />
      
      <div className="relative shrink-0">
        <div className={cn("w-[42px] h-[42px] rounded-full flex items-center justify-center", out ? "bg-white/20 text-white" : "bg-muted text-muted-foreground")}>
          <User className="w-6 h-6" />
        </div>
        <div className={cn("absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center", out ? "bg-[#2D8B73]" : "bg-white")}>
          <Mic className={cn("w-3 h-3", out ? "text-[#53BDEB]" : "text-[#53BDEB]")} />
        </div>
      </div>

      <button onClick={toggle} className="shrink-0 outline-none">
        {playing ? <Pause className="w-6 h-6" fill="currentColor" /> : <Play className="w-6 h-6" fill="currentColor" />}
      </button>

      <div className="flex-1 flex flex-col justify-center pt-2">
        <div className="relative h-6 flex items-center w-full">
          {/* Waveform bars */}
          <div className="absolute inset-0 flex items-center justify-between pointer-events-none gap-[1px]">
            {waveform.map((val, i) => {
              const isActive = (i / waveform.length) <= percent;
              return (
                <div 
                  key={i} 
                  className={cn("w-[3px] rounded-full transition-colors", isActive ? activeColor : inactiveColor)}
                  style={{ height: `${val * 10}%` }}
                />
              );
            })}
          </div>
          {/* Invisible range input for interaction */}
          <input 
            type="range" 
            min={0} 
            max={duration || 100} 
            value={progress} 
            onChange={seek}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer m-0"
          />
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[11px] opacity-80 font-medium">
          <span>{formatDuration(progress)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Message "..." menu (Copy / Copy to composer / Copy link) ─ */
function MessageMenu({ out, text, link, onCopyText, onUseInComposer, onForward }: {
  out: boolean; text?: string; link?: string;
  onCopyText?: (t: string) => void; onUseInComposer?: (t: string) => void; onForward?: (t: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, flipUp: false });

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipUp = spaceBelow < 200;
      const menuW = 224; // w-56
      setPos({
        top: flipUp ? rect.top - 4 : rect.bottom + 4,
        left: out ? rect.right - menuW : rect.left,
        flipUp,
      });
    }
    setOpen((v) => !v);
  };

  const Item = ({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) => (
    <button onClick={() => { onClick(); setOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-foreground/90 hover:bg-muted text-left outline-none">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />{label}
    </button>
  );
  return (
    <div className="relative self-center shrink-0">
      <button
        ref={btnRef}
        onClick={handleOpen}
        aria-label={t("inbox.messageActions")}
        className={cn("p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-opacity outline-none", open ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[70] w-56 rounded-lg border border-border bg-popover shadow-xl py-1"
            style={{
              top: pos.top,
              left: pos.left,
              transform: pos.flipUp ? "translateY(-100%)" : undefined,
            }}
          >
            {text && <Item icon={Copy} label={t("inbox.copyMessage")} onClick={() => onCopyText?.(text)} />}
            {text && <Item icon={ClipboardPaste} label={t("inbox.copyToMessageTextBox")} onClick={() => onUseInComposer?.(text)} />}
            {text && onForward && <Item icon={Forward} label={t("inbox.forward")} onClick={() => onForward(text)} />}
            {link && <Item icon={Link2} label={t("inbox.copyLinkToMessage")} onClick={() => onCopyText?.(link)} />}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

/* ── MessageBubble ─────────────────────────────────────────── */
interface MessageBubbleProps {
  m: Message;
  active: Conversation;
  grouped?: boolean; // continuation of the previous same-sender message
  onPreviewMedia: (messageId: string) => void;
  conversationId?: string | null;
  onCopyText?: (t: string) => void;
  onUseInComposer?: (t: string) => void;
  onForward?: (t: string) => void;
}

const MessageBubble = memo(function MessageBubble({ m, active, grouped, onPreviewMedia, conversationId, onCopyText, onUseInComposer, onForward }: MessageBubbleProps) {
  const { t } = useI18n();
  const msgLink = conversationId && typeof window !== "undefined" ? `${window.location.origin}/inbox?c=${conversationId}` : undefined;
  const out = m.direction === "outbound";
  const bot = m.sender_type === "bot";
  // Bubble Simpuler kini TERANG (tint gunmetal, teks gelap) sedangkan agent
  // tetap petrol gelap. Semua keputusan warna "di atas background gelap" pakai
  // darkBub; `out` tetap untuk alignment, menu, dan gating status ticks.
  const darkBub = out && m.sender_type !== "bot";
  // Broadcasts are stored as sender_type 'system' (outbound). Show them as a sent
  // message on the right, marked as a Broadcast · not a centered system pill.
  const broadcast = m.sender_type === "system";
  const who = !out ? (active.contact_name || "Customer") : broadcast ? "Broadcast" : bot ? "Simpuler" : (active.agent_name || "Agent");
  const url = m.media_url ? rewriteLocalMedia(m.media_url) : "";
  const ext = url ? extFromUrl(url) : "";
  const isSticker = m.type === "sticker";
  const isImage = m.type === "image" || (!isSticker && ["jpg","jpeg","png","gif","webp","svg"].includes(ext));
  const isVideo = m.type === "video" || ["mp4","mov","webm","avi","mkv"].includes(ext);
  const isAudio = m.type === "audio" || ["ogg","mp3","wav","aac","m4a","opus"].includes(ext);
  const isDoc = url && !isImage && !isVideo && !isAudio && !isSticker;

  const fname = url ? filenameFromUrl(url) : "";
  const ds = isDoc ? docStyle(ext, darkBub) : null;

  // Rich WhatsApp-style content from the message metadata.
  const meta = m.metadata;
  const referral = meta?.referral;
  const hasReferral = !!(referral && (referral.image_url || referral.headline || referral.body || referral.source_url));
  const contacts = m.type === "contacts" ? meta?.contacts : undefined;
  const location = m.type === "location" ? meta?.location : undefined;
  const mapsUrl = location ? `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}` : "";
  // First URL in a plain text message -> OG link preview (skip when the CTWA
  // ad card already provides a preview).
  const firstUrl = !hasReferral && m.type === "text" && m.body ? m.body.match(FIRST_URL_RE)?.[0] : undefined;
  // Media message whose file is still downloading server-side (the message is
  // published instantly; MediaUpdated patches the URL in moments later).
  const mediaPending = !url && ["image", "video", "audio", "document", "file", "sticker"].includes(m.type);
  // Nothing renderable at all (unknown/blank types) -> show a placeholder so
  // the bubble is never empty.
  const isBlank = !m.body && !url && !hasReferral && !(contacts && contacts.length) && !location && !mediaPending;

  // ── Reaction: a centered marker, not a bubble (WhatsApp attaches these to the
  //    target message; we surface them inline on the timeline) ──
  if (m.type === "reaction") {
    return (
      <div className="flex justify-center my-1">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/70 text-[12px] font-medium text-foreground/70">
          {m.body
            ? <><span className="text-[15px] leading-none">{m.body}</span> {out ? t("inbox.youReacted") : t("inbox.reacted")} {t("inbox.toAMessage")}</>
            : <>{out ? t("inbox.youRemoved") : t("inbox.removed")} {t("inbox.aReaction")}</>}
          <span className="text-[11px] text-muted-foreground tabular-nums">{fmtTime(m.created_at)}</span>
        </span>
      </div>
    );
  }

  // ── Voice call: a centered, low-contrast timeline marker (not a chat bubble) ──
  if (m.type === "call") {
    const cout = m.direction === "outbound";
    const missed = /missed|no answer|declined/i.test(m.body || "");
    const CallIcon = missed ? PhoneMissed : cout ? PhoneOutgoing : PhoneIncoming;
    const text = (m.body || "Voice call").replace(/^📞\s*/, "");
    return (
      <div className="flex justify-center my-1">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/70 text-[12px] font-medium">
          <CallIcon className={cn("w-3.5 h-3.5", missed ? "text-hot" : "text-foreground/45")} />
          <span className={missed ? "text-hot" : "text-foreground/70"}>{text}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{fmtTime(m.created_at)}</span>
        </span>
      </div>
    );
  }

  return (
    <div className={cn("group flex items-start gap-1", out ? "justify-end" : "justify-start")}>

      {out && (m.body || msgLink) && <MessageMenu out={out} text={m.body ?? undefined} link={msgLink} onCopyText={onCopyText} onUseInComposer={onUseInComposer} onForward={onForward} />}
      <div className={cn(hasReferral || firstUrl ? "max-w-[340px]" : "max-w-[66%]", "flex flex-col", out ? "items-end" : "items-start")}>
        {/* Sender label: only on the first of a group, and only for outbound (1:1
            inbound is always the contact, so the name there is just noise). */}
        {!grouped && (out || bot || broadcast) && (
          <p className={cn("text-[10px] font-semibold mb-0.5 px-0.5 inline-flex items-center gap-0.5", bot ? "text-ai-text" : broadcast ? "text-amber-700" : "text-muted-foreground")}>
            {who} {bot && <Sparkles className="w-2.5 h-2.5" />}{broadcast && <Megaphone className="w-2.5 h-2.5" />}
          </p>
        )}

        <div
          className={cn(
            isSticker ? "" : "rounded-lg overflow-hidden shadow-sm",
            // Signature colour rule: an AI (Simpuler) reply is indigo, a human
            // agent reply is petrol · so a reviewer sees at a glance who sent what.
            isSticker ? "" : (out
              ? (bot ? "bg-ai-bg text-foreground border border-ai/20 rounded-br-[4px]" : "bg-primary text-primary-foreground selection:bg-white/30 selection:text-white rounded-br-[4px]")
              : "bg-card text-foreground border border-border rounded-bl-[4px]"),
            // No padding when media-only (image/video fill the bubble)
            (isImage || isVideo) && !m.body && !isSticker ? "" : "",
          )}
        >
          {/* ── CTWA ad referral card (image + headline + body + link) ── */}
          {hasReferral && (
            <a
              href={referral!.source_url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "block m-1 rounded-lg overflow-hidden border no-underline",
                darkBub ? "border-white/25 bg-white/10" : "border-border bg-muted/40 hover:bg-muted/70",
              )}
            >
              {referral!.image_url && (
                <img src={rewriteLocalMedia(referral!.image_url)} onError={(e) => { e.currentTarget.style.display = "none"; }} className="w-full max-h-[240px] object-cover block" loading="lazy" />
              )}
              <div className="px-2.5 py-2">
                {referral!.headline && (
                  <p className={cn("text-[13px] font-bold leading-tight line-clamp-2", darkBub ? "text-white" : "text-foreground")}>{referral!.headline}</p>
                )}
                {referral!.body && (
                  <p className={cn("text-[12px] leading-snug line-clamp-2 mt-0.5", darkBub ? "text-white/80" : "text-muted-foreground")}>{referral!.body}</p>
                )}
                <span className={cn("mt-1 inline-flex items-center gap-1 text-[11px] font-semibold", darkBub ? "text-white/90" : "text-primary")}>
                  <ExternalLink className="w-3 h-3" /> {t("inbox.viewAd")}
                </span>
              </div>
            </a>
          )}

          {/* ── Shared contact card(s) ── */}
          {contacts && contacts.length > 0 && (
            <div className="m-1 flex flex-col gap-1 min-w-[220px]">
              {contacts.map((c, i) => (
                <div key={i} className={cn("flex items-center gap-2.5 px-2.5 py-2 rounded-lg", darkBub ? "bg-white/10" : "bg-muted/50")}>
                  <div className={cn("w-9 h-9 rounded-full grid place-items-center text-[13px] font-bold shrink-0", darkBub ? "bg-white/20 text-white" : "bg-primary/15 text-primary")}>
                    {initials(c.name || "?")}
                  </div>
                  <div className="min-w-0">
                    <p className={cn("text-[13px] font-semibold truncate", darkBub ? "text-white" : "text-foreground")}>{c.name || t("broadcasts.contact")}</p>
                    <p className={cn("text-[11px] truncate inline-flex items-center gap-1", darkBub ? "text-white/70" : "text-muted-foreground")}>
                      <Phone className="w-3 h-3" />{c.phone || c.org || t("inbox.contactCard")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Shared location: map thumbnail + name/address, opens Maps ── */}
          {location && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("block m-1 rounded-lg overflow-hidden no-underline w-[260px] border", darkBub ? "border-white/25 bg-white/10 hover:bg-white/15" : "border-border bg-muted/40 hover:bg-muted/70")}
            >
              <div className="relative h-28 bg-muted">
                <img
                  src={osmTileUrl(location.latitude, location.longitude)}
                  className="w-full h-full object-cover block"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <MapPin className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full w-6 h-6 text-[#EF4444] drop-shadow" fill="#EF4444" strokeWidth={1.5} />
                <span className="absolute bottom-0.5 right-1 text-[8px] text-black/50 bg-white/60 px-0.5 rounded-sm">{t("inbox.openstreetmap")}</span>
              </div>
              <div className="px-2.5 py-2">
                <p className={cn("text-[13px] font-semibold truncate", darkBub ? "text-white" : "text-foreground")}>{location.name || t("components.location")}</p>
                <p className={cn("text-[11px] truncate", darkBub ? "text-white/70" : "text-muted-foreground")}>{location.address || `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`}</p>
              </div>
            </a>
          )}

          {/* ── Sticker ── */}
          {url && isSticker && (
            <div className="relative cursor-pointer group">
              <img
                src={url}
                className="w-36 h-36 object-contain"
                loading="lazy"
              />
              <div className="absolute bottom-0 right-0 flex items-center gap-1 bg-black/20 rounded-full px-1.5 py-0.5">
                <span className="text-[9px] text-white/90 drop-shadow-sm">{fmtTime(m.created_at)}</span>
                {out && <StatusIcon status={m.status} />}
              </div>
            </div>
          )}
          {/* ── Image ── */}
          {url && isImage && (
            <div
              className="relative cursor-pointer group"
              onClick={() => onPreviewMedia(m.id)}
            >
              <img
                src={url}
                className="max-h-[280px] min-w-[180px] max-w-[320px] object-cover block"
                loading="lazy"
              />
              {/* WhatsApp-style gradient overlay at bottom with time */}
              <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
              {!m.body && (
                <div className="absolute bottom-1 right-2 flex items-center gap-1">
                  <span className="text-[10px] text-white/90 drop-shadow-sm">{fmtTime(m.created_at)}</span>
                  {out && <StatusIcon status={m.status} />}
                </div>
              )}
            </div>
          )}

          {/* ── Video ── */}
          {url && isVideo && (
            <div
              className="relative cursor-pointer group"
              onClick={() => onPreviewMedia(m.id)}
            >
              <video
                src={url}
                preload="metadata"
                className="max-h-[280px] min-w-[180px] max-w-[320px] object-cover block"
                muted
              />
              {/* Play button overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm group-hover:bg-black/60 transition-colors">
                  <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
                </div>
              </div>
              {/* Bottom gradient with time */}
              <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
              {!m.body && (
                <div className="absolute bottom-1 right-2 flex items-center gap-1">
                  <span className="text-[10px] text-white/90 drop-shadow-sm">{fmtTime(m.created_at)}</span>
                  {out && <StatusIcon status={m.status} />}
                </div>
              )}
            </div>
          )}

          {/* ── Audio ── */}
          {url && isAudio && (
            <CustomAudioPlayer url={url} out={darkBub} />
          )}

          {/* ── Document card (WhatsApp style) ── */}
          {isDoc && ds && (
            <div
              className={cn("flex items-center gap-3 mx-1 my-1 px-3 py-2.5 rounded-lg cursor-pointer transition-colors", ds.bg, darkBub ? "hover:bg-white/20" : "hover:bg-black/[0.06]")}
              onClick={() => onPreviewMedia(m.id)}
            >
              {/* File type icon */}
              {ds.icon}
              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className={cn("text-[13px] font-semibold truncate", darkBub ? "text-white" : "text-slate-900")}>
                  {fname}
                </p>
                <p className={cn("text-[11px]", darkBub ? "text-white/60" : "text-muted-foreground")}>
                  {ds.label}
                </p>
              </div>
              {/* Download indicator */}
              <Download className={cn("w-4 h-4 shrink-0", darkBub ? "text-white/50" : "text-slate-400")} />
            </div>
          )}

          {/* ── OG link preview above the text (WhatsApp style) ── */}
          {firstUrl && <LinkPreviewCard url={firstUrl} out={darkBub} />}

          {/* ── Media still downloading server-side ── */}
          {mediaPending && (
            <div className="px-2.5 py-2 flex items-center gap-2">
              {m.type === "sticker"
                ? <StickerIcon className={cn("w-5 h-5", darkBub ? "text-white/70" : "text-muted-foreground")} />
                : <Loader2 className={cn("w-4 h-4 animate-spin", darkBub ? "text-white/60" : "text-muted-foreground")} />}
              <span className={cn("text-[13px]", darkBub ? "text-white/70" : "text-muted-foreground")}>
                {m.type === "sticker" ? t("components.sticker") : m.type === "video" ? t("components.video") : m.type === "audio" ? t("components.voiceMessage") : m.type === "image" ? t("components.photo") : t("components.document")}
              </span>
            </div>
          )}

          {/* ── Fallback: never render an empty bubble ── */}
          {isBlank && (
            <div className="px-2.5 py-1.5">
              <span className={cn("text-[13px] italic", darkBub ? "text-white/70" : "text-muted-foreground")}>
                {m.type === "unsupported" ? t("inbox.thisMessageCanTBe") : m.type === "order" ? t("inbox.order") : t("inbox.unsupportedMessage")}
              </span>
            </div>
          )}

          {/* ── Text body ── */}
          {m.body && (
            <div className="px-2.5 py-1.5 pb-2">
              {/* Voice note: the body is an auto-transcript, not typed text. Label it
                  so the agent knows it was machine-transcribed. */}
              {isAudio && (
                <span className={cn("flex items-center gap-1 text-[10px] font-semibold mb-0.5 uppercase tracking-wide", darkBub ? "text-white/60" : "text-muted-foreground")}>
                  <Mic className="w-2.5 h-2.5" /> {t("inbox.transcript")}
                </span>
              )}
              <span className="whitespace-pre-wrap break-words text-[13px] leading-[1.4] text-inherit align-top"><LinkifiedText text={m.body} out={darkBub} /></span>
              <span className="inline-flex items-center gap-1 ml-5 float-right translate-y-[5px]">
                <span className={cn("text-[10px]", darkBub ? "text-white/70" : "text-muted-foreground")}>{fmtTime(m.created_at)}</span>
                {out && <StatusIcon status={m.status} />}
              </span>
              {/* Clearfix for the float */}
              <div className="clear-both" />
            </div>
          )}

          {/* ── Time/status when there is media but NO body ── */}
          {(!m.body && (isAudio || isDoc)) && (
            <div className={cn("flex items-center justify-end gap-1 pb-1.5 pr-2 pt-0 mt-[-4px]")}>
              <span className={cn("text-[10px]", darkBub ? "text-white/70" : "text-muted-foreground")}>{fmtTime(m.created_at)}</span>
              {out && <StatusIcon status={m.status} />}
            </div>
          )}
        </div>

        {/* External time row: only for media-only (no body) that isn't image/video (those have overlay) */}
        {!m.body && !isImage && !isVideo && !isAudio && (
          <div className="flex items-center gap-1 mt-0.5 px-0.5">
            <span className="text-[10px] text-muted-foreground">{fmtTime(m.created_at)}</span>
            {out && <StatusIcon status={m.status} />}
          </div>
        )}
      </div>
      {!out && (m.body || msgLink) && <MessageMenu out={out} text={m.body ?? undefined} link={msgLink} onCopyText={onCopyText} onUseInComposer={onUseInComposer} onForward={onForward} />}
    </div>
  );
});

export default MessageBubble;
