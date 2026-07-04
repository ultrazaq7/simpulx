"use client";

import { useInbox } from "./InboxContext";
import { CheckReadLinear as Check, AltArrowRightLinear as ChevronRight, AltArrowDownLinear as ChevronDown, QuestionCircleLinear as RotateCcw, CheckCircleLinear as CheckCircle, MagniferLinear as Search, QuestionCircleLinear as PanelRight, MenuDotsCircleLinear as MoreVertical } from "solar-icon-set";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";

export function ChatHeader() {
  const { active, convs, stages, setStage, override, doAction, rightPanel, setRightPanel, notify, copyText, getLastResponder } = useInbox();
  
  if (!active) return null;

  const currentStageIdx = stages.findIndex((s) => s.id === active.stage_id);
  const currentStage = stages.find((s) => s.id === active.stage_id);
  
  const stageColorMap: Record<string, string> = {
    "new_lead": "#EF4444", "new lead": "#EF4444",
    "contacted": "#FF9800", "qualified": "#F5A623",
    "pending_payment": "#3B82F6", "pending payment": "#3B82F6",
    "customer": "#10B981", "won": "#059669",
    "lost": "#9333EA", "no_reply": "#6366F1", "no reply": "#6366F1",
  };
  
  const getDotColor = (name: string) => stageColorMap[name.toLowerCase()] || stageColorMap[name.toLowerCase().replace(/\s+/g, "_")] || "#F59E0B";
  const dotColor = currentStage ? getDotColor(currentStage.name) : "#9CA3AF";
  
  const nextStageIdx = currentStageIdx >= 0 ? currentStageIdx + 1 : -1;
  const nextStage = nextStageIdx >= 0 && nextStageIdx < stages.length ? stages[nextStageIdx] : null;

  // Prevent Ghost Leads: Check if another active conversation exists for the same contact & campaign
  const hasActiveDuplicate = convs.some(c => 
    c.id !== active.id && 
    c.status !== "closed" && 
    c.campaign_id === active.campaign_id && 
    (c.contact_phone === active.contact_phone || c.contact_name === active.contact_name)
  );

  // SLA Tracker: Unanswered by agent for > 15 mins
  let isSlaBreached = false;
  if (active.status === "open" && active.last_message_at) {
    const lastResponder = getLastResponder(active);
    const msSinceLast = Date.now() - new Date(active.last_message_at).getTime();
    if (lastResponder === "contact" && msSinceLast > 15 * 60 * 1000) {
      isSlaBreached = true;
    }
  }

  return (
    <div className="flex flex-col shrink-0 border-b border-slate-200 bg-white">
      {isSlaBreached && (
        <div className="bg-red-50 text-red-600 px-4 py-1.5 text-[11px] font-bold flex items-center justify-center gap-2 border-b border-red-100">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          SLA BREACHED: Contact waiting for more than 15 minutes!
        </div>
      )}
      <div className="h-14 flex items-center px-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          
          {/* Stage Dropdown */}
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden h-8 bg-slate-50">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 px-3 h-full hover:bg-slate-100 transition-colors border-r border-slate-200">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
                  <span className="text-xs font-bold text-slate-700 whitespace-nowrap">{currentStage?.name || "Select stage"}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 p-1">
                <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Progressing Stage</div>
                {stages.filter((s) => !["lost", "no_reply", "no reply"].includes(s.name.toLowerCase())).map((s) => (
                  <DropdownMenuItem key={s.id} onClick={() => setStage(s.id)} className="text-xs font-medium cursor-pointer">
                    <div className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: getDotColor(s.name) }} />
                    {s.name}
                    {s.id === active.stage_id && <Check className="w-4 h-4 ml-auto text-amber-600" />}
                  </DropdownMenuItem>
                ))}
                
                {stages.some((s) => ["lost", "no_reply", "no reply"].includes(s.name.toLowerCase())) && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lost Stage</div>
                    {stages.filter((s) => ["lost", "no_reply", "no reply"].includes(s.name.toLowerCase())).map((s) => (
                      <DropdownMenuItem key={s.id} onClick={() => setStage(s.id)} className="text-xs font-medium cursor-pointer">
                        <div className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: getDotColor(s.name) }} />
                        {s.name}
                        {s.id === active.stage_id && <Check className="w-4 h-4 ml-auto text-amber-600" />}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            
            <button 
              disabled={!nextStage} 
              onClick={() => { if (nextStage) { setStage(nextStage.id); notify(`Stage -> "${nextStage.name}"`); } }}
              className="w-8 h-full flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title={nextStage ? `Next: ${nextStage.name}` : "Last stage"}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Contact Info */}
          <div className="min-w-0 flex flex-col">
            <h2 className="text-sm font-bold text-slate-900 truncate">{active.contact_name || active.contact_phone || "Unnamed"}</h2>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-2.5 py-1 rounded-md text-xs font-bold capitalize ${
            active.status === "open" ? "bg-emerald-50 text-emerald-700" : 
            active.status === "pending" ? "bg-amber-50 text-amber-700" : 
            "bg-slate-100 text-slate-600"
          }`}>
            {active.status}
          </span>

          {active.status === "closed" && !hasActiveDuplicate && (
            <button onClick={() => doAction(() => api.patchConversation(active.id, { status: "open" } as any), "Conversation reopened")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> Reopen
            </button>
          )}

          {active.status === "closed" && hasActiveDuplicate && (
            <span className="text-[10px] text-slate-400 font-medium px-2">(Has another active chat)</span>
          )}

          {active.status !== "closed" && (
            <button onClick={() => doAction(() => api.close(active.id), "Conversation resolved")} title="Resolve conversation"
                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors">
              <CheckCircle className="w-5 h-5" />
            </button>
          )}

        <div className="w-px h-6 bg-slate-200 mx-1" />

        <button onClick={() => setRightPanel(rightPanel === "search" ? null : "search")} title="Search messages"
                className={`p-1.5 rounded-md transition-colors ${rightPanel === "search" ? "bg-amber-50 text-amber-600" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>
          <Search className="w-4 h-4" />
        </button>
        
        <button onClick={() => setRightPanel(rightPanel === "details" ? null : "details")} title="Contact details"
                className={`p-1.5 rounded-md transition-colors ${rightPanel === "details" ? "bg-amber-50 text-amber-600" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>
          <PanelRight className="w-4 h-4" />
        </button>
        </div>
      </div>
    </div>
  );
}
