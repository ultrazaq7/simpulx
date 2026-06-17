"use client";

import { X, Download, ChevronLeft, ChevronRight, Video, FileText, File } from "lucide-react";
import { initials, fmtDate, fmtTime, channelColor } from "@/lib/utils";
import { getMediaUrl } from "./SharedTypes";
import { CustomVideoPlayer } from "./CustomVideoPlayer";
import type { Message, Conversation } from "@/lib/types";

interface MediaGalleryProps {
  currentPreview: Message | null;
  mediaMessages: Message[];
  previewIndex: number;
  setPreviewMediaId: (id: string | null) => void;
  active: Conversation | null;
}

export function MediaGallery({ currentPreview, mediaMessages, previewIndex, setPreviewMediaId, active }: MediaGalleryProps) {
  if (!currentPreview) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-xl">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-950/50 absolute top-0 left-0 right-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
               style={{ 
                 backgroundColor: currentPreview.direction === "inbound" ? channelColor(active?.channel || "") + "20" : "#2D8B73", 
                 color: currentPreview.direction === "inbound" ? channelColor(active?.channel || "") : "#fff" 
               }}>
            {initials(currentPreview.direction === "inbound" ? (active?.contact_name || active?.contact_phone) : "Agent")}
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">
              {currentPreview.direction === "inbound" ? (active?.contact_name || active?.contact_phone || "Contact") : "You"}
            </h3>
            <p className="text-white/60 text-xs">
              {fmtDate(currentPreview.created_at)} at {fmtTime(currentPreview.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={getMediaUrl(currentPreview)} download target="_blank" rel="noreferrer" 
             className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
            <Download className="w-5 h-5" />
          </a>
          <button onClick={() => setPreviewMediaId(null)} 
                  className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex items-center justify-center p-8 pt-24 pb-32 min-h-0 overflow-hidden relative">
        {previewIndex > 0 && (
          <button onClick={(e) => { e.stopPropagation(); setPreviewMediaId(mediaMessages[previewIndex - 1].id); }} 
                  className="absolute left-6 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/80 text-white rounded-full z-10 transition-colors">
            <ChevronLeft className="w-8 h-8" />
          </button>
        )}

        <div className="w-full h-full flex items-center justify-center min-h-0">
          {currentPreview.type === "image" ? (
            <img src={getMediaUrl(currentPreview)} className="max-w-full max-h-full object-contain drop-shadow-2xl" alt="Preview" />
          ) : currentPreview.type === "video" ? (
            <div className="w-full h-full max-w-5xl min-h-0 flex justify-center drop-shadow-2xl">
              <CustomVideoPlayer src={getMediaUrl(currentPreview)} />
            </div>
          ) : (
            <div className="w-full h-full max-w-4xl bg-white rounded-xl overflow-hidden drop-shadow-2xl">
              <iframe src={getMediaUrl(currentPreview)} className="w-full h-full border-none" title="Document Preview" />
            </div>
          )}
        </div>

        {previewIndex < mediaMessages.length - 1 && (
          <button onClick={(e) => { e.stopPropagation(); setPreviewMediaId(mediaMessages[previewIndex + 1].id); }} 
                  className="absolute right-6 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/80 text-white rounded-full z-10 transition-colors">
            <ChevronRight className="w-8 h-8" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnails */}
      {mediaMessages.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-slate-950/80 flex items-center justify-center p-4 gap-3 z-20 backdrop-blur-md">
          <div className="flex gap-3 overflow-x-auto max-w-full py-2 px-4 scrollbar-hide">
            {mediaMessages.map((m, idx) => (
              <button 
                key={m.id} 
                onClick={() => setPreviewMediaId(m.id)} 
                className={`w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-all ${idx === previewIndex ? 'border-amber-500 opacity-100 scale-110' : 'border-transparent opacity-50 hover:opacity-100'}`}
              >
                {m.type === "image" ? (
                  <img src={getMediaUrl(m)} className="w-full h-full object-cover" alt="Thumbnail" />
                ) : m.type === "video" ? (
                  <div className="w-full h-full relative bg-black">
                    <video src={getMediaUrl(m) + "#t=0.1"} className="w-full h-full object-cover" preload="metadata" />
                    <div className="absolute bottom-1 left-1 flex items-center gap-1 z-10">
                      <Video className="w-3 h-3 text-white drop-shadow-md" />
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                    {(m.type === "document" || m.media_url?.toLowerCase().includes(".pdf")) 
                      ? <FileText className="w-6 h-6 text-red-500" /> 
                      : <File className="w-6 h-6 text-blue-500" />}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
