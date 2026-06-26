"use client";
import { useEffect, useState } from "react";
import { X, Copy, User, Phone, Hash, MessageSquare, Clock, StickyNote, Tag as TagIcon, Plus, Paperclip, Download, FileText, Image as ImageIcon, Video, Mic, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { initials, channelColor, channelTextColor, channelLabel, fmtDate, fmtTime, cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";
import type { Conversation, InternalNote, Message } from "@/lib/types";

function rewriteLocalMedia(url: string): string {
  if (typeof window !== "undefined" && window.location.hostname === "localhost" && url.includes("ngrok-free.dev")) {
    return url.replace(/https?:\/\/[^/]+/, "http://localhost:8080");
  }
  return url;
}
function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.has("name")) return u.searchParams.get("name")!;
    const last = u.pathname.split("/").pop() || "file";
    return decodeURIComponent(last).replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "") || "File";
  } catch { return "File"; }
}
function mediaIcon(type: string) {
  if (type === "image") return ImageIcon;
  if (type === "video") return Video;
  if (type === "audio") return Mic;
  return FileText;
}

// Turn enum-ish values (e.g. "bought_other_brand") into readable text ("Bought other brand").
function humanize(s: string): string {
  return s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\w/, (c) => c.toUpperCase());
}

function AttachmentSection({ title, items, empty }: { title: string; items: Message[]; empty: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
        {title}{items.length > 0 && <span className="text-muted-foreground/60"> ({items.length})</span>}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((m) => {
            const url = rewriteLocalMedia(m.media_url!);
            const Icon = mediaIcon(m.type);
            return (
              <a key={m.id} href={url} target="_blank" rel="noreferrer" className="group flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted transition-colors">
                <div className="w-9 h-9 rounded-md bg-muted grid place-items-center shrink-0 text-muted-foreground"><Icon className="w-4 h-4" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold text-foreground truncate">{fileNameFromUrl(url)}</p>
                  <p className="text-[11px] text-muted-foreground capitalize">{m.type} · {fmtDate(m.created_at)}</p>
                </div>
                <Download className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary shrink-0" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, copyable, onCopy }: {
  icon: any; label: string; value: string; copyable?: boolean; onCopy?: () => void;
}) {
  return (
    <div className="flex gap-3 py-2 border-b border-border/50 last:border-0">
      <Icon className="w-4 h-4 text-muted-foreground/60 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
        <div className="flex items-center gap-1">
          <p className="text-xs font-semibold text-foreground truncate">{value}</p>
          {copyable && (
            <Tip label="Copy">
              <button onClick={onCopy} className="p-0.5 rounded hover:bg-muted outline-none text-primary/70 hover:text-primary">
                <Copy className="w-3 h-3" />
              </button>
            </Tip>
          )}
        </div>
      </div>
    </div>
  );
}

interface DetailsPanelProps {
  active: Conversation;
  onClose: () => void;
  copyText: (text: string) => void;
  notes: InternalNote[];
  onAddNote: (body: string) => void | Promise<void>;
  onDeleteNote: (noteId: string) => void | Promise<void>;
  messages?: Message[];
  channelName?: string; // real channel name (e.g. "Testing Channel"), not the type
}

export default function DetailsPanel({ active, onClose, copyText, notes, onAddNote, onDeleteNote, messages, channelName }: DetailsPanelProps) {
  const media = (messages || []).filter((m) => m.media_url && m.type !== "sticker"); // stickers are not attachments
  const mediaFiles = media.filter((m) => m.type === "image" || m.type === "video");
  const docFiles = media.filter((m) => !(m.type === "image" || m.type === "video"));
  const [tab, setTab] = useState<"info" | "files" | "notes">("info");
  const [noteDraft, setNoteDraft] = useState("");

  // Labels = the contact's tags (editable inline, SleekFlow-style)
  const [tags, setTags] = useState<string[]>(active.tags ?? []);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  useEffect(() => { setTags(active.tags ?? []); setTagOpen(false); setTagDraft(""); }, [active.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTags = (next: string[]) => {
    setTags(next);
    if (active.contact_id) api.updateContact(active.contact_id, { tags: next }).catch(() => {});
  };
  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,$/, "");
    if (t && !tags.includes(t)) saveTags([...tags, t]);
    setTagDraft("");
  };

  const submitNote = async () => {
    if (!noteDraft.trim()) return;
    await onAddNote(noteDraft.trim());
    setNoteDraft("");
  };

  return (
    <div className="w-80 shrink-0 flex flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="h-14 shrink-0 px-4 flex items-center border-b border-border">
        <p className="font-bold text-sm flex-1 text-foreground">Details</p>
        <button aria-label="Close details" onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none">
          <X className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* Contact header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <div
              className="w-12 h-12 rounded-xl grid place-items-center text-lg font-bold ring-1 ring-inset ring-black/5"
              style={{ backgroundColor: channelColor(active.channel) + "1A", color: channelTextColor(active.channel) }}
            >
              {initials(active.contact_name || active.contact_phone)}
            </div>

          </div>
          <div className="min-w-0">
            <p className="font-bold text-[15px] text-foreground truncate">{active.contact_name || "Unknown"}</p>
            {active.contact_phone && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground tabular-nums">{active.contact_phone}</span>
                <button aria-label="Copy phone number" onClick={() => copyText(active.contact_phone!)} className="p-0.5 rounded hover:bg-muted outline-none text-primary/70 hover:text-primary">
                  <Copy className="w-[11px] h-[11px]" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-1 shrink-0">
        {([
          { key: "info" as const, label: "Contact", Icon: User, count: 0 },
          { key: "notes" as const, label: "Notes", Icon: StickyNote, count: notes.length },
          { key: "files" as const, label: "Files", Icon: Paperclip, count: media.length },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors outline-none",
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.Icon className="w-4 h-4" />
            {t.label}
            {t.count > 0 && (
              <span className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-muted text-muted-foreground text-[10px] font-bold grid place-items-center tabular-nums">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {tab === "info" && (
          <div className="p-4">
            {/* Labels (the contact's tags, editable inline) */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><TagIcon className="w-3.5 h-3.5 text-primary" />Labels</p>
                <Tip label="Add label"><button onClick={() => setTagOpen((v) => !v)} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none"><Plus className="w-3.5 h-3.5" /></button></Tip>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.length === 0 && !tagOpen && <span className="text-xs text-muted-foreground">No labels yet</span>}
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                    {t}
                    <button onClick={() => saveTags(tags.filter((x) => x !== t))} className="hover:text-primary-dark outline-none"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              {tagOpen && (
                <input
                  autoFocus
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && tagDraft.trim()) { e.preventDefault(); addTag(tagDraft); } else if (e.key === "Escape") { setTagOpen(false); setTagDraft(""); } }}
                  placeholder="Add a label and press Enter"
                  className="mt-2 w-full h-8 px-3 rounded-md border border-input bg-background text-[13px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              )}
            </div>

            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Customer details</p>
            <div className="mb-5">
              <DetailRow icon={User} label="Full name" value={active.contact_name || "Unknown"} />
              <DetailRow icon={Phone} label="Phone" value={active.contact_phone || "None"} copyable={!!active.contact_phone} onCopy={() => active.contact_phone && copyText(active.contact_phone)} />
              <DetailRow icon={Hash} label="Channel" value={channelName || channelLabel(active.channel)} />
              {active.campaign_name && <DetailRow icon={Hash} label="Campaign" value={active.campaign_name} />}
              <DetailRow icon={MessageSquare} label="Status" value={humanize(active.status)} />
              <DetailRow icon={Clock} label="Last message" value={active.last_message_at ? `${fmtDate(active.last_message_at)} ${fmtTime(active.last_message_at)}` : "No messages"} />
              {active.status === "snoozed" && active.snoozed_until && (
                <DetailRow icon={Clock} label="Snoozed until" value={`${fmtDate(active.snoozed_until)} ${fmtTime(active.snoozed_until)}`} />
              )}
            </div>

            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Lead qualification</p>
            <div>
              <DetailRow icon={Hash} label="Stage" value={active.stage_name || "Not set"} />
              {/* Lost reason sits directly under the stage while the lead is Lost. */}
              {active.stage_name?.toLowerCase() === "lost" && active.lost_reason && (
                <DetailRow icon={StickyNote} label="Lost reason" value={humanize(active.lost_reason)} />
              )}
              <DetailRow icon={Hash} label="Interest level" value={humanize(active.interest_level || "Unknown")} />
              <DetailRow icon={Hash} label="Brand" value={active.car_brand || "Unknown"} />
              <DetailRow icon={Hash} label="Model" value={active.car_model || "Unknown"} />
              <DetailRow icon={Hash} label="City" value={active.city || "Unknown"} />
              <DetailRow icon={Clock} label="Purchase time" value={active.purchase_timeframe ? humanize(active.purchase_timeframe) : "Unknown"} />
            </div>
          </div>
        )}
        {tab === "files" && (
          <div className="p-4 space-y-5">
            <AttachmentSection title="Media" items={mediaFiles} empty="No photos or videos yet" />
            <AttachmentSection title="Documents" items={docFiles} empty="No documents yet" />
          </div>
        )}
        {tab === "notes" && (
          <div className="p-4">
            <div className="mb-4">
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={2}
                placeholder="Add a note (visible to your team only)"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none resize-none focus:border-amber focus:ring-2 focus:ring-amber/20"
              />
              <button
                onClick={submitNote}
                disabled={!noteDraft.trim()}
                className="mt-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-amber hover:bg-amber/90 disabled:opacity-50 outline-none transition-colors"
              >
                Add note
              </button>
            </div>
            {notes.length === 0 ? (
              <div className="flex flex-col items-center text-center py-10">
                <div className="w-10 h-10 rounded-lg bg-muted grid place-items-center mb-2">
                  <StickyNote className="w-5 h-5 text-muted-foreground/50" />
                </div>
                <p className="text-sm text-muted-foreground">No internal notes yet</p>
              </div>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="mb-2.5 p-3 rounded-lg border border-amber-200 bg-amber-50 relative group">
                  <p className="text-xs text-foreground whitespace-pre-wrap pr-5">{n.body}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{n.author || "Unknown"} - {fmtTime(n.created_at)}</p>
                  <button onClick={() => onDeleteNote(n.id)} className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-amber-200 text-amber-700/50 hover:text-amber-800 opacity-0 group-hover:opacity-100 transition-opacity outline-none">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
