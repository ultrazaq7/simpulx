"use client";
import { useI18n } from "@/lib/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { X, Search, MessageSquare } from "lucide-react";
import { cn, channelColor, channelTextColor, initials } from "@/lib/utils";

import { api, getUser, WS_URL } from "@/lib/api";
import { dateLabel } from "@/lib/utils";
import { useEscClose } from "@/lib/useEscClose";
import type { Agent, Channel, Conversation, Disposition, InternalNote, Message, QuickReply, Stage } from "@/lib/types";
import ChatPanel, { type Item } from "./components/ChatPanel";
import ConversationList, { type SortMode } from "./components/ConversationList";
import DetailsPanel from "./components/DetailsPanel";
import { Toast as ToastView } from "@/components/Toast";

// --- Toast helper ----------------------------------------
type Toast = { msg: string; severity: "success" | "info" | "warning" | "error" };

// WhatsApp Cloud API media caps. Reject oversize on the client so the user gets an
// instant, specific reason instead of a request that spins and silently fails.
function fileTooLargeMessage(f: File): string | null {
  const mb = f.size / (1024 * 1024);
  let max = 100, label = "File"; // documents / other
  if (f.type.startsWith("image/")) { max = 5; label = "Image"; }
  else if (f.type.startsWith("video/")) { max = 16; label = "Video"; }
  else if (f.type.startsWith("audio/")) { max = 16; label = "Audio"; }
  if (mb > max) return `${label} too large (${mb.toFixed(1)} MB). Max ${max} MB.`;
  return null;
}

// -
// MAIN PAGE
// -
export default function InboxPage() {
  const { t } = useI18n();
  // --- Core state ---
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [convsLoading, setConvsLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingPreviews, setPendingPreviews] = useState<(string | null)[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [dispositions, setDispositions] = useState<Disposition[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [campaignOpts, setCampaignOpts] = useState<{ id: string; name: string; agent_ids?: string[] }[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [forwardText, setForwardText] = useState<string | null>(null);

  // --- Left panel state (multi-select filter model) ---
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterStages, setFilterStages] = useState<string[]>([]);
  const [filterCampaigns, setFilterCampaigns] = useState<string[]>([]);
  const [filterInterests, setFilterInterests] = useState<string[]>([]);
  const [filterAgents, setFilterAgents] = useState<string[]>([]);
  const [filterChannels, setFilterChannels] = useState<string[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const showAgent = getUser()?.role !== "agent"; // manager/admin see + filter by agent
  const [followUpOnly, setFollowUpOnly] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [needsReplyOnly, setNeedsReplyOnly] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false); // ?assigned=unassigned from dashboard
  const [lostReasonFilter, setLostReasonFilter] = useState<string | null>(null); // ?lost_reason= from dashboard

  // Deep-link from Dashboard: initialize filters from URL params
  // (?interest=hot, ?status=open, ?unread=1, ?followup=1, ?stage=<name>)
  const pendingStageRef = useRef<string | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const interest = sp.get("interest");
    const status = sp.get("status");
    const c = sp.get("c");
    if (interest) setFilterInterests([interest]);
    if (status) setFilterStatuses([status]);
    if (sp.get("unread") === "1") setUnreadOnly(true);
    if (sp.get("followup") === "1") setFollowUpOnly(true);
    // "Awaiting reply" dashboard card -> customer-waiting filter (repurposed).
    if (sp.get("unreplied") === "1") setNeedsReplyOnly(true);
    if (sp.get("assigned") === "unassigned") setUnassignedOnly(true); // dashboard Unassigned card
    const lr = sp.get("lost_reason"); if (lr) setLostReasonFilter(lr); // Lost-reasons chart drill-in
    // Dashboard KPI cards carry their active filters so the inbox opens matching
    // the card's count (source/date have no inbox equivalent, so they don't map).
    const camp = sp.get("campaign"); if (camp) setFilterCampaigns(camp.split(","));
    const agent = sp.get("agent"); if (agent) setFilterAgents(agent.split(","));
    const channel = sp.get("channel"); if (channel) setFilterChannels(channel.split(","));
    pendingStageRef.current = sp.get("stage");
    if (c) setActiveId(c); // deep-link to a conversation (Copy link to message)
  }, []);
  // Resolve ?stage=<name> once stages load (dashboard "Your stages" deep-link).
  // Accepts one or more comma-separated names — the "Lost" row can map to several
  // lost-keyed stages, so we match them all instead of a single literal "Lost".
  useEffect(() => {
    const raw = pendingStageRef.current;
    if (!raw || stages.length === 0) return;
    const wanted = new Set(raw.split(",").map((n) => n.trim().toLowerCase()).filter(Boolean));
    const ids = stages.filter((s) => wanted.has(s.name.toLowerCase())).map((s) => s.id);
    if (ids.length) setFilterStages(ids);
    pendingStageRef.current = null;
  }, [stages]);

  // Open a conversation from anywhere (notification click) even while already on
  // this page — router.push to the same route doesn't re-run the mount effect.
  useEffect(() => {
    const onOpen = (e: Event) => { const id = (e as CustomEvent).detail as string; if (id) setActiveId(id); };
    window.addEventListener("inbox:open", onOpen as EventListener);
    return () => window.removeEventListener("inbox:open", onOpen as EventListener);
  }, []);

  // Keep the open conversation in the URL (?c=<id>) so a refresh reopens it
  // instead of dropping back to the empty state. Mount reads ?c above.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (activeId) url.searchParams.set("c", activeId);
    else url.searchParams.delete("c");
    window.history.replaceState(null, "", url.toString());
  }, [activeId]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const showDetailsRef = useRef(false); // so the Esc handler reads the latest value without re-binding
  showDetailsRef.current = showDetails;

  const active = convs.find((c) => c.id === activeId) || null;

  // Deep-linked conversation (?c=) that isn't in the loaded list (closed, out of
  // the current scope, or beyond the page): fetch it by id once and prepend, so
  // links from the dashboard always open the chat instead of a blank pane.
  const deepLinkFetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const id = activeId;
    if (!id || convs.some((c) => c.id === id) || deepLinkFetchedRef.current.has(id)) return;
    deepLinkFetchedRef.current.add(id);
    api.getConversation(id)
      .then((c) => { if (c?.id) setConvs((prev) => (prev.some((x) => x.id === c.id) ? prev : [c, ...prev])); })
      .catch(() => { /* gone or no access; leave the pane empty */ });
  }, [activeId, convs]);

  // Live Simpuler phase per conversation (WS-C). "thinking" drives a typing
  // indicator; a safety timer clears it if the "replied"/"handoff" signal is lost.
  const [aiActivity, setAiActivity] = useState<Record<string, string>>({});
  const aiTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const queryClient = useQueryClient();
  const messagesQuery = useInfiniteQuery({
    queryKey: ["messages", activeId],
    queryFn: ({ pageParam }) => api.getMessagesPaginated(activeId!, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor || undefined,
    enabled: !!activeId,
    staleTime: 1000 * 60 * 5,
  });

  const messages = useMemo(() => {
    if (!messagesQuery.data) return [];
    return messagesQuery.data.pages.slice().reverse().flatMap((p) => p.data || []);
  }, [messagesQuery.data]);

  // --- Timeline computation ---
  const timeline = useMemo<Item[]>(() => {
    // Hide the legacy "Incoming WhatsApp call" system text: it duplicated the call
    // summary card. The insert was removed, but old rows linger in the thread.
    const visibleMsgs = messages.filter((m) => !(m.type === "text" && m.body === "Incoming WhatsApp call"));
    const raw = [
      ...visibleMsgs.map((m) => ({ t: m.created_at, kind: "msg" as const, m })),
      ...(notes || []).map((n) => ({ t: n.created_at, kind: "note" as const, n })),
    ].sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
    const out: Item[] = []; let lastDay = "";
    for (const r of raw) {
      const day = new Date(r.t).toDateString();
      if (day !== lastDay) { out.push({ kind: "date", key: "d" + day, label: dateLabel(r.t) }); lastDay = day; }
      out.push(r.kind === "msg" ? { kind: "msg", key: r.m.id, m: r.m } : { kind: "note", key: "n" + r.n.id, n: r.n });
    }
    return out;
  }, [messages, notes]);

  const rowVirtualizer = useVirtualizer({
    count: timeline.length,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => 100,
    overscan: 10,
  });

  // Date scope carried from a dashboard drill-in (?from=&to=). Surfaced as a
  // dismissible chip (the only date affordance in the inbox); clearing reloads all.
  const [dateScope, setDateScope] = useState<{ from: string; to: string; source: string }>(() => {
    if (typeof window === "undefined") return { from: "", to: "", source: "" };
    const sp = new URLSearchParams(window.location.search);
    return { from: sp.get("from") || "", to: sp.get("to") || "", source: sp.get("source") || "" };
  });
  const dateScopeRef = useRef(dateScope);
  dateScopeRef.current = dateScope;

  // --- Data loaders ---
  const loadConvs = useCallback(async () => {
    try {
      const { from, to, source } = dateScopeRef.current;
      const list = (await api.listConversations("", from, to, source)) || [];
      const aid = activeIdRef.current;
      // The conversation you're viewing is always read - never show its badge.
      setConvs(aid ? list.map((c) => (c.id === aid ? { ...c, unread_count: 0 } : c)) : list);
    } catch { } finally { setConvsLoading(false); }
  }, []);

  const clearDateScope = useCallback(() => {
    dateScopeRef.current = { from: "", to: "", source: "" };
    setDateScope({ from: "", to: "", source: "" });
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("from");
      url.searchParams.delete("to");
      url.searchParams.delete("source");
      window.history.replaceState({}, "", url.toString());
    }
    loadConvs();
  }, [loadConvs]);

  useEffect(() => { loadConvs(); }, [loadConvs]);
  // Polling fallback: refresh every 15s as safety net
  useEffect(() => {
    const iv = setInterval(() => loadConvs(), 15000);
    return () => clearInterval(iv);
  }, [loadConvs]);
  useEffect(() => {
    api.listQuickReplies().then(res => setQuickReplies(res || [])).catch(() => { });
    api.listStages().then(res => setStages(res || [])).catch(() => { });
    api.listDispositions().then(res => setDispositions(res || [])).catch(() => { });
    api.listAgents().then(res => setAgents(res || [])).catch(() => { });
    api.listChannels().then(res => setChannels(res || [])).catch(() => { });
    api.listCampaigns().then(res => setCampaignOpts((res || []).map((c: any) => ({ id: c.id, name: c.name, agent_ids: c.agent_ids || [] })))).catch(() => { });
  }, []);

  // Tab title (with unread count) is owned solely by Shell to avoid two effects
  // fighting over document.title on the inbox.

  // --- Mark active as read ---
  useEffect(() => {
    if (!activeId) return;
    setConvs((prev) => prev.map((c) => (c.id === activeId ? { ...c, unread_count: 0 } : c)));
    api.patchConversation(activeId, { unread_count: 0 })
      .then(() => window.dispatchEvent(new CustomEvent("refreshUnread")))
      .catch(() => { });
  }, [activeId]);

  // Esc closes the conversation (right details panel first), routed through the
  // shared LIFO stack: any open dropdown/menu closes before it, and the sidebars
  // collapse after it (dropdown -> conversation -> settings sidebar -> main).
  useEscClose(!!activeId, () => {
    if (showDetailsRef.current) setShowDetails(false);
    else setActiveId(null);
  }, -1);

  // --- Load notes for active conversation ---
  useEffect(() => {
    if (activeId) { api.getNotes(activeId).then(res => setNotes(res || [])).catch(() => { }); }
  }, [activeId]);

  // --- WebSocket event handler ---
  useEffect(() => {
    const handleWSMessage = async (e: any) => {
      const ev = e.detail;
      if (!ev) return;
      const aid = activeIdRef.current;
      const data = ev.data || ev;

      // Newer realtime subjects are consumed by the mobile app (live delivery ticks,
      // contact edits, notes, stage config, presence, call counters). The web inbox
      // doesn't apply them inline yet, so ignore them here — otherwise the generic
      // loadConvs() fallback below would fire a full conversation refetch on every
      // delivery receipt (which streams constantly). Prevents a refetch storm.
      if (
        ev.type === "presence.updated" ||
        ev.type === "contact.created" ||
        ev.type === "contact.updated"
      ) {
        return;
      }

      // Call logged: patch the row's counters so the "needs call" badge on a hot
      // lead clears live once someone calls.
      if (ev.type === "call.tracked") {
        const cid: string | undefined = data?.conversation_id;
        if (cid) {
          setConvs((prev) => prev.map((c) => (c.id === cid
            ? { ...c, call_attempts: data.call_attempts ?? c.call_attempts, total_call_duration: data.total_call_duration ?? (c as any).total_call_duration }
            : c)));
        }
        return;
      }

      // Pipeline stage config changed elsewhere: refetch the stage list so the
      // stage picker/labels stay correct without a reload.
      if (ev.type === "stages.updated") {
        api.listStages().then((res) => setStages(res || [])).catch(() => { });
        return;
      }
      // Internal note added/removed on the OPEN conversation: refetch its notes so
      // a co-viewer sees it live.
      if (ev.type === "note.created" || ev.type === "note.deleted") {
        if (aid && data?.conversation_id === aid) {
          api.getNotes(aid).then((res) => setNotes(res || [])).catch(() => { });
        }
        return;
      }

      // Delivery/read receipt: advance the exact bubble's tick in the open thread
      // and the row's last-outbound status — never regress, no refetch.
      if (ev.type === "message.status.updated") {
        const cid: string | undefined = data?.conversation_id;
        const mid: string | undefined = data?.message_id;
        const st: string | undefined = data?.status;
        if (cid && mid && st) {
          const rank: Record<string, number> = { sending: 0, queued: 1, sent: 2, delivered: 3, read: 4, failed: 5 };
          queryClient.setQueryData(["messages", cid], (old: any) => {
            if (!old?.pages?.length) return old;
            let changed = false;
            const pages = old.pages.map((p: any) => ({
              ...p,
              data: (p.data || []).map((m: any) => {
                if (m.id === mid && (rank[st] ?? 0) > (rank[m.status] ?? 0)) { changed = true; return { ...m, status: st }; }
                return m;
              }),
            }));
            return changed ? { ...old, pages } : old;
          });
          setConvs((prev) => prev.map((c) => (c.id === cid ? { ...c, last_outbound_status: st } : c)));
        }
        return;
      }

      // Transient Simpuler phase — drives the "typing" indicator; never touches the list.
      if (ev.type === "ai.activity" && data?.conversation_id) {
        const cid: string = data.conversation_id;
        const clearAi = () => { setAiActivity((m) => { if (!(cid in m)) return m; const n = { ...m }; delete n[cid]; return n; }); if (aiTimers.current[cid]) { clearTimeout(aiTimers.current[cid]); delete aiTimers.current[cid]; } };
        if (data.phase === "thinking") {
          setAiActivity((m) => ({ ...m, [cid]: "thinking" }));
          if (aiTimers.current[cid]) clearTimeout(aiTimers.current[cid]);
          aiTimers.current[cid] = setTimeout(clearAi, 20000);
        } else { clearAi(); }
        return;
      }

      // Conversation-level change: merge the payload straight into the matching row
      // so bot takeover ("Manual · {name}"), assignee, stage, status, interest and
      // snooze update INSTANTLY — no full-list refetch (the old takeover lag). Only
      // an assignment (which can move a chat in/out of this agent's scope) still
      // reconciles the list.
      if (ev.type === "conversation.updated" || ev.type === "conversation.assigned" || ev.type === "conversation.closed") {
        const cid: string | undefined = data?.conversation_id;
        if (cid) {
          setConvs((prev) => prev.map((c) => {
            if (c.id !== cid) return c;
            const n = { ...c };
            if (typeof data.bot_active === "boolean") n.is_bot_active = data.bot_active;
            if (data.assigned_agent_id) n.assigned_agent_id = data.assigned_agent_id;
            if (data.agent_name) n.agent_name = data.agent_name;
            if (data.stage_id) n.stage_id = data.stage_id;
            if (data.stage_name) n.stage_name = data.stage_name;
            if (data.interest_level) n.interest_level = data.interest_level;
            if (data.disposition_id) n.disposition_id = data.disposition_id;
            if (data.snoozed_until !== undefined && data.snoozed_until !== null) n.snoozed_until = data.snoozed_until;
            if (data.status) n.status = data.status;
            if (ev.type === "conversation.closed") n.status = "closed";
            return n;
          }));
        }
        if (ev.type === "conversation.assigned") loadConvs();
        return;
      }

      const isMsg = ev.type === "message.persisted" && data && data.conversation_id === aid;
      // A bot reply landing clears any lingering "typing" indicator for that conversation.
      if (ev.type === "message.persisted" && data?.sender_type === "bot" && data.conversation_id) {
        const cid: string = data.conversation_id;
        setAiActivity((m) => { if (!(cid in m)) return m; const n = { ...m }; delete n[cid]; return n; });
        if (aiTimers.current[cid]) { clearTimeout(aiTimers.current[cid]); delete aiTimers.current[cid]; }
      }
      if (aid && isMsg) {
        // Append the new message straight into the cache so it shows instantly. The
        // persisted event carries the message, so we don't wait on a refetch that can
        // race the DB write and momentarily drop the newest message.
        const mid: string | undefined = data.message_id;
        if (mid) {
          queryClient.setQueryData(["messages", aid], (old: any) => {
            if (!old?.pages?.length) return old;
            if (old.pages.some((p: any) => (p.data || []).some((m: any) => m.id === mid))) {
              // Async media resolved: swap the placeholder for the real file.
              if (!data.media_url) return old;
              const pages = old.pages.map((p: any) => ({
                ...p,
                data: (p.data || []).map((m: any) =>
                  m.id === mid && m.media_url !== data.media_url ? { ...m, media_url: data.media_url } : m),
              }));
              return { ...old, pages };
            }
            const msg = {
              id: mid, direction: data.direction, sender_type: data.sender_type,
              type: data.type || "text", body: data.body, media_url: data.media_url || null,
              metadata: data.metadata || null,
              status: "delivered", created_at: new Date().toISOString(),
            };
            const pages = old.pages.slice();
            pages[0] = { ...pages[0], data: [...(pages[0].data || []), msg] };
            return { ...old, pages };
          });
        }
        // Keep it read server-side so the unread badge doesn't creep back up.
        // Await the patch BEFORE refreshing the list to avoid a race where
        // loadConvs fetches the stale (incremented) unread_count.
        await api.patchConversation(aid, { unread_count: 0 })
          .then(() => window.dispatchEvent(new CustomEvent("refreshUnread")))
          .catch(() => { });
      }
      loadConvs();
      // Reconcile other changes (status, edits). For a new message we already appended
      // it above; refetching here can race the write and drop the newest message.
      if (aid && !isMsg) queryClient.invalidateQueries({ queryKey: ["messages", aid] });
    };
    window.addEventListener("ws_message", handleWSMessage);
    return () => window.removeEventListener("ws_message", handleWSMessage);
  }, [loadConvs, queryClient]);

  // --- Scroll management ---
  useEffect(() => {
    const [first] = rowVirtualizer.getVirtualItems();
    if (!first) return;
    if (first.index === 0 && messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
      messagesQuery.fetchNextPage();
    }
  }, [rowVirtualizer.getVirtualItems(), messagesQuery.hasNextPage, messagesQuery.isFetchingNextPage, messagesQuery]);

  const prevLenRef = useRef(0);
  const prevActiveIdRef = useRef<string | null>(null);

  useEffect(() => {
    const len = messages.length + (notes || []).length;
    const switchedConv = activeId !== prevActiveIdRef.current;

    // Robustly jump to the latest message: the virtualizer re-measures dynamic row
    // heights and messages load async, so a single scroll lands mid-list. Retry
    // across a few frames and also pin the container to the very bottom.
    const jumpToEnd = () => {
      const idx = timeline.length - 1;
      if (idx < 0) return;
      [0, 60, 180, 360].forEach((d) => setTimeout(() => {
        rowVirtualizer.scrollToIndex(idx, { align: "end" });
        if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
      }, d));
    };

    if (switchedConv) {
      prevActiveIdRef.current = activeId;
      prevLenRef.current = 0; // treat the new conversation's load as fresh -> scroll
      jumpToEnd();            // covers an already-cached (instant) conversation
      return;
    }
    if (len > prevLenRef.current) {
      const nearBottom = bodyRef.current && (bodyRef.current.scrollHeight - bodyRef.current.scrollTop - bodyRef.current.clientHeight < 250);
      if (prevLenRef.current === 0 || nearBottom) jumpToEnd();
    }
    prevLenRef.current = len;
  }, [messages.length, notes, rowVirtualizer, timeline.length, activeId]);

  // --- Action helpers ---
  function notify(msg: string, severity: Toast["severity"] = "success") { setToast({ msg, severity }); }

  async function submit() {
    if (pendingFiles.length > 0) {
      await confirmSendFile();
      return;
    }
    if (!draft.trim() || !activeId) return;
    if (tab === 1) {
      await api.addNote(activeId, draft.trim()); setDraft("");
      setNotes((await api.getNotes(activeId)) || []);
      notify(t("components.noteAdded"));
      return;
    }
    setBusy(true);
    try {
      await api.sendMessage(activeId, draft.trim()); setDraft("");
      queryClient.invalidateQueries({ queryKey: ["messages", activeId] }); loadConvs();
    } catch { notify(t("contacts.failedToSend"), "error"); }
    finally { setBusy(false); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (fileRef.current) fileRef.current.value = ""; // allow re-picking the same file
    if (files.length === 0 || !activeId) return;
    // Reject oversize files up front with a specific reason (no silent spinner).
    const accepted: File[] = [];
    for (const f of files) {
      const tooBig = fileTooLargeMessage(f);
      if (tooBig) { notify(tooBig, "warning"); continue; }
      accepted.push(f);
    }
    if (accepted.length === 0) return;
    setPendingFiles(prev => [...prev, ...accepted]);
    setPendingPreviews(prev => [
      ...prev,
      ...accepted.map(f => (f.type.startsWith("image/") || f.type.startsWith("video/")) ? URL.createObjectURL(f) : null),
    ]);
  }

  async function confirmSendFile() {
    if (pendingFiles.length === 0 || !activeId) return;
    setBusy(true);
    setUploadProgress(0);
    try {
      // Sequential so the progress bar tracks one file at a time and a failure
      // points at the file that failed.
      const uploads: { url: string; type: string; name: string }[] = [];
      for (const f of pendingFiles) {
        uploads.push(await api.uploadFile(f, (pct) => setUploadProgress(pct)));
      }
      for (let i = 0; i < uploads.length; i++) {
        // Send draft caption with the first attachment, others empty
        await api.sendMedia(activeId, uploads[i].type, uploads[i].url, i === 0 ? draft.trim() : "");
      }
      pendingPreviews.forEach(p => p && URL.revokeObjectURL(p));
      setDraft(""); setPendingFiles([]); setPendingPreviews([]);
      queryClient.invalidateQueries({ queryKey: ["messages", activeId] }); loadConvs();
      notify(uploads.length > 1 ? t("components.filesSent") : t("inbox.fileSent"));
    } catch (err) {
      notify(err instanceof Error ? err.message : t("components.uploadFailed"), "error");
    }
    finally { setBusy(false); setUploadProgress(null); }
  }

  function cancelSendFile() {
    setPendingFiles([]);
    pendingPreviews.forEach(p => p && URL.revokeObjectURL(p));
    setPendingPreviews([]);
  }

  function removePendingFile(index: number) {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
    setPendingPreviews(prev => {
      const copy = [...prev];
      if (copy[index]) URL.revokeObjectURL(copy[index]!);
      copy.splice(index, 1);
      return copy;
    });
  }

  async function sendVoice(blob: Blob) {
    if (!activeId) return;
    setBusy(true);
    try {
      // Send raw webm to backend. The gateway will intercept and transcode to OGG/Opus for WhatsApp using ffmpeg.
      const file = new File([blob], `voice_message.webm`, { type: "audio/webm" });
      const upload = await api.uploadFile(file);
      await api.sendMedia(activeId, "audio", upload.url, "");
      queryClient.invalidateQueries({ queryKey: ["messages", activeId] });
      loadConvs();
    } catch (err: any) {
      console.error(err);
      notify("Voice error: " + (err?.message || "Unknown error"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function doAction(fn: () => Promise<any>, successMsg: string) {
    setBusy(true);
    try { await fn(); await loadConvs(); if (activeId) queryClient.invalidateQueries({ queryKey: ["messages", activeId] }); notify(successMsg); }
    catch { notify(t("inbox.actionFailed"), "error"); }
    finally { setBusy(false); }
  }

  async function setStage(stageId: string) {
    if (!activeId) return;
    await api.patchConversation(activeId, { stage_id: stageId });
    loadConvs();
  }

  async function override(patch: { stage_id?: string; disposition_id?: string; interest_level?: string; lost_reason?: string; status?: string }, label: string) {
    if (!activeId) return;
    await api.patchConversation(activeId, patch); loadConvs();
    notify(`${label} updated`);
  }

  function copyText(text: string) { navigator.clipboard.writeText(text); notify(t("contacts.copiedToClipboard"), "info"); }

  // -
  return (
    <>
      <div className="flex h-full min-h-0">

        {/* ── LEFT: Conversation List ── */}
        <ConversationList
          convs={convs}
          loading={convsLoading}
          activeId={activeId}
          onSelect={setActiveId}
          onCopy={copyText}
          query={query}
          onQueryChange={setQuery}
          sort={sort}
          onSortChange={setSort}
          stages={stages}
          filterStages={filterStages}
          onFilterStagesChange={setFilterStages}
          filterCampaigns={filterCampaigns}
          onFilterCampaignsChange={setFilterCampaigns}
          filterInterests={filterInterests}
          onFilterInterestsChange={setFilterInterests}
          filterStatuses={filterStatuses}
          onFilterStatusesChange={setFilterStatuses}
          followUpOnly={followUpOnly}
          onFollowUpToggle={() => setFollowUpOnly((v) => !v)}
          unreadOnly={unreadOnly}
          onUnreadToggle={() => setUnreadOnly((v) => !v)}
          needsReplyOnly={needsReplyOnly}
          onNeedsReplyToggle={() => setNeedsReplyOnly((v) => !v)}
          unassignedOnly={unassignedOnly}
          onUnassignedToggle={() => setUnassignedOnly((v) => !v)}
          lostReasonFilter={lostReasonFilter}
          onClearLostReason={() => setLostReasonFilter(null)}
          activeMessages={messages}
          agents={agents}
          filterAgents={filterAgents}
          onFilterAgentsChange={setFilterAgents}
          showAgent={showAgent}
          channels={channels}
          filterChannels={filterChannels}
          onFilterChannelsChange={setFilterChannels}
          dateScope={dateScope}
          onClearDateScope={clearDateScope}
          className={cn(activeId && "max-lg:hidden")}
        />

        {/* ── CENTER: Chat Panel ── */}
        <ChatPanel
          className={cn(!activeId && "max-lg:hidden")}
          onBack={() => setActiveId(null)}
          aiThinking={!!active && aiActivity[active.id] === "thinking"}
          active={active}
          timeline={timeline}
          messagesQuery={messagesQuery}
          bodyRef={bodyRef}
          rowVirtualizer={rowVirtualizer}
          stages={stages}
          dispositions={dispositions}
          onStageChange={setStage}
          onOverride={override}
          onResolve={() => doAction(() => api.close(active!.id), "Conversation resolved")}
          onReopen={() => doAction(() => api.patchConversation(active!.id, { status: "open" } as any), "Conversation reopened")}
          onToggleBot={(botOn) => doAction(() => api.toggleBot(active!.id, botOn), botOn ? "Handed back to Simpuler" : "You have taken over this chat")}
          onCopyText={copyText}
          draft={draft} setDraft={setDraft}
          tab={tab} setTab={setTab}
          quickReplies={quickReplies}
          pendingFiles={pendingFiles} pendingPreviews={pendingPreviews}
          fileRef={fileRef} onFile={onFile} cancelSendFile={cancelSendFile}
          removePendingFile={removePendingFile}
          busy={busy}
          onSubmit={submit}
          onSendVoice={sendVoice}
          showDetails={showDetails} onToggleDetails={() => setShowDetails((v) => !v)}
          notify={notify}
          showAgent={showAgent}
          agents={agents}
          canAssign={showAgent}
          onReassign={(agentId) => doAction(() => api.assign(active!.id, agentId), "Conversation reassigned")}
          onUnassign={() => doAction(() => api.unassign(active!.id), "Conversation unassigned")}
          onSnooze={(until) => doAction(() => api.snooze(active!.id, until), "Conversation snoozed")}
          onForward={(t) => setForwardText(t)}
          uploadProgress={uploadProgress}
          onAddNote={async (body) => {
            if (!activeId) return;
            await api.addNote(activeId, body);
            setNotes((await api.getNotes(activeId)) || []);
            notify(t("components.noteAdded"));
          }}
        />

        {/* ── RIGHT: Details Panel ── */}
        {active && showDetails && (
          <DetailsPanel
            active={active}
            onClose={() => setShowDetails(false)}
            copyText={copyText}
            notes={notes}
            messages={messages}
            channelName={channels.find((ch) => ch.type === active.channel)?.name}
            showAgent={showAgent}
            agents={agents}
            canAssign={showAgent}
            onReassign={(agentId) => doAction(() => api.assign(active!.id, agentId), "Conversation reassigned")}
            onUnassign={() => doAction(() => api.unassign(active!.id), "Conversation unassigned")}
            campaigns={campaignOpts}
            onSetCampaign={(cid) => doAction(() => api.setConversationCampaign(active!.id, cid), "Campaign updated")}
            onAddNote={async (body) => {
              if (!activeId) return;
              await api.addNote(activeId, body);
              setNotes((await api.getNotes(activeId)) || []);
              notify(t("components.noteAdded"));
            }}
            onDeleteNote={async (noteId) => {
              if (!activeId) return;
              await api.deleteNote(activeId, noteId);
              setNotes((await api.getNotes(activeId)) || []);
              notify(t("inbox.noteDeleted"));
            }}
          />
        )}
      </div>

      {/* ── Forward picker ── */}
      {forwardText !== null && (
        <ForwardPicker
          text={forwardText}
          convs={convs}
          onClose={() => setForwardText(null)}
          onSend={async (convId) => {
            const txt = forwardText;
            setForwardText(null);
            if (!txt) return;
            try {
              await api.sendMessage(convId, txt);
              notify(t("inbox.messageForwarded"));
              if (convId === activeId) queryClient.invalidateQueries({ queryKey: ["messages", convId] });
              loadConvs();
            } catch { notify(t("inbox.forwardFailed"), "error"); }
          }}
        />
      )}

      {/* ── Toast ── */}
      {toast && <ToastView msg={toast.msg} severity={toast.severity === "error" ? "error" : "success"} onClose={() => setToast(null)} />}
    </>
  );
}

// ── Forward picker: pick a conversation to forward the message text into ──
function ForwardPicker({ text, convs, onClose, onSend }: {
  text: string; convs: Conversation[]; onClose: () => void; onSend: (convId: string) => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const shown = convs.filter((c) => (c.contact_name || c.contact_phone || "").toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={t("inbox.forwardMessage")} className="relative w-[440px] max-h-[80vh] flex flex-col rounded-lg border border-border bg-card shadow-2xl animate-scale-in">
        <div className="px-5 py-3.5 border-b border-border flex items-center">
          <p className="font-bold text-[15px] text-foreground flex-1">{t("inbox.forwardMessage")}</p>
          <button aria-label={t("components.close")} onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none"><X className="w-[18px] h-[18px]" /></button>
        </div>
        <div className="p-3 border-b border-border">
          <p className="text-[12px] text-muted-foreground mb-2 px-1 line-clamp-2 italic">&ldquo;{text}&rdquo;</p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("inbox.searchConversations")}
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-[13px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </div>
        </div>
        <div className="flex-1 overflow-auto p-1.5">
          {shown.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">{t("components.noConversations")}</p>
          ) : shown.map((c) => (
            <button key={c.id} onClick={() => onSend(c.id)} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-muted text-left outline-none transition-colors">
              <div className="w-9 h-9 rounded-full grid place-items-center text-xs font-bold shrink-0 ring-1 ring-inset ring-black/5"
                style={{ backgroundColor: channelColor(c.channel) + "1A", color: channelTextColor(c.channel) }}>
                {initials(c.contact_name || c.contact_phone)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-foreground truncate">{c.contact_name || c.contact_phone || t("broadcasts.unknown")}</p>
                {c.contact_phone && <p className="text-[11px] text-muted-foreground tabular-nums truncate">{c.contact_phone}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
