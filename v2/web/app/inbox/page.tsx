"use client";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Box, Typography, Avatar, IconButton, Chip, TextField, InputAdornment, Button,
  Tooltip, Divider, Select, MenuItem, FormControl, InputLabel, Tab, Tabs, Menu,
  Collapse, Snackbar, Alert, Popover, Badge, Dialog, CircularProgress,
} from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";

import PersonAddAltRoundedIcon from "@mui/icons-material/PersonAddAltRounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import TagRoundedIcon from "@mui/icons-material/TagRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import NoteAltOutlinedIcon from "@mui/icons-material/NoteAltOutlined";
import ChatOutlinedIcon from "@mui/icons-material/ChatOutlined";
import SentimentSatisfiedAltRoundedIcon from "@mui/icons-material/SentimentSatisfiedAltRounded";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded";
import DoneRoundedIcon from "@mui/icons-material/DoneRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import PhotoCameraRoundedIcon from "@mui/icons-material/PhotoCameraRounded";
import VideocamRoundedIcon from "@mui/icons-material/VideocamRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import SortRoundedIcon from "@mui/icons-material/SortRounded";
import FilterListRoundedIcon from "@mui/icons-material/FilterListRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import NavigateNextRoundedIcon from "@mui/icons-material/NavigateNextRounded";
import HeadsetMicRoundedIcon from "@mui/icons-material/HeadsetMicRounded";
import Shell from "@/components/Shell";
import { api, getUser, WS_URL } from "@/lib/api";
import EmojiPicker from "emoji-picker-react";
import { initials, fmtTime, fmtDate, dateLabel, channelColor, interestColor } from "@/lib/utils";
import type { Agent, Conversation, Disposition, InternalNote, Message, QuickReply, Stage } from "@/lib/types";



// --- Countdown helper ---------------------------------------
function formatCountdown(isoDate: string): string {
  if (!isoDate) return "";
  const diff = Date.now() - new Date(isoDate).getTime();
  if (diff < 0) return "just now";
  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ${hrs % 24}h ${mins % 60}m`;
  if (hrs > 0) return `${hrs}h ${mins % 60}m ${secs % 60}s`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

// --- Timeline types -----------------------------------------
type Item =
  | { kind: "date"; key: string; label: string }
  | { kind: "msg"; key: string; m: Message }
  | { kind: "note"; key: string; n: InternalNote };

// --- Snackbar helper ----------------------------------------
type Toast = { msg: string; severity: "success" | "info" | "warning" | "error" };

// --- Status icon --------------------------------------------
const StatusIcon = memo(({ status }: { status: string }) => {
  switch (status) {
    case "sent": return <DoneRoundedIcon sx={{ fontSize: 14, color: "text.secondary" }} />;
    case "delivered": return <DoneAllRoundedIcon sx={{ fontSize: 14, color: "text.secondary" }} />;
    case "read": return <DoneAllRoundedIcon sx={{ fontSize: 14, color: "#0288D1" }} />;
    case "failed": return <ErrorOutlineRoundedIcon sx={{ fontSize: 14, color: "#EF4444" }} />;
    default: return <AccessTimeRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />;
  }
});
StatusIcon.displayName = "StatusIcon";

// -
// MAIN PAGE
// -
export default function InboxPage() {
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQR, setShowQR] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [dispositions, setDispositions] = useState<Disposition[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [assignAnchor, setAssignAnchor] = useState<null | HTMLElement>(null);
  const [stageMenuAnchor, setStageMenuAnchor] = useState<null | HTMLElement>(null);
  const [sortNewest, setSortNewest] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filterChannel, setFilterChannel] = useState("");
  const [filterInterest, setFilterInterest] = useState("");
  const [filterCampaign, setFilterCampaign] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [previewMedia, setPreviewMedia] = useState<{ url: string; type: string } | null>(null);
  const [emojiAnchor, setEmojiAnchor] = useState<null | HTMLElement>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [detailTab, setDetailTab] = useState("info");
  const [lostReasonDialog, setLostReasonDialog] = useState<string | null>(null);
  const [lostReasonInput, setLostReasonInput] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [now, setNow] = useState(Date.now());
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const active = convs.find((c) => c.id === activeId) || null;

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

  // --- Tick countdown every second --------------------------
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // --- Filtered + sorted conversations -------------------
  const shown = useMemo(() => {
    let list = convs;
    if (query) list = list.filter((c) => (c.contact_name || c.contact_phone || "").toLowerCase().includes(query.toLowerCase()));
    if (filterChannel) list = list.filter((c) => c.channel === filterChannel);
    if (filterInterest) list = list.filter((c) => c.interest_level === filterInterest);
    if (filterCampaign) list = list.filter((c) => c.campaign_id === filterCampaign);
    if (!sortNewest) list = [...list].reverse();
    return list;
  }, [convs, query, filterChannel, filterInterest, filterCampaign, sortNewest]);

  // --- Data loaders --------------------------------------
  const loadConvs = useCallback(async () => { try { setConvs((await api.listConversations(filter)) || []); } catch { } }, [filter]);


  useEffect(() => { loadConvs(); }, [loadConvs]);
  // Polling fallback: the WebSocket (Shell) is the fast path, but if it drops or
  // misses an event the inbox must still pick up new/updated leads. Refresh the
  // conversation list every 15s as a safety net so correctness never depends on
  // the socket being connected.
  useEffect(() => {
    const iv = setInterval(() => loadConvs(), 15000);
    return () => clearInterval(iv);
  }, [loadConvs]);
  useEffect(() => {
    api.listQuickReplies().then(res => setQuickReplies(res || [])).catch(() => { });
    api.listStages().then(res => setStages(res || [])).catch(() => { });
    api.listDispositions().then(res => setDispositions(res || [])).catch(() => { });
    api.listAgents().then(res => setAgents(res || [])).catch(() => { });
  }, []);

  useEffect(() => {
    if (!convs) return;
    const totalUnread = convs.reduce((acc, c) => acc + (c.unread_count || 0), 0);
    if (totalUnread > 0) {
      document.title = `(${totalUnread}) Inbox - Simpulx`;
    } else {
      document.title = `Inbox - Simpulx`;
    }
  }, [convs]);

  useEffect(() => {
    if (activeId) {
      setConvs((prev) => prev.map((c) => (c.id === activeId ? { ...c, unread_count: 0 } : c)));
      api.patchConversation(activeId, { unread_count: 0 })
        .then(() => window.dispatchEvent(new CustomEvent("refreshUnread")))
        .catch(() => { });
    }
  }, [activeId]);

  useEffect(() => {
    if (activeId) { api.getNotes(activeId).then(res => setNotes(res || [])).catch(() => { }); }
  }, [activeId]);

  useEffect(() => {
    const handleWSMessage = (e: any) => {
      const ev = e.detail;
      if (!ev) return;
      if (ev.type === "message.persisted") {
        // Browser notification is handled by Shell.tsx - no toast here
      }
      loadConvs();
      const c = activeIdRef.current;
      if (c) queryClient.invalidateQueries({ queryKey: ["messages", c] });
    };

    window.addEventListener("ws_message", handleWSMessage);
    return () => window.removeEventListener("ws_message", handleWSMessage);
  }, [loadConvs, queryClient]);

  const timeline = useMemo<Item[]>(() => {
    const raw = [
      ...messages.map((m) => ({ t: m.created_at, kind: "msg" as const, m })),
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

    if (switchedConv) {
      if (timeline.length > 0) setTimeout(() => rowVirtualizer.scrollToIndex(timeline.length - 1, { align: "end" }), 50);
    } else if (len > prevLenRef.current) {
      if (prevLenRef.current === 0 || (bodyRef.current && (bodyRef.current.scrollHeight - bodyRef.current.scrollTop - bodyRef.current.clientHeight < 250))) {
        setTimeout(() => rowVirtualizer.scrollToIndex(timeline.length - 1, { align: "end" }), 50);
      }
    }

    prevLenRef.current = len;
    prevActiveIdRef.current = activeId;
  }, [messages.length, notes, rowVirtualizer, timeline.length, activeId]);

  function notify(msg: string, severity: Toast["severity"] = "success") { setToast({ msg, severity }); }

  async function submit() {
    if (pendingFile) {
      await confirmSendFile();
      return;
    }
    if (!draft.trim() || !activeId) return;
    if (tab === 1) {
      await api.addNote(activeId, draft.trim()); setDraft("");
      setNotes((await api.getNotes(activeId)) || []);
      notify("Note added");
      return;
    }
    setBusy(true);
    try {
      await api.sendMessage(activeId, draft.trim()); setDraft("");
      queryClient.invalidateQueries({ queryKey: ["messages", activeId] }); loadConvs();
    } catch { notify("Failed to send", "error"); }
    finally { setBusy(false); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !activeId) return;
    setPendingFile(file);
    if (file.type.startsWith("image/")) {
      setPendingPreviewUrl(URL.createObjectURL(file));
    } else {
      setPendingPreviewUrl(null); // non-image docs
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function confirmSendFile() {
    if (!pendingFile || !activeId) return;
    setBusy(true);
    try {
      const up = await api.uploadFile(pendingFile);
      await api.sendMedia(activeId, up.type, up.url, draft.trim());
      setDraft(""); setPendingFile(null); setPendingPreviewUrl(null);
      queryClient.invalidateQueries({ queryKey: ["messages", activeId] }); loadConvs();
      notify("File sent");
    } catch { notify("Upload failed", "error"); }
    finally { setBusy(false); }
  }

  function cancelSendFile() {
    setPendingFile(null);
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingPreviewUrl(null);
  }

  async function doAction(fn: () => Promise<any>, successMsg: string) {
    setBusy(true);
    try { await fn(); await loadConvs(); if (activeId) queryClient.invalidateQueries({ queryKey: ["messages", activeId] }); notify(successMsg); }
    catch { notify("Action failed", "error"); }
    finally { setBusy(false); }
  }

  async function setStage(stageId: string) {
    if (!activeId) return;
    await api.patchConversation(activeId, { stage_id: stageId });
    loadConvs();
    const s = stages.find((x) => x.id === stageId);
    notify(`Stage updated to "${s?.name || "Unknown"}"`);
  }

  async function override(patch: { stage_id?: string; disposition_id?: string; interest_level?: string; lost_reason?: string }, label: string) {
    if (!activeId) return;
    await api.patchConversation(activeId, patch); loadConvs();
    notify(`${label} updated`);
  }

  function copyText(text: string) { navigator.clipboard.writeText(text); notify("Copied to clipboard", "info"); }

  // --- Current stage index for pipeline ------------------
  const currentStageIdx = stages.findIndex((s) => s.id === active?.stage_id);

  // --- Determine last responder type for a conversation --
  function getLastResponder(c: Conversation): "agent" | "contact" | null {
    if (!c.last_message_at) return null;

    // Exact match for the active conversation
    if (c.id === activeId && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.direction === "inbound") return "contact";
      return "agent";
    }

    // For other conversations, if there are unread messages, it must be the customer
    if (c.unread_count > 0) return "contact";

    // Otherwise we can't be 100% sure from just the conversation list, so we hide the icon to avoid inaccuracies
    return null;
  }

  
  // -
  return (
    <Shell>
      <Box sx={{ display: "flex", height: "100%", minHeight: 0 }}>

        {/* - LEFT: Conversation List - */}
        <Box sx={{ width: 360, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
          <Box sx={{ px: 2, pt: 2, pb: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
              <Select size="small" value={filter} onChange={(e) => setFilter(e.target.value)}
                sx={{ flex: 1, fontWeight: 600, fontSize: 14, "& .MuiSelect-select": { py: 0.75 } }} displayEmpty>
                <MenuItem value="">All ({convs.length})</MenuItem>
                <MenuItem value="open">Open ({convs.filter(c => c.status === "open").length})</MenuItem>
                <MenuItem value="pending">Pending ({convs.filter(c => c.status === "pending").length})</MenuItem>
                <MenuItem value="closed">Closed ({convs.filter(c => c.status === "closed").length})</MenuItem>
              </Select>
              <Tooltip title={sortNewest ? "Newest first" : "Oldest first"}>
                <IconButton size="small" onClick={() => { setSortNewest(v => !v); notify(sortNewest ? "Sorted: oldest first" : "Sorted: newest first", "info"); }}>
                  <SortRoundedIcon sx={{ fontSize: 20, transform: sortNewest ? "none" : "scaleY(-1)", transition: "transform 0.2s" }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Filters">
                <IconButton size="small" onClick={() => setShowFilters(v => !v)} sx={{ color: showFilters ? "primary.main" : "text.secondary" }}>
                  <FilterListRoundedIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Filter panel */}
            <Collapse in={showFilters}>
              <Box sx={{ display: "flex", gap: 1, mb: 1.5 }}>
                <FormControl size="small" sx={{ flex: 1 }}>
                  <InputLabel sx={{ fontSize: 12 }}>Channel</InputLabel>
                  <Select label="Channel" value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)} sx={{ fontSize: 12 }}>
                    <MenuItem value="">All</MenuItem>
                    {["whatsapp", "instagram", "telegram", "webchat", "email"].map(ch => <MenuItem key={ch} value={ch} sx={{ fontSize: 12, textTransform: "capitalize" }}>{ch}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ flex: 1 }}>
                  <InputLabel sx={{ fontSize: 12 }}>Interest</InputLabel>
                  <Select label="Interest" value={filterInterest} onChange={(e) => setFilterInterest(e.target.value)} sx={{ fontSize: 12 }}>
                    <MenuItem value="">All</MenuItem>
                    <MenuItem value="hot" sx={{ fontSize: 12 }}>Hot</MenuItem>
                    <MenuItem value="warm" sx={{ fontSize: 12 }}>Warm</MenuItem>
                    <MenuItem value="cold" sx={{ fontSize: 12 }}>Cold</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ flex: 1 }}>
                  <InputLabel sx={{ fontSize: 12 }}>Campaign</InputLabel>
                  <Select label="Campaign" value={filterCampaign} onChange={(e) => setFilterCampaign(e.target.value)} sx={{ fontSize: 12 }}>
                    <MenuItem value="">All</MenuItem>
                    {Array.from(new Map(convs.filter((c) => c.campaign_id).map((c) => [c.campaign_id as string, c.campaign_name])).entries()).map(([id, name]) => (
                      <MenuItem key={id} value={id} sx={{ fontSize: 12 }}>{name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {(filterChannel || filterInterest || filterCampaign) && (
                  <Tooltip title="Clear filters">
                    <IconButton size="small" onClick={() => { setFilterChannel(""); setFilterInterest(""); setFilterCampaign(""); }}>
                      <CloseRoundedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Collapse>

            <TextField fullWidth size="small" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} /></InputAdornment> } }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: "8px" } }}
            />
          </Box>

          <Box sx={{ flex: 1, overflow: "auto" }}>
            {shown.length === 0 ? (
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "text.secondary", px: 2, textAlign: "center" }}>
                <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 48, color: "divider", mb: 1.5 }} />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>No conversations</Typography>
                <Typography variant="caption">New chats land here automatically</Typography>
              </Box>
            ) : shown.map((c) => {
              const isActive = c.id === activeId;
              const responder = getLastResponder(c);
              const countdown = c.last_message_at ? formatCountdown(c.last_message_at) : "";
              return (
                <Box key={c.id} onClick={() => setActiveId(c.id)}
                  sx={{
                    display: "flex", gap: 1.5, px: 2, py: 1.5, mx: 0.75, my: 0.5, cursor: "pointer",
                    borderRadius: "8px",
                    bgcolor: isActive ? "#E8F5F0" : "transparent",
                    "&:hover": { bgcolor: isActive ? "#E0F2EC" : "#F5F5F5" },
                    transition: "all 0.15s",
                  }}>
                  <Avatar sx={{ width: 42, height: 42, fontSize: 14, fontWeight: 700, bgcolor: channelColor(c.channel) + "20", color: channelColor(c.channel), overflow: "visible", position: "relative" }}>
                    {initials(c.contact_name || c.contact_phone)}
                    <Box sx={{ position: "absolute", bottom: -1, right: -1, width: 12, height: 12, borderRadius: "50%", bgcolor: "#2E7D32", border: "2.5px solid", borderColor: isActive ? "#E8F5F0" : "#fff" }} />
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.contact_name || c.contact_phone || "Unnamed"}
                      </Typography>
                      {/* Countdown badge */}
                      {countdown && (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
                          {responder === "agent" && <HeadsetMicRoundedIcon sx={{ fontSize: 13, color: "#2D8B73" }} />}
                          <Typography sx={{ fontSize: 11, fontWeight: 600, color: responder === "agent" ? "#2D8B73" : "text.secondary" }}>
                            {countdown}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                    {/* Phone number + copy */}
                    {c.contact_phone && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <Typography sx={{ fontSize: 11, color: "text.disabled" }}>{c.contact_phone}</Typography>
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); copyText(c.contact_phone!); }} sx={{ p: 0.2 }}>
                          <ContentCopyRoundedIcon sx={{ fontSize: 11, color: "text.disabled" }} />
                        </IconButton>
                      </Box>
                    )}
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.25 }}>
                      <Typography sx={{ fontSize: 12, color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, display: "flex", alignItems: "center" }}>
                        {c.last_message_preview === "[image]" ? <><PhotoCameraRoundedIcon sx={{fontSize: 14, mr: 0.5}} /> Photo</> :
                         c.last_message_preview === "[video]" ? <><VideocamRoundedIcon sx={{fontSize: 14, mr: 0.5}} /> Video</> :
                         c.last_message_preview === "[document]" ? <><InsertDriveFileOutlinedIcon sx={{fontSize: 14, mr: 0.5}} /> Document</> :
                         c.last_message_preview || "No messages yet"}
                      </Typography>
                      {c.last_message_preview && <DoneAllRoundedIcon sx={{ fontSize: 14, color: "#0288D1", flexShrink: 0 }} />}
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.75, flexWrap: "wrap" }}>
                      {c.interest_level && <Chip size="small" label={c.interest_level} sx={{ height: 18, fontSize: 10, fontWeight: 700, textTransform: "capitalize", bgcolor: interestColor(c.interest_level) + "18", color: interestColor(c.interest_level), border: `1px solid ${interestColor(c.interest_level)}30` }} />}
                      {c.stage_name && <Chip label={c.stage_name} size="small" sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: "#E3F2FD", color: "#2D8B73" }} />}
                      {c.campaign_name && <Chip label={c.campaign_name} size="small" sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: "rgba(45,139,115,0.12)", color: "primary.main", maxWidth: 130, "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }} />}
                      <Box sx={{ flex: 1 }} />
                      {c.unread_count > 0 && <Box sx={{ minWidth: 20, height: 20, borderRadius: "8px", bgcolor: "error.main", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", px: 0.5 }}>{c.unread_count > 99 ? "99+" : c.unread_count}</Box>}
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* - CENTER: Chat - */}
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, bgcolor: "#F8FAFC" }}>
          {!active ? (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "text.secondary" }}>
              <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 64, color: "divider", mb: 2 }} />
              <Typography sx={{ fontWeight: 700, fontSize: 16, mb: 0.5 }}>Pick a conversation</Typography>
              <Typography variant="body2" sx={{ color: "text.disabled" }}>Select a chat from the left to view messages</Typography>
            </Box>
          ) : (
            <>
              {/* -- Chat Header -- */}
              <Box sx={{ height: 56, flexShrink: 0, display: "flex", alignItems: "center", gap: 0, px: 2, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0, flex: 1, minWidth: 0 }}>
                  {/* Stage chip */}
                  {(() => {
                    const currentStage = stages.find((s) => s.id === active.stage_id);
                    const stageColorMap: Record<string, string> = {
                      "new_lead": "#EF4444", "new lead": "#EF4444",
                      "contacted": "#FF9800", "qualified": "#F5A623",
                      "pending_payment": "#2196F3", "pending payment": "#2196F3",
                      "customer": "#2D8B73", "won": "#2E7D32",
                      "lost": "#9C27B0", "no_reply": "#6366F1", "no reply": "#6366F1",
                    };
                    const getDotColor = (name: string) => stageColorMap[name.toLowerCase()] || stageColorMap[name.toLowerCase().replace(/\s+/g, "_")] || "#FF9800";
                    const dotColor = currentStage ? getDotColor(currentStage.name) : "#9CA3AF";
                    const nextStageIdx = currentStageIdx >= 0 ? currentStageIdx + 1 : -1;
                    const nextStage = nextStageIdx >= 0 && nextStageIdx < stages.length ? stages[nextStageIdx] : null;

                    return (
                      <>
                        {/* Stage bordered container */}
                        <Box sx={{ display: "flex", alignItems: "center", border: "1px solid", borderColor: "divider", borderRadius: "8px", overflow: "hidden", height: 32 }}>
                          <Box onClick={(e: any) => setStageMenuAnchor(e.currentTarget)}
                            sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, height: "100%", cursor: "pointer", "&:hover": { bgcolor: "rgba(0,0,0,0.03)" } }}>
                            <Box sx={{ width: 14, height: 14, borderRadius: "8px", bgcolor: dotColor, flexShrink: 0 }} />
                            <Typography sx={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{currentStage?.name || "Select stage"}</Typography>
                          </Box>
                          <Divider orientation="vertical" flexItem />
                          <Tooltip title={nextStage ? `Next: ${nextStage.name}` : "Last stage"}>
                            <span>
                              <IconButton size="small" disabled={!nextStage}
                                onClick={() => { if (nextStage) { setStage(nextStage.id); notify(`Stage -> "${nextStage.name}"`); } }}
                                sx={{ width: 32, height: "100%", borderRadius: "8px", color: "primary.main", "&:hover": { bgcolor: "rgba(45,139,115,0.08)" } }}>
                                <NavigateNextRoundedIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                        <Menu anchorEl={stageMenuAnchor} open={!!stageMenuAnchor} onClose={() => setStageMenuAnchor(null)}
                          slotProps={{ paper: { sx: { minWidth: 220, maxHeight: 400, borderRadius: "8px" } } }}>
                          <Typography sx={{ px: 2, py: 0.75, fontSize: 11, fontWeight: 700, color: "text.disabled", textTransform: "uppercase", letterSpacing: "0.05em" }}>Progressing Stage</Typography>
                          {stages.filter((s) => !["lost", "no_reply", "no reply"].includes(s.name.toLowerCase())).map((s) => (
                            <MenuItem key={s.id} onClick={() => { setStage(s.id); setStageMenuAnchor(null); }} sx={{ fontSize: 13, fontWeight: 500, gap: 1.5, py: 1 }}>
                              <Box sx={{ width: 12, height: 12, borderRadius: "8px", bgcolor: getDotColor(s.name), flexShrink: 0 }} />
                              {s.name}
                              {s.id === active.stage_id && <CheckRoundedIcon sx={{ fontSize: 16, color: "primary.main", ml: "auto" }} />}
                            </MenuItem>
                          ))}
                          {stages.some((s) => ["lost", "no_reply", "no reply"].includes(s.name.toLowerCase())) && (
                            <>
                              <Divider sx={{ my: 0.5 }} />
                              <Typography sx={{ px: 2, py: 0.75, fontSize: 11, fontWeight: 700, color: "text.disabled", textTransform: "uppercase", letterSpacing: "0.05em" }}>Lost Stage</Typography>
                              {stages.filter((s) => ["lost", "no_reply", "no reply"].includes(s.name.toLowerCase())).map((s) => (
                                <MenuItem key={s.id} onClick={() => {
                                  if (s.name.toLowerCase() === "lost") {
                                    setLostReasonDialog(s.id);
                                  } else {
                                    setStage(s.id);
                                  }
                                  setStageMenuAnchor(null);
                                }} sx={{ fontSize: 13, fontWeight: 500, gap: 1.5, py: 1 }}>
                                  <Box sx={{ width: 12, height: 12, borderRadius: "8px", bgcolor: getDotColor(s.name), flexShrink: 0 }} />
                                  {s.name}
                                  {s.id === active.stage_id && <CheckRoundedIcon sx={{ fontSize: 16, color: "primary.main", ml: "auto" }} />}
                                </MenuItem>
                              ))}
                            </>
                          )}
                          <Divider sx={{ my: 0.5 }} />
                          <MenuItem onClick={() => { override({ stage_id: "" }, "Stage"); setStageMenuAnchor(null); }} sx={{ fontSize: 13, fontWeight: 500, color: "text.secondary" }}>Clear selection</MenuItem>
                        </Menu>
                      </>
                    );
                  })()}

                  {/* Contact name + phone */}
                  <Box sx={{ ml: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {active.contact_name || active.contact_phone || "Unnamed"}
                    </Typography>
                    {active.contact_phone && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{active.contact_phone}</Typography>
                        <IconButton size="small" onClick={() => copyText(active.contact_phone!)} sx={{ p: 0.2 }}>
                          <ContentCopyRoundedIcon sx={{ fontSize: 11, color: "primary.main" }} />
                        </IconButton>
                      </Box>
                    )}
                  </Box>
                </Box>




                {/* Status */}
                <Chip label={active.status} size="small"
                  sx={{ fontWeight: 600, fontSize: 11, height: 28, textTransform: "capitalize", ml: 0.5, bgcolor: active.status === "open" ? "#E8F5E9" : active.status === "pending" ? "#FFF3E0" : "#F5F5F5", color: active.status === "open" ? "#2E7D32" : active.status === "pending" ? "#E65100" : "#6B7280" }}
                />

                {/* Reopen if closed */}
                {active.status === "closed" && (
                  <Button size="small" variant="outlined" startIcon={<ReplayRoundedIcon sx={{ fontSize: 16 }} />}
                    onClick={() => doAction(() => api.patchConversation(active.id, { status: "open" } as any), "Conversation reopened")}
                    sx={{ ml: 0.5, textTransform: "none", fontWeight: 600, fontSize: 12 }}>
                    Reopen
                  </Button>
                )}

                {/* Resolve */}
                {active.status !== "closed" && (
                  <Tooltip title="Resolve conversation">
                    <IconButton size="small" onClick={() => doAction(() => api.close(active.id), "Conversation resolved")} sx={{ color: "success.main", ml: 0.5 }}>
                      <CheckCircleOutlineRoundedIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  </Tooltip>
                )}

                {/* Toggle details */}
                <Tooltip title={showDetails ? "Hide details" : "Show details"}>
                  <IconButton size="small" onClick={() => setShowDetails(v => !v)}
                    sx={{ color: showDetails ? "primary.main" : "text.secondary", bgcolor: showDetails ? "action.selected" : "transparent", ml: 0.5 }}>
                    <ViewSidebarOutlinedIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>
              </Box>

              {/* -- Messages -- */}
              <Box ref={bodyRef} sx={{ flex: 1, overflow: "auto", px: 2, py: 2.5, display: "flex", flexDirection: "column" }}>
                {messagesQuery.isFetchingNextPage && <Typography sx={{ textAlign: "center", fontSize: 12, color: "text.secondary", my: 1 }}>Loading older messages...</Typography>}
                <Box sx={{ height: rowVirtualizer.getTotalSize(), width: "100%", position: "relative" }}>
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const it = timeline[virtualRow.index];
                    const content = (() => {
                      if (it.kind === "date") return (
                        <Box key={it.key} sx={{ display: "flex", alignItems: "center", gap: 2, py: 0.5 }}>
                          <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
                          <Chip label={it.label} size="small" sx={{ fontSize: 11, fontWeight: 600, bgcolor: "background.paper", border: "1px solid", borderColor: "divider" }} />
                          <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
                        </Box>
                      );
                      if (it.kind === "note") return (
                        <Box key={it.key} sx={{ ml: "auto", maxWidth: "72%", borderRadius: "12px", border: "1px solid", borderColor: "#FDE68A", bgcolor: "#FFFBEB", px: 2, py: 1.5 }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5 }}>
                            <LockOutlinedIcon sx={{ fontSize: 12, color: "#B45309" }} />
                            <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#B45309" }}>Internal note</Typography>
                          </Box>
                          <Typography variant="body2">{it.n.body}</Typography>
                          <Typography variant="caption" sx={{ mt: 0.5, display: "block", color: "text.secondary" }}>{it.n.author || "Unknown"} - {fmtTime(it.n.created_at)}</Typography>
                        </Box>
                      );
                      const m = it.m, out = m.direction === "outbound", bot = m.sender_type === "bot";
                      const who = !out ? (active.contact_name || "Customer") : bot ? "AI Agent" : (active.agent_name || "Agent");

                      if (m.sender_type === "system") return (
                        <Box key={it.key} sx={{ display: "flex", justifyContent: "center", py: 0.5 }}>
                          <Box sx={{ borderRadius: "12px", bgcolor: "rgba(21,101,216,0.07)", px: 2.5, py: 1, maxWidth: "80%", textAlign: "center" }}>
                            <Typography variant="body2" sx={{ fontSize: 12, color: "text.secondary" }}>{m.body}</Typography>
                            <Typography variant="caption" sx={{ fontSize: 10, color: "text.disabled" }}>{fmtTime(m.created_at)}</Typography>
                          </Box>
                        </Box>
                      );

                      return (
                        <Box key={it.key} sx={{ display: "flex", justifyContent: out ? "flex-end" : "flex-start" }}>
                          {!out && <Avatar sx={{ width: 28, height: 28, fontSize: 10, fontWeight: 700, mr: 1, mt: 2, bgcolor: channelColor(active.channel) + "20", color: channelColor(active.channel) }}>{initials(active.contact_name || active.contact_phone)}</Avatar>}
                          <Box sx={{ maxWidth: "66%", display: "flex", flexDirection: "column", alignItems: out ? "flex-end" : "flex-start" }}>
                            <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 600, mb: 0.25, px: 0.5, color: bot ? "#7C3AED" : "text.secondary" }}>
                              {who} {bot && <SmartToyOutlinedIcon sx={{ fontSize: 10, verticalAlign: "middle" }} />}
                            </Typography>
                            <Box sx={{
                              borderRadius: "8px", px: 2, py: 1.25, fontSize: 13, lineHeight: 1.6,
                              ...(out ? { bgcolor: "primary.main", color: "#fff", borderBottomRightRadius: "4px" } : { bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderBottomLeftRadius: "4px" }),
                              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                            }}>
                              {(() => {
                                if (!m.media_url) return null;
                                let url = m.media_url;
                                if (typeof window !== "undefined" && window.location.hostname === "localhost" && url.includes("ngrok-free.dev")) {
                                  url = url.replace(/https?:\/\/[^\/]+/, "http://localhost:8080");
                                }
                                if (m.type === "image") return <Box onClick={() => setPreviewMedia({ url, type: m.type })} component="img" src={url} sx={{ maxHeight: 240, maxWidth: 260, borderRadius: "8px", display: "block", mb: m.body ? 1 : 0, cursor: "pointer" }} />;
                                if (m.type === "audio") return <Box component="audio" controls src={url} sx={{ width: 240, mb: m.body ? 1 : 0 }} />;
                                if (m.type === "video") return <Box component="video" controls src={url} sx={{ maxHeight: 240, maxWidth: 260, borderRadius: "8px", mb: m.body ? 1 : 0 }} />;
                                if (!["image", "audio", "video", "text"].includes(m.type)) return (
                                  <Box onClick={() => setPreviewMedia({ url, type: m.type })} sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.5, borderRadius: "8px", bgcolor: out ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.04)", mb: m.body ? 1 : 0, cursor: "pointer" }}>
                                    <InsertDriveFileOutlinedIcon sx={{ fontSize: 20, color: out ? "#fff" : "primary.main" }} />
                                    <Box><Typography sx={{ fontSize: 12, fontWeight: 600, color: out ? "#fff" : "text.primary" }}>Attachment</Typography><Typography sx={{ fontSize: 11, color: out ? "rgba(255,255,255,0.7)" : "text.secondary" }}>Tap to view</Typography></Box>
                                  </Box>
                                );
                                return null;
                              })()}
                              {m.body && <Typography variant="body2" sx={{ color: "inherit", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</Typography>}
                            </Box>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.25, px: 0.5 }}>
                              <Typography variant="caption" sx={{ fontSize: 10 }}>{fmtTime(m.created_at)}</Typography>
                              {out && <StatusIcon status={m.status} />}
                            </Box>
                          </Box>
                        </Box>
                      );
                    })();
                    return (
                      <Box key={virtualRow.key} data-index={virtualRow.index} ref={rowVirtualizer.measureElement}
                        sx={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)`, py: 0.75 }}>
                        {content}
                      </Box>
                    );
                  })}
                </Box>
              </Box>

              {/* -- Composer -- */}
              <Box sx={{ px: 2, pb: 2 }}>
                <Box sx={{
                  borderRadius: "8px", border: "1px solid", borderColor: tab === 1 ? "#FDE68A" : "divider",
                  bgcolor: tab === 1 ? "#FFFBEB" : "background.paper", overflow: "hidden",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)", transition: "all 0.15s",
                  "&:focus-within": { borderColor: tab === 1 ? "#F59E0B" : "primary.main", boxShadow: tab === 1 ? "0 0 0 3px rgba(245,158,11,0.12)" : "0 0 0 3px rgba(21,101,216,0.12)" },
                }}>
                  <Collapse in={showQR}>
                    <Box sx={{ maxHeight: 200, overflow: "auto", borderBottom: "1px solid", borderColor: "divider" }}>
                      {quickReplies.length === 0 ? (
                        <Typography variant="body2" sx={{ p: 2, color: "text.secondary", textAlign: "center" }}>No quick replies yet</Typography>
                      ) : quickReplies.map((q) => (
                        <Box key={q.id} onClick={() => { setDraft(q.body); setShowQR(false); notify(`Quick reply "${q.shortcut}" inserted`, "info"); }}
                          sx={{ px: 2, py: 1.5, cursor: "pointer", borderBottom: "1px solid", borderColor: "rgba(0,0,0,0.04)", "&:hover": { bgcolor: "action.hover" } }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Chip label={q.shortcut} size="small" sx={{ fontWeight: 700, fontSize: 10, bgcolor: "#E3F2FD", color: "#2D8B73" }} />
                            <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{q.title}</Typography>
                          </Box>
                          <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.body}</Typography>
                        </Box>
                      ))}
                    </Box>
                  </Collapse>
                  <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 1.5, minHeight: 36, "& .MuiTab-root": { minHeight: 36, py: 0.5 } }}>
                    <Tab label="Reply" sx={{ fontSize: 13, fontWeight: 600 }} />
                    <Tab label="Internal note" sx={{ fontSize: 13, fontWeight: 600, color: tab === 1 ? "#B45309" : undefined }} />
                  </Tabs>
                  <Box component="textarea" value={draft} onChange={(e: any) => setDraft(e.target.value)}
                    onKeyDown={(e: any) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                    placeholder={tab === 0 ? "Type your message here" : "Add an internal note (visible to your team only)"}
                    sx={{ display: "block", width: "100%", border: "none", outline: "none", resize: "none", minHeight: 56, maxHeight: 150, px: 2, py: 1, fontSize: 13, fontFamily: "inherit", bgcolor: "transparent", color: "text.primary", "&::placeholder": { color: "text.disabled" } }}
                  />
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 1.5, pb: 1.5 }}>
                    <Tooltip title="Emoji">
                      <IconButton size="small" onClick={(e) => setEmojiAnchor(e.currentTarget)}>
                        <SentimentSatisfiedAltRoundedIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                    {/* -- Full Emoji Picker -- */}
                    <Popover open={!!emojiAnchor} anchorEl={emojiAnchor} onClose={() => setEmojiAnchor(null)}
                      anchorOrigin={{ vertical: "top", horizontal: "left" }} transformOrigin={{ vertical: "bottom", horizontal: "left" }}
                      sx={{ '& .MuiPaper-root': { borderRadius: 2, boxShadow: '0 8px 32px rgba(0,0,0,0.1)' } }}
                    >
                      <EmojiPicker 
                        onEmojiClick={(e) => { setDraft(d => d + e.emoji); setEmojiAnchor(null); }}
                        searchDisabled={false}
                        skinTonesDisabled
                        lazyLoadEmojis
                      />
                    </Popover>
                    {pendingFile && (
                      <Box sx={{ position: "absolute", bottom: "100%", left: 0, mb: 1, p: 1.5, bgcolor: "#fff", borderRadius: "8px", border: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", gap: 2, boxShadow: "0 4px 20px rgba(0,0,0,0.08)", zIndex: 10 }}>
                        {pendingPreviewUrl ? (
                          <img src={pendingPreviewUrl} style={{ width: 60, height: 60, objectFit: "cover", borderRadius: "4px" }} />
                        ) : (
                          <Box sx={{ width: 60, height: 60, bgcolor: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px" }}>
                            <InsertDriveFileOutlinedIcon sx={{ color: "text.secondary" }} />
                          </Box>
                        )}
                        <Box sx={{ flex: 1, minWidth: 150 }}>
                          <Typography sx={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pendingFile.name}</Typography>
                          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{(pendingFile.size / 1024).toFixed(1)} KB</Typography>
                        </Box>
                        <IconButton size="small" onClick={cancelSendFile} sx={{ color: "error.main", bgcolor: "error.50", "&:hover": { bgcolor: "error.100" } }}><CloseRoundedIcon sx={{ fontSize: 18 }} /></IconButton>
                      </Box>
                    )}
                    <input ref={fileRef} type="file" hidden onChange={onFile} />
                    <Tooltip title="Attach file"><IconButton size="small" onClick={() => fileRef.current?.click()} disabled={busy}><AttachFileRoundedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                    <Tooltip title="Quick replies"><IconButton size="small" onClick={() => setShowQR(v => !v)} sx={{ color: showQR ? "primary.main" : "text.secondary" }}><BoltRoundedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                    <Box sx={{ flex: 1 }} />
                    <Typography variant="caption" sx={{ fontSize: 11, color: "text.disabled", mr: 1 }}>{draft.length}/4096</Typography>
                    <Button variant="contained" disabled={busy || (!draft.trim() && !pendingFile)} onClick={pendingFile ? confirmSendFile : submit}
                      sx={{ minWidth: 40, width: 40, height: 40, p: 0, borderRadius: "50%", boxShadow: "none", "&:hover": { boxShadow: "0 2px 8px rgba(45,139,115,0.3)" }, ...(tab === 1 && { bgcolor: "#F59E0B", "&:hover": { bgcolor: "#D97706" } }) }}>
                      {busy ? <CircularProgress size={18} color="inherit" /> : (tab === 0 ? <SendRoundedIcon sx={{ fontSize: 18 }} /> : <LockOutlinedIcon sx={{ fontSize: 18 }} />)}
                    </Button>
                  </Box>
                </Box>
              </Box>
            </>
          )}
        </Box>

        {/* - RIGHT: Details Panel - */}
        {active && showDetails && (
          <Box sx={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
            <Box sx={{ px: 2.5, py: 1.5, display: "flex", alignItems: "center", borderBottom: "1px solid", borderColor: "divider" }}>
              <Typography sx={{ fontWeight: 700, fontSize: 14, flex: 1 }}>Details</Typography>
              <IconButton size="small" onClick={() => setShowDetails(false)}><CloseRoundedIcon sx={{ fontSize: 18 }} /></IconButton>
            </Box>
            <Box sx={{ p: 2.5, borderBottom: "1px solid", borderColor: "divider" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Avatar sx={{ width: 48, height: 48, fontSize: 18, fontWeight: 700, bgcolor: channelColor(active.channel) + "20", color: channelColor(active.channel), borderRadius: "8px" }}>
                  {initials(active.contact_name || active.contact_phone)}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{active.contact_name || "Unnamed"}</Typography>
                  {active.contact_phone && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>{active.contact_phone}</Typography>
                      <IconButton size="small" onClick={() => copyText(active.contact_phone!)} sx={{ p: 0.2 }}><ContentCopyRoundedIcon sx={{ fontSize: 11, color: "primary.main" }} /></IconButton>
                    </Box>
                  )}
                </Box>
              </Box>
            </Box>
            <Tabs value={detailTab} onChange={(_, v) => setDetailTab(v)} sx={{ px: 1, minHeight: 40, borderBottom: "1px solid", borderColor: "divider", "& .MuiTab-root": { minHeight: 40 } }}>
              <Tab value="info" label="Contact" icon={<PersonOutlineRoundedIcon sx={{ fontSize: 16 }} />} iconPosition="start" sx={{ fontSize: 12, fontWeight: 600, minHeight: 36, textTransform: "none" }} />
              <Tab value="notes" label="Notes" icon={<NoteAltOutlinedIcon sx={{ fontSize: 16 }} />} iconPosition="start" sx={{ fontSize: 12, fontWeight: 600, minHeight: 36, textTransform: "none" }} />
            </Tabs>
            <Box sx={{ flex: 1, overflow: "auto" }}>
              {detailTab === "info" && (
                <Box sx={{ p: 2.5 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "text.secondary", mb: 2 }}>Customer details</Typography>
                  <DetailRow icon={<PersonOutlineRoundedIcon sx={{ fontSize: 16 }} />} label="Full name" value={active.contact_name || "Unknown"} />
                  <DetailRow icon={<PhoneOutlinedIcon sx={{ fontSize: 16 }} />} label="Phone" value={active.contact_phone || "None"} copyable={!!active.contact_phone} onCopy={() => active.contact_phone && copyText(active.contact_phone)} />
                  <DetailRow icon={<TagRoundedIcon sx={{ fontSize: 16 }} />} label="Channel" value={active.channel || "Unknown"} />
                  {active.campaign_name && <DetailRow icon={<TagRoundedIcon sx={{ fontSize: 16 }} />} label="Campaign" value={active.campaign_name} />}
                  <DetailRow icon={<ChatOutlinedIcon sx={{ fontSize: 16 }} />} label="Status" value={active.status} />
                  <DetailRow icon={<HistoryRoundedIcon sx={{ fontSize: 16 }} />} label="Last message" value={fmtDate(active.last_message_at) || "No messages"} />
                  <DetailRow icon={<SmartToyOutlinedIcon sx={{ fontSize: 16 }} />} label="AI active" value={active.is_bot_active ? "Yes" : "No"} />

                  <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "text.secondary", mt: 4, mb: 2 }}>Lead Qualification</Typography>
                  <DetailRow icon={<TagRoundedIcon sx={{ fontSize: 16 }} />} label="Interest Level" value={active.interest_level || "Unknown"} />
                  <DetailRow icon={<TagRoundedIcon sx={{ fontSize: 16 }} />} label="Brand" value={active.car_brand || "Unknown"} />
                  <DetailRow icon={<TagRoundedIcon sx={{ fontSize: 16 }} />} label="Model" value={active.car_model || "Unknown"} />
                  <DetailRow icon={<TagRoundedIcon sx={{ fontSize: 16 }} />} label="City" value={active.city || "Unknown"} />
                  <DetailRow icon={<HistoryRoundedIcon sx={{ fontSize: 16 }} />} label="Purchase time" value={active.purchase_timeframe || "Unknown"} />

                  {active.lost_reason && (
                    <DetailRow icon={<NoteAltOutlinedIcon sx={{ fontSize: 16 }} />} label="Lost Reason" value={active.lost_reason} />
                  )}
                </Box>
              )}
              {detailTab === "notes" && (
                <Box sx={{ p: 2.5 }}>
                  <Box sx={{ mb: 2 }}>
                    <TextField fullWidth size="small" multiline rows={2} placeholder="Add a note..." value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} />
                    <Button size="small" variant="contained" onClick={async () => { if (!noteDraft.trim() || !activeId) return; await api.addNote(activeId, noteDraft.trim()); setNoteDraft(""); setNotes((await api.getNotes(activeId)) || []); notify("Note added"); }}
                      disabled={!noteDraft.trim()} sx={{ mt: 1, borderRadius: "8px", fontWeight: 600, fontSize: 12, bgcolor: "#F59E0B", "&:hover": { bgcolor: "#D97706" } }}>Add note</Button>
                  </Box>
                  {notes.length === 0 ? (
                    <Typography variant="body2" sx={{ color: "text.disabled", textAlign: "center", py: 4 }}>No internal notes yet</Typography>
                  ) : notes.map((n) => (
                    <Box key={n.id} sx={{ mb: 1.5, p: 1.5, borderRadius: "8px", border: "1px solid", borderColor: "#FDE68A", bgcolor: "#FFFBEB" }}>
                      <Typography variant="body2" sx={{ fontSize: 12 }}>{n.body}</Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary", mt: 0.5, display: "block" }}>{n.author || "Unknown"} - {fmtTime(n.created_at)}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* - Snackbar - */}
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}>
        <Alert onClose={() => setToast(null)} severity={toast?.severity || "success"}
          variant="filled" sx={{ borderRadius: "8px", fontWeight: 600, fontSize: 13, minWidth: 280, bgcolor: toast?.severity === "error" ? "#DC2626" : "#2D8B73" }}>
          {toast?.msg}
        </Alert>
      </Snackbar>
      {/* -- Lost Reason Dialog ----------------------------------- */}
      <Dialog open={!!lostReasonDialog} onClose={() => setLostReasonDialog(null)} sx={{ "& .MuiDialog-paper": { width: 400, borderRadius: "8px" } }}>
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Lost Reason</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
            Please provide a reason why this lead was lost. This helps with analytics and improving sales strategies.
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            placeholder="e.g., Price too high, bought from competitor..."
            value={lostReasonInput}
            onChange={(e) => setLostReasonInput(e.target.value)}
            sx={{ mb: 3 }}
          />
          <Box sx={{ display: "flex", gap: 1.5, justifyContent: "flex-end" }}>
            <Button onClick={() => { setLostReasonDialog(null); setLostReasonInput(""); }} sx={{ textTransform: "none", fontWeight: 600, color: "text.secondary" }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                if (!active || !lostReasonDialog) return;
                override({ stage_id: lostReasonDialog, lost_reason: lostReasonInput }, "Stage updated to Lost");
                setLostReasonDialog(null);
                setLostReasonInput("");
              }}
              sx={{ textTransform: "none", fontWeight: 600, borderRadius: "8px" }}
            >
              Save & Update Stage
            </Button>
          </Box>
        </Box>
      </Dialog>

      {/* - Media Preview Dialog - */}
      <Dialog open={!!previewMedia} onClose={() => setPreviewMedia(null)} maxWidth="lg" fullWidth sx={{ "& .MuiDialog-paper": { bgcolor: "transparent", boxShadow: "none", height: "90vh" } }}>
        <Box sx={{ position: "absolute", top: 16, right: 16, zIndex: 10 }}>
          <IconButton onClick={() => setPreviewMedia(null)} sx={{ bgcolor: "rgba(0,0,0,0.5)", color: "#fff", "&:hover": { bgcolor: "rgba(0,0,0,0.7)" } }}>
            <CloseRoundedIcon />
          </IconButton>
        </Box>
        <Box sx={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center" }}>
          {previewMedia?.type === "image" ? (
            <img src={previewMedia.url} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          ) : (
            <iframe src={previewMedia?.url} style={{ width: "100%", height: "100%", border: "none", borderRadius: 8, backgroundColor: "#fff" }} />
          )}
        </Box>
      </Dialog>
    </Shell>
  );
}

// --- Detail Row -------------------------------------------
function DetailRow({ icon, label, value, copyable, onCopy }: {
  icon: React.ReactNode; label: string; value: string; copyable?: boolean; onCopy?: () => void;
}) {
  return (
    <Box sx={{ display: "flex", gap: 1.25, mb: 1.5 }}>
      <Box sx={{ color: "text.disabled", mt: 0.25 }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "text.disabled", mb: 0.25 }}>{label}</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</Typography>
          {copyable && (
            <Tooltip title="Copy">
              <IconButton size="small" onClick={onCopy} sx={{ p: 0.25 }}><ContentCopyRoundedIcon sx={{ fontSize: 12, color: "primary.main" }} /></IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
    </Box>
  );
}



