"use client";
import { useI18n } from "@/lib/i18n";
import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Copy, User, Phone, Hash, MessageSquare, Clock, StickyNote, Tag as TagIcon, Plus, Paperclip, Download, FileText, Image as ImageIcon, Video, Mic, Trash2, Check, ChevronDown, Search, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { initials, channelColor, channelTextColor, channelLabel, fmtDate, fmtTime, fmtDateTimeShort, cn } from "@/lib/utils";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Tip } from "@/components/ui/tooltip";
import { segmentFields } from "@/lib/segments";
import type { Agent, Conversation, InternalNote, Message } from "@/lib/types";

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
  const { t } = useI18n();
  return (
    <div className="flex gap-3 py-2 border-b border-border/50 last:border-0">
      <Icon className="w-4 h-4 text-muted-foreground/60 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
        <div className="flex items-center gap-1">
          <p className="text-xs font-semibold text-foreground truncate">{value}</p>
          {copyable && (
            <Tip label={t("automation.copy")}>
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
  showAgent?: boolean;
  agents?: Agent[];
  canAssign?: boolean;
  onReassign?: (agentId: string) => void;
  onUnassign?: () => void;
}

export default function DetailsPanel({ active, onClose, copyText, notes, onAddNote, onDeleteNote, messages, channelName, showAgent, agents, canAssign, onReassign, onUnassign }: DetailsPanelProps) {
  const { t } = useI18n();
  const media = (messages || []).filter((m) => m.media_url && m.type !== "sticker"); // stickers are not attachments
  const mediaFiles = media.filter((m) => m.type === "image" || m.type === "video");
  const docFiles = media.filter((m) => !(m.type === "image" || m.type === "video"));
  const [tab, setTab] = useState<"info" | "files" | "notes">("info");
  const [noteDraft, setNoteDraft] = useState("");

  // Labels = the contact's tags (editable inline, SleekFlow-style)
  const [tags, setTags] = useState<string[]>(active.tags ?? []);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignQuery, setAssignQuery] = useState("");
  useEffect(() => { setTags(active.tags ?? []); setTagOpen(false); setTagDraft(""); setAssignOpen(false); setAssignQuery(""); }, [active.id]); // eslint-disable-line react-hooks/exhaustive-deps



  const saveTags = (next: string[]) => {
    setTags(next);
    if (active.contact_id) api.updateContact(active.contact_id, { tags: next }).catch(() => {});
  };
  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,$/, "");
    if (t && !tags.includes(t)) saveTags([...tags, t]);
    setTagDraft("");
    setTagOpen(false);
  };

  const submitNote = async () => {
    if (!noteDraft.trim()) return;
    await onAddNote(noteDraft.trim());
    setNoteDraft("");
  };

  return (
    <>
      {/* Mobile backdrop — the panel is an overlay below lg */}
      <div className="lg:hidden fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden />
      <div className="w-80 shrink-0 flex flex-col border-l border-border bg-card max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-50 max-lg:w-[85vw] max-lg:max-w-sm max-lg:shadow-2xl">
      {/* Header */}
      <div className="h-14 shrink-0 px-4 flex items-center border-b border-border">
        <p className="font-bold text-sm flex-1 text-foreground">{t("components.details")}</p>
        <button aria-label={t("inbox.closeDetails")} onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none">
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
            <div className="flex items-center gap-2 min-w-0">
              {active.contact_id ? (
                <Tip label={t("inbox.viewContactDetails")} side="bottom" align="start">
                  <Link href={`/contacts/${active.contact_id}`} className="font-bold text-[15px] text-foreground truncate hover:text-primary hover:underline outline-none block">
                    {active.contact_name || t("broadcasts.unknown")}
                  </Link>
                </Tip>
              ) : (
                <p className="font-bold text-[15px] text-foreground truncate">{active.contact_name || t("broadcasts.unknown")}</p>
              )}
              {typeof active.lead_score === "number" && (
                <Tip label={t("contacts.leadScore")} side="top"><span><ScoreBadge score={active.lead_score} size={28} /></span></Tip>
              )}
            </div>
            {active.contact_phone && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground tabular-nums">{active.contact_phone}</span>
                <button aria-label={t("inbox.copyPhoneNumber")} onClick={() => copyText(active.contact_phone!)} className="p-0.5 rounded hover:bg-muted outline-none text-primary/70 hover:text-primary">
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
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><TagIcon className="w-3.5 h-3.5 text-primary" />{t("contacts.labels")}</p>
                <Tip label={t("contacts.addLabel")}><button onClick={() => setTagOpen((v) => !v)} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none"><Plus className="w-3.5 h-3.5" /></button></Tip>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.length === 0 && !tagOpen && <span className="text-xs text-muted-foreground">{t("inbox.noLabelsYet")}</span>}
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
                  placeholder={t("contacts.addALabelAndPress")}
                  className="mt-2 w-full h-8 px-3 rounded-md border border-input bg-background text-[13px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              )}
            </div>

            {/* Assigned agent (manager/admin can reassign) — compact DetailRow style */}
            {showAgent && (
              <div className="mb-5">
                <div className="flex gap-3 py-2 border-b border-border/50">
                  <User className="w-4 h-4 text-muted-foreground/60 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">{t("inbox.assignedAgent")}</p>
                    {canAssign ? (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setAssignOpen((v) => !v)}
                          className="flex items-center gap-1 outline-none group"
                        >
                          <span className={cn("text-xs font-semibold truncate", active.agent_name ? "text-foreground" : "text-amber-700")}>{active.agent_name || t("dashboard.unassigned")}</span>
                          <ChevronDown className={cn("w-3 h-3 shrink-0 text-muted-foreground/60 transition-transform", assignOpen && "rotate-180")} />
                        </button>
                        {assignOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => { setAssignOpen(false); setAssignQuery(""); }} />
                            <div className="absolute left-0 top-full mt-1 z-50 w-60 max-h-[340px] flex flex-col rounded-lg border border-border bg-popover shadow-xl animate-scale-in">
                              <div className="p-2 border-b border-border shrink-0">
                                <div className="relative">
                                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                                  <input autoFocus value={assignQuery} onChange={(e) => setAssignQuery(e.target.value)} placeholder={t("inbox.searchNameOrEmail")}
                                    className="w-full h-8 pl-8 pr-2 rounded-md border border-input bg-background text-[13px] outline-none focus:border-primary" />
                                </div>
                              </div>
                              <div className="overflow-auto py-1 flex-1 min-h-0">
                                <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("contacts.assignTo")}</p>
                                {(() => {
                                  const q = assignQuery.trim().toLowerCase();
                                  const matches = (agents || []).filter((ag) => ag.full_name.toLowerCase().includes(q) || (ag.email || "").toLowerCase().includes(q));
                                  if (matches.length === 0) return <p className="text-center text-xs text-muted-foreground py-3">{t("components.noAgents")}</p>;
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
                                      <XCircle className="w-3.5 h-3.5 shrink-0" />{t("contacts.unassign")}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <p className={cn("text-xs font-semibold truncate", active.agent_name ? "text-foreground" : "text-amber-700")}>{active.agent_name || t("dashboard.unassigned")}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{t("components.customerDetails")}</p>
            <div className="mb-5">
              <DetailRow icon={User} label={t("account.name")} value={active.contact_name || "Unknown"} />
              <DetailRow icon={Phone} label={t("contacts.phone")} value={active.contact_phone || "None"} copyable={!!active.contact_phone} onCopy={() => active.contact_phone && copyText(active.contact_phone)} />
              <DetailRow icon={Hash} label={t("components.channel")} value={channelName || channelLabel(active.channel)} />
              {active.campaign_name && <DetailRow icon={Hash} label={t("automation.campaign")} value={active.campaign_name} />}
              <DetailRow icon={MessageSquare} label={t("automation.status")} value={humanize(active.status)} />
              <DetailRow icon={Clock} label={t("components.lastMessage")} value={active.last_message_at ? fmtDateTimeShort(active.last_message_at) : "No messages"} />
              {active.status === "snoozed" && active.snoozed_until && (
                <DetailRow icon={Clock} label={t("inbox.snoozedUntil")} value={`${fmtDate(active.snoozed_until)} ${fmtTime(active.snoozed_until)}`} />
              )}
            </div>

            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{t("contacts.leadQualification")}</p>
            {/* Only render fields the AI has actually captured — empty ones are hidden. */}
            <div>
              {active.stage_name && <DetailRow icon={Hash} label={t("contacts.stage")} value={active.stage_name} />}
              {/* Lost reason sits directly under the stage while the lead is Lost. */}
              {active.stage_name?.toLowerCase().startsWith("lost") && active.lost_reason && (
                <DetailRow icon={StickyNote} label={t("contacts.lostReason")} value={humanize(active.lost_reason)} />
              )}
              {active.interest_level && <DetailRow icon={Hash} label={t("dashboard.interestLevel")} value={humanize(active.interest_level)} />}
              {segmentFields(active.campaign_segment).map((f) => (
                active.lead_fields?.[f.key] ? <DetailRow key={f.key} icon={Hash} label={t(f.label)} value={humanize(String(active.lead_fields[f.key]))} /> : null
              ))}
              {/* AI-written recap of the lead (lead_summary), shown last as free-text
                  remarks so nuance that doesn't fit a qualifier field lives here.
                  NOT a DetailRow: that truncates to one line, which cuts a 1-3 sentence
                  summary mid-word. Free text wraps instead. */}
              {active.lead_summary && (
                <div className="flex gap-3 py-2">
                  <StickyNote className="w-4 h-4 text-muted-foreground/60 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">{t("contacts.aiNotes")}</p>
                    <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-line break-words">{active.lead_summary}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {tab === "files" && (
          <div className="p-4 space-y-5">
            <AttachmentSection title={t("inbox.media")} items={mediaFiles} empty={t("inbox.noPhotosOrVideosYet")} />
            <AttachmentSection title={t("inbox.documents")} items={docFiles} empty={t("inbox.noDocumentsYet")} />
          </div>
        )}
        {tab === "notes" && (
          <div className="p-4">
            <div className="mb-4">
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={2}
                placeholder={t("contacts.addANoteVisibleTo")}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none resize-none focus:border-amber focus:ring-2 focus:ring-amber/20"
              />
              <button
                onClick={submitNote}
                disabled={!noteDraft.trim()}
                className="mt-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-amber hover:bg-amber/90 disabled:opacity-50 outline-none transition-colors"
              >
                {t("components.addNote")}
              </button>
            </div>
            {notes.length === 0 ? (
              <div className="flex flex-col items-center text-center py-10">
                <div className="w-10 h-10 rounded-lg bg-muted grid place-items-center mb-2">
                  <StickyNote className="w-5 h-5 text-muted-foreground/50" />
                </div>
                <p className="text-sm text-muted-foreground">{t("components.noInternalNotesYet")}</p>
              </div>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="mb-2.5 p-3 rounded-lg border border-amber-200 bg-amber-50 relative group">
                  <p className="text-xs text-foreground whitespace-pre-wrap pr-5">{n.body}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{n.author || t("broadcasts.unknown")} - {fmtTime(n.created_at)}</p>
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
    </>
  );
}
