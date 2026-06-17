"use client";

import { useInbox } from "./InboxContext";
import { X, Search as SearchIcon, FileText } from "lucide-react";
import { fmtDate, fmtTime } from "@/lib/utils";
import type { Message } from "@/lib/types";
import { Input } from "@/components/ui/input";

export function SearchPanel() {
  const { setRightPanel, searchQuery, setSearchQuery, searchQueryObj, debouncedSearch, jumpToMessage } = useInbox();

  return (
    <div className="w-[320px] shrink-0 flex flex-col border-l border-slate-200 bg-white">
      {/* Header */}
      <div className="px-5 py-3.5 flex items-center border-b border-slate-200 bg-slate-50">
        <button onClick={() => setRightPanel(null)} className="p-1.5 -ml-1.5 mr-2 text-slate-400 hover:text-slate-900 hover:bg-slate-200 rounded-md transition-colors">
          <X className="w-4 h-4" />
        </button>
        <h3 className="font-bold text-sm text-slate-900 flex-1">Search messages</h3>
      </div>

      {/* Input */}
      <div className="p-3 border-b border-slate-200 bg-slate-50">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            placeholder="Search in this chat..." 
            className="pl-9 pr-9 h-9 text-sm bg-white border-slate-200 focus-visible:ring-amber-500 rounded-lg" 
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-2 p-1 text-slate-400 hover:text-slate-600 rounded-full">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {searchQueryObj.isLoading ? (
          <p className="p-6 text-center text-xs font-medium text-slate-400">Searching...</p>
        ) : searchQueryObj.data?.data && searchQueryObj.data.data.length > 0 ? (
          searchQueryObj.data.data.map((m: Message) => (
            <div key={m.id} onClick={() => jumpToMessage(m.id)} className="p-4 border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors group">
              <p className="text-[10px] font-bold text-slate-400 mb-1.5 group-hover:text-amber-600 transition-colors">{fmtDate(m.created_at)} at {fmtTime(m.created_at)}</p>
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                <p className={`text-xs font-medium line-clamp-3 leading-relaxed ${m.direction === "inbound" ? "text-emerald-700" : "text-slate-700"}`}>
                  {m.body}
                </p>
              </div>
            </div>
          ))
        ) : debouncedSearch.length >= 2 ? (
          <p className="p-6 text-center text-xs font-medium text-slate-400">No messages found.</p>
        ) : (
          <div className="p-10 flex flex-col items-center justify-center text-slate-400">
            <SearchIcon className="w-8 h-8 mb-3 opacity-20" />
            <p className="text-xs font-medium text-center">Search for messages, links, or files in this conversation.</p>
          </div>
        )}
      </div>
    </div>
  );
}
