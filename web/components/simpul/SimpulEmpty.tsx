// Signature empty state · the "Simpul thread": a woven thread strung with
// knot-nodes, the active one tied in brand petrol. Replaces the generic
// chat-bubble / lucide-icon-in-a-circle placeholders app-wide so every empty
// state reads as one identity. Motion is functional and subtle (a single soft
// pulse on the active knot), never decorative parallax/particles.
import React, { type ReactNode } from "react";

/** The thread artwork. `tone="ai"` swaps the active knot to the AI indigo so the
 *  empty state can hint automation (e.g. an all-automated queue). */
export function ThreadArt({ tone = "brand", className }: { tone?: "brand" | "ai"; className?: string }) {
  const accent = tone === "ai" ? "hsl(var(--ai))" : "hsl(var(--primary))";
  const soft = tone === "ai" ? "hsl(var(--ai) / 0.14)" : "hsl(var(--primary) / 0.12)";
  return (
    <svg width="188" height="96" viewBox="0 0 188 96" fill="none" className={className} aria-hidden="true">
      {/* soft halo behind the active knot */}
      <circle cx="140" cy="48" r="34" fill={soft} />
      {/* the thread · a gentle woven line through the nodes */}
      <path d="M8 48 C 34 30, 46 30, 70 48 S 116 66, 140 48 S 176 34, 180 48"
        stroke="hsl(var(--primary) / 0.28)" strokeWidth="2" strokeLinecap="round" />
      {/* passive knot-nodes (leads waiting on the line) */}
      {[[24, 40], [70, 48], [108, 56]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="5" fill="hsl(var(--card))"
          stroke="hsl(var(--primary) / 0.45)" strokeWidth="2" />
      ))}
      {/* the active knot · tied, in the accent, with a soft pulse */}
      <g>
        <circle cx="140" cy="48" r="13" fill="hsl(var(--card))" stroke={accent} strokeWidth="2.5" />
        {/* interlocking loops = the Simpul knot */}
        <path d="M135 50c0-3 2.4-4.8 5.2-4.8 2.2 0 3.7 1.3 3.7 3.1 0 1.3-1 2.2-2.2 2.2"
          stroke={accent} strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M145 46c0 3-2.4 4.8-5.2 4.8-2.2 0-3.7-1.3-3.7-3.1 0-1.3 1-2.2 2.2-2.2"
          stroke={accent} strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="140" cy="48" r="19" fill="none" stroke={accent} strokeOpacity="0.5" strokeWidth="1.5"
          className="origin-center motion-safe:animate-knot-pulse" />
      </g>
    </svg>
  );
}

export function SimpulEmpty({
  title, hint, action, tone = "brand", className,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  tone?: "brand" | "ai";
  className?: string;
}) {
  return (
    <div className={"h-full w-full grid place-items-center p-8 " + (className || "")}>
      <div className="flex flex-col items-center text-center max-w-sm">
        <ThreadArt tone={tone} />
        <h2 className="mt-6 font-display text-[22px] font-extrabold tracking-tight text-foreground">{title}</h2>
        {hint && <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{hint}</p>}
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}

export default SimpulEmpty;
