// Simpul signature glyphs — custom marks Lucide doesn't have, used for the
// "Simpul thread" identity (the product name means "knot / node"). Outline,
// currentColor, sized to sit alongside the Lucide icon set (stroke 1.75).
import React from "react";

type GlyphProps = { size?: number; className?: string; strokeWidth?: number };

/** The Simpul knot — two interlocking loops (a woven overhand knot). Brand mark
 *  for empty states, loading and signature moments. */
export function KnotMark({ size = 24, className, strokeWidth = 1.75 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M4.5 14.5c0-4 3.4-7 7.5-7 3.3 0 5.6 2 5.6 4.6 0 1.9-1.5 3.3-3.3 3.3-1.5 0-2.6-1.1-2.6-2.4" />
      <path d="M19.5 9.5c0 4-3.4 7-7.5 7-3.3 0-5.6-2-5.6-4.6 0-1.9 1.5-3.3 3.3-3.3 1.5 0 2.6 1.1 2.6 2.4" />
    </svg>
  );
}

/** A node strung on a thread — the pipeline "knot on a rail" motif. */
export function ThreadNode({ size = 24, className, strokeWidth = 1.75 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M3 12h5" />
      <path d="M16 12h5" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

/** Handoff — a thread that changes hands at a knot (AI <-> human alih tangan). */
export function HandoffMark({ size = 24, className, strokeWidth = 1.75 }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true">
      <path d="M3 8h4.5" strokeDasharray="2 2.4" />
      <path d="M16.5 16H21" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M9.3 9.9 7.5 8M14.7 14.1l1.8 1.9" />
    </svg>
  );
}
