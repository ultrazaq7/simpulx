"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, Phone, Mail, Tag as TagIcon, MessageSquare, Calendar, Clock,
  ExternalLink, Megaphone, User, Radio, FileText, Image as ImageIcon, Video, StickyNote,
} from "lucide-react";
import { api } from "@/lib/api";
import { initials, channelColor, fmtDate, fmtTime, relTime, cn, interestColor } from "@/lib/utils";
import type { Contact, Conversation, Message, InternalNote } from "@/lib/types";

// Stage chip colors — mirror the inbox/dashboard funnel palette.
const STAGE_COLORS: Record<string, string> = {
  new_lead: "#6366F1", "new lead": "#6366F1", contacted: "#0EA5E9", qualified: "#14B8A6",
  appointment: "#8B5CF6", negotiation: "#F59E0B", purchase: "#16A34A",
  test_drive: "#F59E0B", "test drive": "#F59E0B", booking: "#16A34A",
};
const stageColor = (name?: string | null) =>
  (name && (STAGE_COLORS[name.toLowerCase()] || STAGE_COLORS[name.toLowerCase().replace(/\s+/g, "_")])) || "#64748B";

function sourceLabel(c: Contact): string {
  if (c.source_id) return "Ad";
  if (c.web_api_source_name) return c.web_api_source_name;
  return c.source_channel || "Direct";
}
function isMedia(m: Message): "image" | "video" | "document" | null {
  if (!m.media_url) return null;
  if (m.type === "sticker" || m.type === "audio" || m.type === "call") return null;
  const ext = (m.media_url.split("?")[0].split(".").pop() || "").toLowerCase();
  if (["ogg", "mp3", "wav", "aac", "m4a", "opus"].includes(ext)) return null;
  if (m.type === "image" || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "image";
  if (m.type === "video" || ["mp4", "mov", "webm", "avi", "mkv"].includes(ext)) return "video";
  return "document";
}

export default function ContactDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [contact, setContact] = useState<Contact | null>(null);
  // Full history: every thread this contact has had (incl. closed), oldest first,
  // each with its own messages — not just the latest conversation.
  const [threads, setThreads] = useState<{ conv: Conversation; msgs: Message[] }[]>([]);
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"conversation" | "notes" | "media">("conversation");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [contacts, convs] = await Promise.all([
          api.listContacts().catch(() => []),
          api.listConversations().catch(() => []),
        ]);
        const c = (contacts || []).find((x) => x.id === id) || null;
        if (!alive) return;
        setContact(c);
        // Every conversation tied to this contact, oldest first.
        const mine = (convs || [])
          .filter((cv) => cv.contact_id === id)
          .sort((a, b) => (a.last_message_at || "").localeCompare(b.last_message_at || ""));
        const loaded = await Promise.all(
          mine.map(async (cv) => ({
            conv: cv,
            msgs: ((await api.getMessages(cv.id).catch(() => [])) || [])
              .slice()
              .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")),
            notes: (await api.getNotes(cv.id).catch(() => [])) || [],
          })),
        );
        if (!alive) return;
        setThreads(loaded.filter((t) => t.msgs.length > 0).map((t) => ({ conv: t.conv, msgs: t.msgs })));
        setNotes(loaded.flatMap((t) => t.notes).sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")));
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [id]);

  const allMessages = useMemo(() => threads.flatMap((t) => t.msgs), [threads]);
  const media = useMemo(() => allMessages.filter((m) => isMedia(m)), [allMessages]);

  if (loading) return <div className="grid place-items-center h-full"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!contact) return (
    <div className="grid place-items-center h-full text-center">
      <div>
        <p className="font-semibold text-foreground mb-1">Contact not found</p>
        <button onClick={() => router.push("/contacts")} className="text-[13px] font-semibold text-primary hover:underline outline-none">Back to contacts</button>
      </div>
    </div>
  );

  const c = contact;
  const chColor = channelColor(c.source_channel);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={() => router.push("/contacts")} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none"><ArrowLeft className="w-5 h-5" /></button>
        <p className="font-bold text-[15px] text-foreground">Contact details</p>
        <div className="flex-1" />
        {c.conversation_id && (
          <button onClick={() => router.push(`/inbox?c=${c.conversation_id}`)}
            className="inline-flex items-center gap-2 px-3.5 h-9 bg-primary text-white rounded-md text-[13px] font-semibold hover:bg-primary-dark shadow-sm transition-colors outline-none">
            <MessageSquare className="w-4 h-4" />Open in inbox
          </button>
        )}
      </div>

      {/* Body: 3 columns */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] overflow-hidden">
        {/* ── Left: identity ── */}
        <div className="border-r border-border bg-card overflow-y-auto p-5">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full grid place-items-center text-2xl font-bold ring-1 ring-inset ring-black/5"
              style={{ backgroundColor: chColor + "1A", color: chColor }}>
              {initials(c.full_name || c.phone)}
            </div>
            <p className="mt-3 text-[16px] font-bold text-foreground">{c.full_name || c.phone || "Unknown"}</p>
            {c.phone && <p className="text-[12.5px] text-muted-foreground tabular-nums">{c.phone}</p>}
            {c.stage_name && (
              <span className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                style={{ backgroundColor: stageColor(c.stage_name) + "1A", color: stageColor(c.stage_name) }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stageColor(c.stage_name) }} />
                {c.stage_name}
              </span>
            )}
          </div>

          <Section title="Activity">
            <Row icon={Calendar} label="Joined" value={fmtDate(c.created_at)} />
            <Row icon={Clock} label="Last message" value={c.last_message_at ? relTime(c.last_message_at) : "No messages"} />
            {c.interest_level && (
              <Row icon={Radio} label="Interest" value={
                <span className="inline-flex items-center gap-1.5 capitalize">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: interestColor(c.interest_level) }} />{c.interest_level}
                </span>
              } />
            )}
          </Section>

          <Section title="Contact info">
            <Row icon={Phone} label="Phone" value={c.phone || "-"} mono />
            <Row icon={Mail} label="Email" value="-" />
            <Row icon={Radio} label="Channel" value={c.channel_name || c.source_channel || "-"} />
          </Section>
        </div>

        {/* ── Center: tabs ── */}
        <div className="flex flex-col min-h-0 bg-background">
          <div className="flex items-center gap-1 px-4 border-b border-border bg-card shrink-0">
            {([["conversation", `Conversation (${allMessages.length})`], ["notes", `Notes (${notes.length})`], ["media", `Media (${media.length})`]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)}
                className={cn("relative px-3 py-2.5 text-[13px] font-semibold outline-none transition-colors", tab === k ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
                {label}
                {tab === k && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-primary" />}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {tab === "conversation" ? (
              allMessages.length === 0 ? <Empty icon={MessageSquare} text="No messages yet." /> : (
                <div className="space-y-2 max-w-[760px]">
                  {threads.map((t) => (
                    <div key={t.conv.id} className="space-y-2">
                      {/* Thread separator — each is a distinct conversation instance. */}
                      <div className="flex items-center gap-2 pt-3 pb-1">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap px-1">
                          {t.conv.campaign_name || "Conversation"}
                          {t.msgs[0] ? ` · ${fmtDate(t.msgs[0].created_at)}` : ""}
                          {t.conv.status === "closed" ? " · closed" : ""}
                        </span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                      {t.msgs.map((m) => {
                        const out = m.direction === "outbound";
                        return (
                          <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                            <div className={cn("max-w-[78%] px-3 py-2 rounded-lg text-[13px] whitespace-pre-wrap break-words shadow-xs border",
                              out ? "bg-primary/10 border-primary/20 text-foreground rounded-br-[4px]" : "bg-card border-border text-foreground rounded-bl-[4px]")}>
                              {m.type === "call" ? <span className="italic text-muted-foreground">{m.body}</span> : (m.body || (m.media_url ? `[${isMedia(m) || "media"}]` : ""))}
                              <span className="block text-[10px] text-muted-foreground text-right mt-0.5">{fmtDate(m.created_at)} {fmtTime(m.created_at)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )
            ) : tab === "notes" ? (
              notes.length === 0 ? <Empty icon={StickyNote} text="No internal notes yet." /> : (
                <div className="space-y-2.5 max-w-[760px]">
                  {notes.map((n) => (
                    <div key={n.id} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="text-[13px] text-foreground whitespace-pre-line">{n.body}</p>
                      <p className="text-[11px] text-muted-foreground mt-1.5">{n.author || "Unknown"} · {fmtDate(n.created_at)} {fmtTime(n.created_at)}</p>
                    </div>
                  ))}
                </div>
              )
            ) : (
              media.length === 0 ? <Empty icon={ImageIcon} text="No media shared yet." /> : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {media.map((m) => {
                    const kind = isMedia(m);
                    return (
                      <a key={m.id} href={m.media_url || "#"} target="_blank" rel="noreferrer"
                        className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted group">
                        {kind === "image" ? (
                          <img src={m.media_url!} className="w-full h-full object-cover" alt="" />
                        ) : kind === "video" ? (
                          <><video src={m.media_url! + "#t=0.1"} preload="metadata" className="w-full h-full object-cover" />
                            <span className="absolute inset-0 grid place-items-center"><Video className="w-7 h-7 text-white drop-shadow" /></span></>
                        ) : (
                          <span className="absolute inset-0 grid place-items-center"><FileText className="w-8 h-8 text-muted-foreground" /></span>
                        )}
                      </a>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>

        {/* ── Right: attributes ── */}
        <div className="border-l border-border bg-card overflow-y-auto p-5">
          <Section title="Labels" first>
            {c.tags && c.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {c.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-semibold"><TagIcon className="w-3 h-3" />{t}</span>
                ))}
              </div>
            ) : <p className="text-[12.5px] text-muted-foreground">No labels</p>}
          </Section>

          <Section title="Assignment">
            <Row icon={Megaphone} label="Campaign" value={c.campaign_name || "-"} />
            <Row icon={User} label="Agent" value={c.agent_name || "Unassigned"} />
          </Section>

          <Section title="Source">
            <Row icon={Radio} label="Source" value={<span className="capitalize">{sourceLabel(c)}</span>} />
            <Row icon={ExternalLink} label="Source ID" value={c.source_id || "-"} mono />
            <Row icon={ExternalLink} label="Source URL" value={
              c.source_url
                ? <a href={c.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><ExternalLink className="w-3.5 h-3.5" />Open link</a>
                : "-"
            } />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children, first }: { title: string; children: React.ReactNode; first?: boolean }) {
  return (
    <div className={first ? "" : "mt-6"}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">{title}</p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}
function Row({ icon: Icon, label, value, mono }: { icon: any; label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <div className={cn("text-[13px] font-semibold text-foreground break-words", mono && "font-mono")}>{value}</div>
      </div>
    </div>
  );
}
function Empty({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="text-center py-16">
      <div className="w-12 h-12 rounded-xl bg-muted grid place-items-center mx-auto mb-3"><Icon className="w-6 h-6 text-muted-foreground/50" /></div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
