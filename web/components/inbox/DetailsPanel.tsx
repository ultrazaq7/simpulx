"use client";
import { useState } from "react";
import { useInbox } from "./InboxContext";
import { X, User, Copy, Tag, Chat as MessageSquare, Clock, Robot as Bot, MapPin, Package as Box, Hash, Lock } from "@phosphor-icons/react/ssr";
import { initials, channelColor, fmtDate, fmtTime } from "@/lib/utils";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

function DetailRow({ icon, label, value, onCopy }: { icon: React.ReactNode; label: string; value: string; onCopy?: () => void }) {
  return (
    <div className="flex gap-3 mb-4 group">
      <div className="text-slate-400 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">{label}</p>
        <div className="flex items-center gap-1">
          <p className="text-sm font-semibold text-slate-900 truncate">{value}</p>
          {onCopy && (
            <button onClick={onCopy} className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-amber-600 transition-all">
              <Copy className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function DetailsPanel() {
  const { active, activeId, setRightPanel, notes, notify, copyText } = useInbox();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"info" | "notes">("info");
  const [noteDraft, setNoteDraft] = useState("");

  if (!active) return null;

  async function addNote() {
    if (!noteDraft.trim() || !activeId) return;
    await api.addNote(activeId, noteDraft.trim());
    setNoteDraft("");
    queryClient.invalidateQueries({ queryKey: ["notes", activeId] });
    notify("Note added");
  }

  return (
    <div className="w-[320px] shrink-0 flex flex-col border-l border-slate-200 bg-white">
      {/* Header */}
      <div className="px-5 py-3.5 flex items-center border-b border-slate-200 bg-slate-50">
        <h3 className="font-bold text-sm text-slate-900 flex-1">Details</h3>
        <button onClick={() => setRightPanel(null)} className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-200 rounded-md transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Profile summary */}
      <div className="p-5 border-b border-slate-200">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center font-bold text-lg shrink-0"
               style={{ backgroundColor: channelColor(active.channel) + "20", color: channelColor(active.channel) }}>
            {initials(active.contact_name || active.contact_phone)}
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-base text-slate-900 truncate mb-1">{active.contact_name || "Unnamed"}</h4>
            {active.contact_phone && (
              <div className="flex items-center gap-1 group/copy">
                <span className="text-xs text-slate-500 font-medium">{active.contact_phone}</span>
                <button onClick={() => copyText(active.contact_phone!)} className="opacity-0 group-hover/copy:opacity-100 p-0.5 text-slate-400 hover:text-amber-600 transition-all">
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-2 border-b border-slate-200">
        <button onClick={() => setTab("info")} className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold transition-colors ${tab === "info" ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-500 hover:text-slate-700 border-b-2 border-transparent"}`}>
          <User className="w-4 h-4" /> Contact
        </button>
        <button onClick={() => setTab("notes")} className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold transition-colors ${tab === "notes" ? "text-amber-700 border-b-2 border-amber-500" : "text-slate-500 hover:text-slate-700 border-b-2 border-transparent"}`}>
          <Lock className="w-4 h-4" /> Notes
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "info" && (
          <div className="p-5">
            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Customer details</h5>
            <DetailRow icon={<User className="w-4 h-4" />} label="Full name" value={active.contact_name || "Unknown"} />
            <DetailRow icon={<Hash className="w-4 h-4" />} label="Phone" value={active.contact_phone || "None"} onCopy={active.contact_phone ? () => copyText(active.contact_phone!) : undefined} />
            <DetailRow icon={<Tag className="w-4 h-4" />} label="Channel" value={active.channel || "Unknown"} />
            {active.campaign_name && <DetailRow icon={<Tag className="w-4 h-4" />} label="Campaign" value={active.campaign_name} />}
            <DetailRow icon={<MessageSquare className="w-4 h-4" />} label="Status" value={active.status} />
            <DetailRow icon={<Clock className="w-4 h-4" />} label="Last message" value={fmtDate(active.last_message_at) || "No messages"} />
            <DetailRow icon={<Bot className="w-4 h-4" />} label="AI active" value={active.is_bot_active ? "Yes" : "No"} />

            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-8 mb-4">Lead Qualification</h5>
            <DetailRow icon={<Tag className="w-4 h-4" />} label="Interest Level" value={active.interest_level || "Unknown"} />
            <DetailRow icon={<Box className="w-4 h-4" />} label="Brand" value={active.car_brand || "Unknown"} />
            <DetailRow icon={<Box className="w-4 h-4" />} label="Model" value={active.car_model || "Unknown"} />
            <DetailRow icon={<MapPin className="w-4 h-4" />} label="City" value={active.city || "Unknown"} />
            <DetailRow icon={<Clock className="w-4 h-4" />} label="Purchase time" value={active.purchase_timeframe || "Unknown"} />

            {active.lost_reason && (
              <DetailRow icon={<Lock className="w-4 h-4" />} label="Lost Reason" value={active.lost_reason} />
            )}
          </div>
        )}

        {tab === "notes" && (
          <div className="p-5">
            <div className="mb-6">
              <textarea 
                value={noteDraft} 
                onChange={e => setNoteDraft(e.target.value)} 
                placeholder="Add an internal note..." 
                className="w-full h-20 p-3 text-sm rounded-xl border border-amber-200 bg-amber-50/50 focus:border-amber focus:ring-2 focus:ring-amber/20-400 focus:ring-1 focus:ring-amber-400 outline-none resize-none placeholder:text-amber-700/50 text-amber-900 transition-all"
              />
              <button 
                onClick={addNote} 
                disabled={!noteDraft.trim()} 
                className="w-full mt-2 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:hover:bg-amber-500 text-white text-xs font-bold transition-colors"
              >
                Add note
              </button>
            </div>
            
            <div className="space-y-3">
              {notes.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-4">No internal notes yet</p>
              ) : notes.map(n => (
                <div key={n.id} className="p-4 rounded-xl border border-amber-200 bg-amber-50">
                  <p className="text-sm text-amber-900 mb-2">{n.body}</p>
                  <span className="text-[10px] font-bold text-amber-700/60 block uppercase tracking-wider">{n.author || "Unknown"} • {fmtTime(n.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
