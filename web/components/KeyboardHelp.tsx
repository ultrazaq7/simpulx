"use client";
import { X } from "@phosphor-icons/react/ssr";

const SECTIONS: { title: string; items: [string, string][] }[] = [
  { title: "Navigation", items: [
    ["⌘ K", "Command palette"],
    ["g  d", "Go to Dashboard"],
    ["g  i", "Go to Inbox"],
    ["g  c", "Go to Contacts"],
    ["g  b", "Go to Broadcasts"],
    ["g  s", "Go to Settings"],
  ] },
  { title: "Inbox", items: [
    ["j  /  ↓", "Next conversation"],
    ["k  /  ↑", "Previous conversation"],
    ["/", "Focus search"],
  ] },
  { title: "General", items: [
    ["?", "Keyboard shortcuts"],
    ["Esc", "Close dialog"],
  ] },
];

export default function KeyboardHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px] animate-fade-in" />
      <div role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" className="relative w-full max-w-[460px] bg-card rounded-xl border border-border shadow-2xl overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <p className="font-bold text-[15px] text-foreground">Keyboard shortcuts</p>
          <button aria-label="Close" onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none"><X className="w-[18px] h-[18px]" /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{s.title}</p>
              <div className="space-y-1.5">
                {s.items.map(([k, label]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[13px] text-foreground/90">{label}</span>
                    <kbd className="text-[11px] font-semibold text-muted-foreground bg-muted border border-border rounded px-1.5 py-0.5">{k}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
