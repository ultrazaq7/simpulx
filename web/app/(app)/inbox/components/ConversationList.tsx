"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare, X, Filter, User, Phone, ChevronDown, Check, ArrowUpDown, Rows3,
} from "lucide-react";

import { type FilterOption } from "./MultiSelectFilter";
import FilterPopover, { type FilterCategory, type FilterToggle } from "./FilterPopover";
import ConversationCard from "./ConversationCard";
import { ConversationListSkeleton } from "./InboxSkeletons";
import { cn } from "@/lib/utils";
import { useEscClose } from "@/lib/useEscClose";
import { Tip } from "@/components/ui/tooltip";
import type { Conversation, Stage, Message, Channel } from "@/lib/types";

export type SortMode = "newest" | "oldest" | "priority" | "waiting";
type SearchMode = "name" | "phone" | "messages";

const SEARCH_MODES: { value: SearchMode; label: string; icon: any }[] = [
  { value: "name", label: "Name", icon: User },
  { value: "phone", label: "Phone", icon: Phone },
  { value: "messages", label: "Messages", icon: MessageSquare },
];

// Compact "search by" selector that sits inside the search box (snapshot 4 pattern).
function SearchModeMenu({ mode, onChange }: { mode: SearchMode; onChange: (m: SearchMode) => void }) {
  const [open, setOpen] = useState(false);
  useEscClose(open, () => setOpen(false));
  const current = SEARCH_MODES.find((m) => m.value === mode) ?? SEARCH_MODES[0];
  const CurrentIcon = current.icon;
  return (
    <div className="relative h-full">
      <Tip label={`Search by ${current.label.toLowerCase()}`} side="bottom">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="h-full pl-2.5 pr-2 inline-flex items-center gap-1 border-r border-input text-muted-foreground hover:text-foreground transition-colors outline-none"
        >
          <CurrentIcon className="w-4 h-4" />
          <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
        </button>
      </Tip>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1.5 w-40 rounded-lg border border-border bg-popover shadow-xl z-50 p-1 animate-scale-in origin-top-left">
            {SEARCH_MODES.map((m) => {
              const Icon = m.icon;
              const active = m.value === mode;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => { onChange(m.value); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left text-[13px] outline-none transition-colors",
                    active ? "bg-primary/10 text-primary font-semibold" : "text-foreground/80 hover:bg-muted",
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const SORT_LABELS: Record<SortMode, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  priority: "Priority",
  waiting: "Longest waiting",
};

// Compact sort selector (SleekFlow pattern: a small popover off the up/down arrows).
function SortMenu({ sort, onSortChange }: { sort: SortMode; onSortChange: (s: SortMode) => void }) {
  const [open, setOpen] = useState(false);
  useEscClose(open, () => setOpen(false));
  return (
    <div className="relative shrink-0">
      <Tip label="Sort" side="bottom">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "w-8 h-9 rounded-md grid place-items-center border transition-colors outline-none",
            open ? "bg-primary/10 text-primary border-primary/40" : "bg-background text-muted-foreground border-input hover:bg-muted hover:text-foreground",
          )}
        >
          <ArrowUpDown className="w-4 h-4" />
        </button>
      </Tip>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-50 w-44 rounded-lg border border-border bg-popover shadow-xl p-1 animate-scale-in origin-top-right">
            <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sort by</p>
            {(["newest", "oldest", "priority", "waiting"] as SortMode[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { onSortChange(s); setOpen(false); }}
                className={cn(
                  "w-full flex items-center px-2 py-1.5 rounded-md text-left text-[13px] outline-none transition-colors",
                  sort === s ? "bg-primary/10 text-primary font-semibold" : "text-foreground/80 hover:bg-muted",
                )}
              >
                {SORT_LABELS[s]}
                {sort === s && <Check className="w-4 h-4 ml-auto" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface ConversationListProps {
  convs: Conversation[];
  loading?: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onCopy: (text: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  sort: SortMode;
  onSortChange: (s: SortMode) => void;
  stages: Stage[];
  filterStages: string[];
  onFilterStagesChange: (v: string[]) => void;
  filterCampaigns: string[];
  onFilterCampaignsChange: (v: string[]) => void;
  filterInterests: string[];
  onFilterInterestsChange: (v: string[]) => void;
  filterStatuses: string[];
  onFilterStatusesChange: (v: string[]) => void;
  followUpOnly: boolean;
  onFollowUpToggle: () => void;
  unreadOnly: boolean;
  onUnreadToggle: () => void;
  needsReplyOnly: boolean;
  onNeedsReplyToggle: () => void;
  activeMessages?: Message[];
  // Manager/admin only: show the assigned agent + filter by agent
  agents?: { id: string; full_name: string }[];
  filterAgents: string[];
  onFilterAgentsChange: (v: string[]) => void;
  showAgent?: boolean;
  // Channel filter
  channels?: Channel[];
  filterChannels: string[];
  onFilterChannelsChange: (v: string[]) => void;
}

export default function ConversationList({
  convs, loading, activeId, onSelect, onCopy,
  query, onQueryChange,
  sort, onSortChange,
  stages,
  filterStages, onFilterStagesChange,
  filterCampaigns, onFilterCampaignsChange,
  filterInterests, onFilterInterestsChange,
  filterStatuses, onFilterStatusesChange,
  followUpOnly, onFollowUpToggle,
  unreadOnly, onUnreadToggle,
  needsReplyOnly, onNeedsReplyToggle,
  activeMessages,
  agents, filterAgents, onFilterAgentsChange, showAgent,
  channels, filterChannels, onFilterChannelsChange,
}: ConversationListProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>("name");
  const [dense, setDense] = useState(false);
  // Inbox-local quick toggles (not threaded through the parent).
  const [responded, setResponded] = useState(false);
  const [unresponded, setUnresponded] = useState(false);
  const [lastByCustomer, setLastByCustomer] = useState(false);
  const [lastByBot, setLastByBot] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const shownRef = useRef<Conversation[]>([]);

  useEffect(() => { setDense(localStorage.getItem("inboxDense") === "1"); }, []);
  const toggleDense = () => setDense((d) => { localStorage.setItem("inboxDense", d ? "0" : "1"); return !d; });

  const stageOptions: FilterOption[] = useMemo(
    () => stages.map((s) => ({ value: s.id, label: s.name })),
    [stages]
  );

  const agentOptions: FilterOption[] = useMemo(
    () => [{ value: "__unassigned__", label: "Unassigned" }, ...(agents || []).map((a) => ({ value: a.id, label: a.full_name }))],
    [agents]
  );

  const campaignOptions: FilterOption[] = useMemo(
    () =>
      Array.from(
        new Map(
          convs.filter((c) => c.campaign_id).map((c) => [c.campaign_id!, c.campaign_name || "Unknown"])
        ).entries()
      ).map(([id, name]) => ({ value: id, label: name })),
    [convs]
  );

  const interestOptions: FilterOption[] = [
    { value: "hot", label: "Hot", color: "#EF4444" },
    { value: "warm", label: "Warm", color: "#F5A623" },
    { value: "cold", label: "Cold", color: "#3B82F6" },
  ];

  const statusOptions: FilterOption[] = [
    { value: "open", label: "Open" },
    { value: "snoozed", label: "Snoozed" },
    { value: "closed", label: "Closed" },
  ];

  const channelOptions: FilterOption[] = useMemo(
    () => (channels || []).map((ch) => ({ value: ch.id, label: ch.name })),
    [channels]
  );

  // Build a channel lookup map: channel type -> channel name (for tooltip)
  const channelNameMap = useMemo(() => {
    const m = new Map<string, string>();
    (channels || []).forEach((ch) => m.set(ch.type, ch.name));
    return m;
  }, [channels]);

  const shown = useMemo(() => {
    let list = convs;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((c) => {
        if (searchMode === "phone") return (c.contact_phone || "").toLowerCase().includes(q);
        if (searchMode === "messages") return (c.last_message_preview || "").toLowerCase().includes(q);
        return (c.contact_name || "").toLowerCase().includes(q); // name
      });
    }
    if (filterStatuses.length > 0) list = list.filter((c) => filterStatuses.includes(c.status));
    if (filterStages.length > 0) list = list.filter((c) => c.stage_id && filterStages.includes(c.stage_id));
    if (filterCampaigns.length > 0) list = list.filter((c) => c.campaign_id && filterCampaigns.includes(c.campaign_id));
    if (filterInterests.length > 0) list = list.filter((c) => c.interest_level && filterInterests.includes(c.interest_level));
    if (filterAgents.length > 0) list = list.filter((c) => filterAgents.includes(c.assigned_agent_id || "__unassigned__"));
    if (filterChannels.length > 0) {
      // Match by channel type from the selected channel IDs
      const selectedTypes = new Set((channels || []).filter((ch) => filterChannels.includes(ch.id)).map((ch) => ch.type));
      list = list.filter((c) => selectedTypes.has(c.channel));
    }
    if (followUpOnly) list = list.filter((c) => (c.interest_level === "hot" || c.interest_level === "warm") && c.unread_count > 0);
    if (unreadOnly) list = list.filter((c) => c.unread_count > 0);
    if (needsReplyOnly) list = list.filter((c) => c.last_message_direction === "contact" || c.unread_count > 0);
    // Unresponded = the customer has NOT genuinely replied yet (only the
    // CTWA/lead-capture opener exists, no real human reply). customer_responded
    // comes from the API; fall back to the direction heuristic pre-deploy.
    if (responded) list = list.filter((c) => c.customer_responded === true);
    if (unresponded) list = list.filter((c) => c.customer_responded === undefined ? c.last_message_direction === "contact" : !c.customer_responded);
    if (lastByCustomer) list = list.filter((c) => c.last_sender_type === "contact");
    if (lastByBot) list = list.filter((c) => c.last_sender_type === "bot");

    const sorted = [...list];
    switch (sort) {
      case "newest":
        sorted.sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());
        break;
      case "oldest":
        sorted.sort((a, b) => new Date(a.last_message_at || 0).getTime() - new Date(b.last_message_at || 0).getTime());
        break;
      case "priority":
        // lead_score is a hidden sort signal only (BR-28) — never shown to agents.
        sorted.sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0));
        break;
      case "waiting":
        sorted.sort((a, b) => {
          const aWaiting = a.unread_count > 0 ? 1 : 0;
          const bWaiting = b.unread_count > 0 ? 1 : 0;
          if (aWaiting !== bWaiting) return bWaiting - aWaiting;
          return new Date(a.last_message_at || 0).getTime() - new Date(b.last_message_at || 0).getTime();
        });
        break;
    }
    return sorted;
  }, [convs, query, searchMode, filterStatuses, filterStages, filterCampaigns, filterInterests, filterAgents, filterChannels, channels, followUpOnly, unreadOnly, needsReplyOnly, responded, unresponded, lastByCustomer, lastByBot, sort]);

  shownRef.current = shown;

  // Keyboard speed layer: j/k (or arrows) move the selection, "/" focuses search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing) { e.preventDefault(); searchInputRef.current?.focus(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const list = shownRef.current;
      if (list.length === 0) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const i = list.findIndex((c) => c.id === activeId);
        onSelect(list[i < 0 ? 0 : Math.min(i + 1, list.length - 1)].id);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = list.findIndex((c) => c.id === activeId);
        onSelect(list[i < 0 ? 0 : Math.max(i - 1, 0)].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, onSelect]);

  // Keep the selected row in view when moved by keyboard.
  useEffect(() => {
    if (activeId) document.getElementById(`conv-row-${activeId}`)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const activeFiltersCount =
    filterStages.length + filterCampaigns.length + filterInterests.length + filterStatuses.length + filterAgents.length + filterChannels.length +
    (followUpOnly ? 1 : 0) + (unreadOnly ? 1 : 0) + (needsReplyOnly ? 1 : 0) +
    (responded ? 1 : 0) + (unresponded ? 1 : 0) + (lastByCustomer ? 1 : 0) + (lastByBot ? 1 : 0) + (query ? 1 : 0);

  const clearAll = () => {
    onQueryChange("");
    onFilterStatusesChange([]);
    onFilterStagesChange([]);
    onFilterCampaignsChange([]);
    onFilterInterestsChange([]);
    onFilterAgentsChange([]);
    onFilterChannelsChange([]);
    if (followUpOnly) onFollowUpToggle();
    if (unreadOnly) onUnreadToggle();
    if (needsReplyOnly) onNeedsReplyToggle();
    setResponded(false);
    setUnresponded(false);
    setLastByCustomer(false);
    setLastByBot(false);
  };

  const filterCategories: FilterCategory[] = [
    { key: "status", label: "Status", options: statusOptions, selected: filterStatuses, onChange: onFilterStatusesChange },
    { key: "stage", label: "Stage", options: stageOptions, selected: filterStages, onChange: onFilterStagesChange },
    { key: "interest", label: "Interest", options: interestOptions, selected: filterInterests, onChange: onFilterInterestsChange },
    { key: "campaign", label: "Campaign", options: campaignOptions, selected: filterCampaigns, onChange: onFilterCampaignsChange },
    { key: "channel", label: "Channel", options: channelOptions, selected: filterChannels, onChange: onFilterChannelsChange },
    ...(showAgent ? [{ key: "agent", label: "Assigned To", options: agentOptions, selected: filterAgents, onChange: onFilterAgentsChange }] : []),
  ];

  const filterToggles: FilterToggle[] = [
    { key: "unread", label: "Unread", active: unreadOnly, onToggle: onUnreadToggle },
    { key: "unresponded", label: "Unresponded chat", active: unresponded, onToggle: () => setUnresponded((v) => !v) },
    { key: "responded", label: "Responded chat", active: responded, onToggle: () => setResponded((v) => !v) },
    { key: "lastcustomer", label: "Last message by customer", active: lastByCustomer, onToggle: () => setLastByCustomer((v) => !v), dividerBefore: true },
    { key: "lastbot", label: "Last message by bot", active: lastByBot, onToggle: () => setLastByBot((v) => !v) },
  ];

  return (
    <div className="w-[276px] shrink-0 flex flex-col border-r border-border bg-card relative">
      {/* Header: search + sort + filter (SleekFlow layout) — height matches the chat header */}
      <div className="shrink-0 h-14 px-1.5 flex items-center border-b border-border">
        <div className="flex items-center gap-1 w-full min-w-0">
          <div className="relative flex-1 min-w-0 flex items-center h-9 rounded-md border border-input bg-background transition-colors focus-within:border-primary overflow-visible">
            <SearchModeMenu mode={searchMode} onChange={setSearchMode} />
            <input
              ref={searchInputRef}
              aria-label="Search conversations"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={searchMode === "messages" ? "Search messages" : `Search by ${searchMode}`}
              className="flex-1 min-w-0 h-full px-2.5 bg-transparent border-0 text-[13px] text-foreground placeholder:text-muted-foreground/70 outline-none"
            />
            {query && (
              <button
                onClick={() => onQueryChange("")}
                className="mr-1.5 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted outline-none shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <SortMenu sort={sort} onSortChange={onSortChange} />

          <div className="relative shrink-0">
            <Tip label="Filter" side="bottom">
              <button
                type="button"
                aria-label="Filter conversations"
                onClick={() => setFilterOpen((v) => !v)}
                className={cn(
                  "w-8 h-9 rounded-md grid place-items-center border transition-colors outline-none relative",
                  filterOpen ? "bg-primary/10 text-primary border-primary/40" : "bg-background text-muted-foreground border-input hover:bg-muted hover:text-foreground",
                )}
              >
                <Filter className="w-4 h-4" />
                {activeFiltersCount > 0 && !filterOpen && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-white text-[9px] font-bold grid place-items-center">{activeFiltersCount}</span>
                )}
              </button>
            </Tip>
            {/* Inbox keeps the master-detail filter popover (per owner). */}
            {filterOpen && (
              <div className="absolute top-full left-0 mt-1.5 z-50">
                <FilterPopover
                  categories={filterCategories}
                  toggles={filterToggles}
                  activeCount={activeFiltersCount}
                  onClearAll={clearAll}
                  onClose={() => setFilterOpen(false)}
                />
              </div>
            )}
          </div>

          <Tip label={dense ? "Comfortable rows" : "Compact rows"} side="bottom">
            <button
              type="button"
              aria-label={dense ? "Comfortable row density" : "Compact row density"}
              onClick={toggleDense}
              className={cn(
                "shrink-0 w-8 h-9 rounded-md grid place-items-center border transition-colors outline-none",
                dense ? "bg-primary/10 text-primary border-primary/40" : "bg-background text-muted-foreground border-input hover:bg-muted hover:text-foreground",
              )}
            >
              <Rows3 className="w-4 h-4" />
            </button>
          </Tip>
        </div>
      </div>

      {/* Active-filter strip — only appears when something is narrowing the list */}
      {activeFiltersCount > 0 && (
        <div className="shrink-0 h-8 px-3.5 flex items-center justify-between bg-muted/40 border-b border-border/60">
          <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">
            {shown.length} result{shown.length === 1 ? "" : "s"}
          </span>
          <button onClick={clearAll} className="text-[11px] font-semibold text-primary hover:underline outline-none">
            Clear all
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {loading && convs.length === 0 ? (
          <ConversationListSkeleton />
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-muted grid place-items-center mb-3">
              <MessageSquare className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="text-[13px] font-semibold text-foreground">
              {activeFiltersCount > 0 ? "No matching conversations" : "No conversations yet"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeFiltersCount > 0 ? "Try adjusting your filters" : "New chats land here automatically"}
            </p>
            {activeFiltersCount > 0 && (
              <button onClick={clearAll} className="mt-3 text-xs font-semibold text-primary hover:underline outline-none">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          shown.map((c) => (
            <div id={`conv-row-${c.id}`} key={c.id}>
              <ConversationCard
                conv={c}
                isActive={c.id === activeId}
                onClick={() => onSelect(c.id)}
                onCopy={onCopy}
                showAgent={showAgent}
                channelName={channelNameMap.get(c.channel)}
                dense={dense}
              />
            </div>
          ))
        )}
      </div>

    </div>
  );
}
