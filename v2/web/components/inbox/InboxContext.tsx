"use client";
import { createContext, useContext } from "react";
import type { Conversation, Message, InternalNote, QuickReply, Stage, Agent, Disposition } from "@/lib/types";

export interface InboxContextType {
  // Global State
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  active: Conversation | null;
  
  // Data
  convs: Conversation[];
  messages: Message[];
  notes: InternalNote[];
  stages: Stage[];
  dispositions: Disposition[];
  agents: Agent[];
  quickReplies: QuickReply[];
  
  // Handlers
  notify: (msg: string, severity?: "success" | "info" | "warning" | "error") => void;
  loadConvs: () => Promise<void>;
  doAction: (fn: () => Promise<any>, successMsg: string) => Promise<void>;
  override: (patch: any, label: string) => Promise<void>;
  setStage: (stageId: string) => Promise<void>;
  jumpToMessage: (msgId: string) => void;
  copyText: (text: string) => void;
  
  // UI State
  rightPanel: "details" | "search" | null;
  setRightPanel: (panel: "details" | "search" | null) => void;
  previewMediaId: string | null;
  setPreviewMediaId: (id: string | null) => void;
  highlightMsgId: string | null;
  
  // Sidebar State
  filter: string; setFilter: (v: string) => void;
  query: string; setQuery: (v: string) => void;
  sortNewest: boolean; setSortNewest: (v: boolean) => void;
  showFilters: boolean; setShowFilters: (v: boolean) => void;
  filterChannel: string[]; setFilterChannel: (v: string[]) => void;
  filterInterest: string[]; setFilterInterest: (v: string[]) => void;
  filterCampaign: string[]; setFilterCampaign: (v: string[]) => void;
  filterAgent: string[]; setFilterAgent: (v: string[]) => void;
  filterStage: string[]; setFilterStage: (v: string[]) => void;
  shown: Conversation[];
  getLastResponder: (c: Conversation) => "agent" | "contact" | "bot" | null;

  // Search Panel
  searchQuery: string; setSearchQuery: (v: string) => void;
  searchQueryObj: any;
  debouncedSearch: string;
}

export const InboxContext = createContext<InboxContextType | null>(null);

export function useInbox() {
  const ctx = useContext(InboxContext);
  if (!ctx) throw new Error("useInbox must be used within InboxProvider");
  return ctx;
}
