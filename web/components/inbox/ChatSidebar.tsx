"use client";

import { useI18n } from "@/lib/i18n";
import { useState, useEffect } from "react";
import { useInbox } from "./InboxContext";
import { formatCountdown } from "./SharedTypes";
import { initials, channelColor, interestColor } from "@/lib/utils";
import { Search, Filter, ArrowDownUp, CheckCircle2, Bot, Mic, Camera, Video, FileText, Headset, MessageSquare, AlertTriangle, Smile } from "lucide-react";
import { Select, SelectContent, SelectTrigger, SelectValue, SelectItem } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Input } from "@/components/ui/input";

export function ChatSidebar() {
  const { t } = useI18n();
  const {
    activeId, setActiveId, shown, filter, setFilter, query, setQuery,
    sortNewest, setSortNewest, showFilters, setShowFilters,
    filterChannel, setFilterChannel, filterInterest, setFilterInterest, filterCampaign, setFilterCampaign,
    filterAgent, setFilterAgent, filterStage, setFilterStage,
    convs, getLastResponder, copyText, agents, stages
  } = useInbox();

  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="w-[360px] shrink-0 flex flex-col border-r border-slate-200 bg-white">
      {/* Search & Filters */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1">
            <Select value={filter} onValueChange={(v) => setFilter(v || "")}>
              <SelectTrigger className="h-8 text-sm font-semibold border-slate-200">
                <SelectValue placeholder={t("broadcasts.all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("components.all")}{convs.length})</SelectItem>
                <SelectItem value="open">{t("components.open")}{convs.filter(c => c.status === "open").length})</SelectItem>
                <SelectItem value="pending">{t("components.pending")}{convs.filter(c => c.status === "pending").length})</SelectItem>
                <SelectItem value="closed">{t("components.closed")}{convs.filter(c => c.status === "closed").length})</SelectItem>
                <SelectItem value="unassigned">{t("components.unassigned")}{convs.filter(c => !c.assigned_agent_id).length})</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <button onClick={() => setSortNewest(!sortNewest)} title={sortNewest ? t("components.newestFirst") : t("components.oldestFirst")} className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors">
            <ArrowDownUp className={`w-4 h-4 transition-transform ${!sortNewest ? "scale-y-[-1]" : ""}`} />
          </button>
          <button onClick={() => setShowFilters(!showFilters)} className={`p-1.5 rounded-md transition-colors ${showFilters ? "text-amber-600 bg-amber-50" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"}`}>
            <Filter className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="flex flex-col gap-2 mb-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex gap-2">
              <MultiSelect
                placeholder={t("components.channel")}
                value={filterChannel}
                onChange={setFilterChannel}
                options={["whatsapp", "instagram", "telegram", "webchat", "email"].map(ch => ({ label: ch.charAt(0).toUpperCase() + ch.slice(1), value: ch }))}
                className="flex-1"
              />
              <MultiSelect
                placeholder={t("contacts.interest")}
                value={filterInterest}
                onChange={setFilterInterest}
                options={[
                  { label: "Hot", value: "hot" },
                  { label: "Warm", value: "warm" },
                  { label: "Cold", value: "cold" }
                ]}
                className="flex-1"
              />
              <MultiSelect
                placeholder={t("automation.campaign")}
                value={filterCampaign}
                onChange={setFilterCampaign}
                options={Array.from(new Map(convs.filter((c) => c.campaign_id).map((c) => [c.campaign_id as string, c.campaign_name])).entries()).map(([id, name]) => ({
                  label: name || id,
                  value: id
                }))}
                className="flex-1"
              />
            </div>
            <div className="flex gap-2">
              <MultiSelect
                placeholder={t("contacts.agent")}
                value={filterAgent}
                onChange={setFilterAgent}
                options={[
                  { label: "Unassigned", value: "unassigned" },
                  ...agents.map(a => ({ label: a.full_name, value: a.id }))
                ]}
                className="flex-1"
              />
              <MultiSelect
                placeholder={t("contacts.stage")}
                value={filterStage}
                onChange={setFilterStage}
                options={stages.map(s => ({ label: s.name, value: s.id }))}
                className="flex-1"
              />
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input 
            value={query} 
            onChange={(e) => setQuery(e.target.value)} 
            placeholder={t("components.search")} 
            className="pl-9 h-9 text-sm bg-slate-50 border-slate-200 focus-visible:ring-amber-500" 
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 px-4 text-center">
            <MessageSquare className="w-12 h-12 mb-2 text-slate-200" />
            <p className="text-sm font-semibold text-slate-600">{t("components.noConversations")}</p>
            <p className="text-xs">{t("components.newChatsLandHereAutomatically")}</p>
          </div>
        ) : shown.map(c => {
          const isActive = c.id === activeId;
          const responder = getLastResponder(c);
          const countdown = c.last_message_at ? formatCountdown(c.last_message_at) : "";
          
          const diff = c.last_message_at ? Date.now() - new Date(c.last_message_at).getTime() : 0;
          const isSlaBreached = c.status === "open" && responder !== "agent" && responder !== "bot" && diff > 15 * 60 * 1000;
          
          return (
            <div 
              key={c.id} 
              onClick={() => setActiveId(c.id)}
              className={`flex gap-3 px-4 py-3 mx-2 my-1 cursor-pointer rounded-xl transition-all ${
                  isActive ? "bg-slate-50 border border-slate-200 shadow-sm" : 
                  (c.unread_count && c.unread_count > 0) ? "bg-blue-50/40 border-blue-100/50 hover:bg-blue-50/70" :
                  "hover:bg-slate-50 border border-transparent"
                } ${isSlaBreached && !isActive ? "bg-red-50/50 hover:bg-red-50" : ""}`}
            >
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
                     style={{ backgroundColor: channelColor(c.channel) + "20", color: channelColor(c.channel) }}>
                  {initials(c.contact_name || c.contact_phone)}
                </div>
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center gap-2 mb-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h4 className={`text-sm font-bold truncate ${c.unread_count ? 'text-blue-700' : 'text-slate-900'}`}>{c.contact_name || c.contact_phone || t("components.unnamed")}</h4>
                    {!!c.unread_count && (
                      <span className="flex-shrink-0 flex items-center justify-center min-w-4 h-4 rounded-full bg-blue-500 text-[10px] font-bold text-white px-1 shadow-sm">
                        {c.unread_count > 99 ? '99+' : c.unread_count}
                      </span>
                    )}
                  </div>
                  {countdown && (
                    <div className="flex items-center gap-1 shrink-0">
                      {responder === "agent" ? (
                        <Headset className="w-3.5 h-3.5 text-slate-400" />
                      ) : isSlaBreached ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                      ) : null}
                      <span className={`text-[11px] font-semibold ${responder === "agent" ? "text-amber-600" : isSlaBreached ? "text-red-600" : "text-slate-400"}`}>
                        {countdown}
                      </span>
                    </div>
                  )}
                </div>
                
                {c.contact_phone && (
                  <div className="flex items-center gap-1 mb-1 group/copy">
                    <span className="text-[11px] text-slate-500 font-medium">{c.contact_phone}</span>
                    <button onClick={(e) => { e.stopPropagation(); copyText(c.contact_phone!); }} className="opacity-0 group-hover/copy:opacity-100 p-0.5 text-slate-400 hover:text-amber-600 transition-all">
                      <FileText className="w-3 h-3" />
                    </button>
                  </div>
                )}
                
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-slate-500 truncate flex items-center gap-1 flex-1">
                    {c.last_message_preview === "[audio]" ? <><Mic className="w-3.5 h-3.5" /> {t("components.voiceMessage")}</> :
                     c.last_message_preview === "[image]" ? <><Camera className="w-3.5 h-3.5" /> {t("components.photo")}</> :
                     c.last_message_preview === "[video]" ? <><Video className="w-3.5 h-3.5" /> {t("components.video")}</> :
                     c.last_message_preview === "[document]" ? <><FileText className="w-3.5 h-3.5" /> {t("components.document")}</> :
                     c.last_message_preview === "[sticker]" ? <><Smile className="w-3.5 h-3.5" /> {t("components.sticker")}</> :
                     c.last_message_preview || t("components.noMessagesYet")}
                  </p>
                  {c.last_message_preview && responder === "agent" && <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0 ml-1" />}
                </div>

                {(c.campaign_name || c.agent_name) && (
                  <div className="flex items-center gap-1 mt-1.5 overflow-hidden">
                    {c.campaign_name && (
                      <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded truncate max-w-[50%]">
                        {c.campaign_name}
                      </span>
                    )}
                    {c.agent_name && (
                      <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded truncate max-w-[50%]">
                        👤 {c.agent_name}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {c.interest_level && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider" 
                          style={{ backgroundColor: interestColor(c.interest_level) + "18", color: interestColor(c.interest_level), border: `1px solid ${interestColor(c.interest_level)}30` }}>
                      {c.interest_level}
                    </span>
                  )}
                  {c.stage_name && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100">
                      {c.stage_name}
                    </span>
                  )}

                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
