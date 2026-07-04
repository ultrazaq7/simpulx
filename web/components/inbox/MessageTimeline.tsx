"use client";

import { useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useInbox } from "./InboxContext";
import { getMediaUrl, TimelineItem } from "./SharedTypes";
import { fmtTime, dateLabel, channelColor, initials } from "@/lib/utils";
import { Lock, FileText, Robot as Bot, Check, Checks as CheckCheck, Clock, WarningCircle as AlertCircle, Target, Pulse as Activity } from "@phosphor-icons/react/ssr";

export function MessageTimeline({ 
  timeline, 
  messagesQuery 
}: { 
  timeline: TimelineItem[], 
  messagesQuery: any 
}) {
  const { active, highlightMsgId, setPreviewMediaId } = useInbox();
  const bodyRef = useRef<HTMLDivElement>(null);
  
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
    if (!active) return;
    const len = timeline.length;
    const switchedConv = active.id !== prevActiveIdRef.current;

    if (switchedConv) {
      if (timeline.length > 0) setTimeout(() => rowVirtualizer.scrollToIndex(timeline.length - 1, { align: "end" }), 50);
    } else if (len > prevLenRef.current) {
      if (prevLenRef.current === 0 || (bodyRef.current && (bodyRef.current.scrollHeight - bodyRef.current.scrollTop - bodyRef.current.clientHeight < 250))) {
        setTimeout(() => rowVirtualizer.scrollToIndex(timeline.length - 1, { align: "end" }), 50);
      }
    }

    prevLenRef.current = len;
    prevActiveIdRef.current = active.id;
  }, [timeline.length, rowVirtualizer, active]);

  useEffect(() => {
    if (highlightMsgId) {
      const idx = timeline.findIndex(it => it.kind === "msg" && it.m.id === highlightMsgId);
      if (idx !== -1) {
        rowVirtualizer.scrollToIndex(idx, { align: "center" });
      }
    }
  }, [highlightMsgId, timeline, rowVirtualizer]);

  if (!active) return null;

  return (
    <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-6 flex flex-col bg-slate-50 relative">
      {messagesQuery.isFetchingNextPage && <p className="text-center text-xs text-slate-400 my-2">Loading older messages...</p>}
      <div style={{ height: rowVirtualizer.getTotalSize(), width: "100%", position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const it = timeline[virtualRow.index];
          let content = null;
          
          if (it.kind === "date") {
            content = (
              <div className="flex items-center gap-4 py-2">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="px-3 py-1 rounded-full text-[10px] font-bold text-slate-500 bg-white border border-slate-200">{it.label}</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
            );
          } else if (it.kind === "note") {
            content = (
              <div className="ml-auto max-w-[72%] rounded-xl border-l-4 border-amber-500 bg-amber-50 px-4 py-3 shadow-sm my-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Lock className="w-3 h-3 text-amber-700" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Internal note</span>
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{it.n.body}</p>
                <span className="text-[10px] text-amber-600/70 mt-1.5 block font-medium">{it.n.author || "Unknown"} • {fmtTime(it.n.created_at)}</span>
              </div>
            );
          } else {
            const m = it.m;
            const out = m.direction === "outbound";
            const bot = m.sender_type === "bot";
            const who = !out ? (active.contact_name || "Customer") : bot ? "AI Agent" : (active.agent_name || "Agent");

            if (m.sender_type === "system" || m.type === "attribution" || m.type === "audit" || m.type === "event") {
              const isAttribution = m.type === "attribution" || m.body?.toLowerCase().includes("clicked");
              const isAudit = m.type === "audit" || m.sender_type === "system";

              content = (
                <div className="flex justify-center py-3 my-2 w-full">
                  <div className={`rounded-xl px-5 py-3 max-w-[85%] border shadow-sm flex flex-col items-center justify-center relative overflow-hidden ${
                    isAttribution ? "bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-100" : "bg-slate-50 border-slate-200"
                  }`}>
                    {isAttribution && (
                      <div className="absolute top-0 right-0 p-2 opacity-10">
                        <Target className="w-12 h-12 text-indigo-500" />
                      </div>
                    )}
                    
                    <div className="flex items-center gap-1.5 mb-2 z-10">
                      {isAttribution ? (
                        <Target className="w-4 h-4 text-indigo-600" />
                      ) : (
                        <Activity className="w-4 h-4 text-slate-500" />
                      )}
                      <span className={`text-[10.5px] font-bold uppercase tracking-widest ${isAttribution ? "text-indigo-700" : "text-slate-600"}`}>
                        {isAttribution ? "Attribution Event" : "Audit Trail"}
                      </span>
                    </div>
                    
                    <p className={`text-[13px] font-semibold text-center z-10 px-2 leading-relaxed ${isAttribution ? "text-indigo-900" : "text-slate-700"}`}>
                      {m.body}
                    </p>
                    
                    <span className={`text-[10px] font-bold block mt-2 z-10 ${isAttribution ? "text-indigo-400" : "text-slate-400"}`}>
                      {fmtTime(m.created_at)}
                    </span>
                  </div>
                </div>
              );
            } else {
              content = (
                <div className={`flex w-full ${out ? "justify-end" : "justify-start"} my-1`}>
                  {!out && (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs mr-3 mt-4 shrink-0"
                         style={{ backgroundColor: channelColor(active.channel) + "20", color: channelColor(active.channel) }}>
                      {initials(active.contact_name || active.contact_phone)}
                    </div>
                  )}
                  <div className={`max-w-[66%] flex flex-col ${out ? "items-end" : "items-start"}`}>
                    <span className={`text-[10px] font-bold mb-1 px-1 flex items-center gap-1 ${bot ? "text-indigo-600" : "text-slate-500"}`}>
                      {who} {bot && <Bot className="w-3 h-3" />}
                    </span>
                    <div className={`px-4 py-2.5 text-[13px] leading-relaxed shadow-sm transition-colors duration-500 ${
                      out 
                        ? highlightMsgId === m.id 
                          ? "bg-blue-600 text-white rounded-2xl rounded-br-sm" 
                          : "bg-slate-900 text-white rounded-2xl rounded-br-sm"
                        : highlightMsgId === m.id
                          ? "bg-blue-50 border border-blue-200 rounded-2xl rounded-bl-sm"
                          : "bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-bl-sm"
                    }`}>
                      {/* Media Rendering */}
                      {m.media_url && (
                        <div className={`mb-2 ${!m.body ? "mb-0" : ""}`}>
                          {m.type === "image" ? (
                            <img src={getMediaUrl(m)} onClick={() => setPreviewMediaId(m.id)} className="max-h-60 max-w-full rounded-lg cursor-pointer" alt="Attachment" />
                          ) : m.type === "video" ? (
                            <video src={getMediaUrl(m)} onClick={() => setPreviewMediaId(m.id)} className="max-h-60 max-w-full rounded-lg cursor-pointer" />
                          ) : m.type === "audio" ? (
                            <audio src={getMediaUrl(m)} controls className="w-60" />
                          ) : m.type === "sticker" ? (
                            <img src={getMediaUrl(m)} className="w-32 h-32 object-contain bg-transparent drop-shadow-sm" alt="Sticker" />
                          ) : (
                            <a href={getMediaUrl(m)} target="_blank" rel="noreferrer" className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${out ? "bg-white/10 hover:bg-white/20 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-800"}`}>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${out ? "bg-white/20 text-white" : "bg-slate-200 text-slate-500"}`}>
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">Attachment</p>
                                <p className="text-[10px] opacity-70 truncate">{m.media_url.split('/').pop()}</p>
                              </div>
                            </a>
                          )}
                        </div>
                      )}

                      {/* Text Rendering */}
                      {m.body && (
                        <div className={`text-[13px] leading-relaxed break-words whitespace-pre-wrap ${
                          (m.type === "template" || m.type === "interactive" || m.type === "button") ? "font-mono text-[12px] bg-black/5 p-2 rounded border border-black/10" : ""
                        }`}>
                          {m.type === "template" && <span className="font-bold text-[10px] uppercase block mb-1 opacity-60">Template Message</span>}
                          {m.body}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1 px-1">
                      <span className="text-[10px] font-medium text-slate-400">{fmtTime(m.created_at)}</span>
                      {out && (
                        m.status === "read" ? <CheckCheck className="w-3.5 h-3.5 text-blue-500" /> :
                        m.status === "delivered" ? <CheckCheck className="w-3.5 h-3.5 text-slate-400" /> :
                        m.status === "sent" ? <Check className="w-3.5 h-3.5 text-slate-400" /> :
                        m.status === "failed" ? <AlertCircle className="w-3.5 h-3.5 text-red-500" /> :
                        <Clock className="w-3 h-3 text-slate-300" />
                      )}
                    </div>
                  </div>
                </div>
              );
            }
          }

          return (
            <div key={virtualRow.key} data-index={virtualRow.index} ref={rowVirtualizer.measureElement}
                 className="absolute top-0 left-0 w-full" style={{ transform: `translateY(${virtualRow.start}px)` }}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
