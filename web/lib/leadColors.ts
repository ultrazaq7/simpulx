// ============================================================================
// Pipeline stage colors · SINGLE SOURCE OF TRUTH.
//
// Before this file, stage colors were hardcoded as ad-hoc hex maps in several
// components (ChatHeader, DashboardView, StageMenu, ...), so the same stage
// rendered a different color per screen. Everything stage-colored now imports
// from here.
//
// The ramp is an ORDERED categorical set that reads as progress toward a sale,
// and it is deliberately distinct from:
//   - the brand axis (petrol / deep-teal · buttons, nav), and
//   - the AI axis (indigo · Simpuler / automation), and
//   - the lead-heat axis (hot/warm/cold · see interestColor in utils).
// so a pipeline stage never reads as the brand, an AI badge, or a heat chip.
// ============================================================================

// Ordered ramp used both for the known stages below and, by index, for any
// custom stages an org defines (deterministic so a stage keeps its color).
export const STAGE_RAMP = [
  "#7C8AA0", // 0 slate      · unworked / new
  "#2E7CE4", // 1 blue       · reached
  "#0891B2", // 2 cyan       · qualified
  "#7C3AED", // 3 violet     · appointment (kept clear of AI indigo)
  "#F59E0B", // 4 amber      · negotiation
  "#16A34A", // 5 green      · won / purchase
  "#DC2626", // 6 red        · lost
  "#0D9488", // 7 teal       · spare for custom stages
  "#DB2777", // 8 pink       · spare
  "#65A30D", // 9 lime       · spare
];

// Known stage slugs -> a fixed ramp index, so the standard funnel is always the
// same colors regardless of the order an org happens to list them.
const KNOWN: Record<string, number> = {
  new_lead: 0, new: 0, lead: 0, open_lead: 0,
  contacted: 1, reached: 1, engaged: 1,
  qualified: 2, pending_payment: 2, pending: 2,
  appointment: 3, meeting: 3, scheduled: 3, visit: 3,
  negotiation: 4, negotiating: 4, offer: 4, quotation: 4,
  purchase: 5, customer: 5, won: 5, closed_won: 5, paid: 5, deal: 5,
  lost: 6, no_reply: 6, closed_lost: 6, dropped: 6, cancelled: 6, canceled: 6,
};

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

// Deterministic fallback for unknown/custom stage names: hash the slug into the
// "spare" region of the ramp so it is stable and unlikely to collide with the
// standard stages.
function hashIndex(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const spares = [7, 8, 9, 0, 1, 2, 3, 4];
  return spares[Math.abs(h) % spares.length];
}

/** Solid stage color (charts, dots, bars). Hex. */
export function stageColor(name: string | undefined | null): string {
  if (!name) return STAGE_RAMP[0];
  const s = slug(name);
  const idx = s in KNOWN ? KNOWN[s] : hashIndex(s);
  return STAGE_RAMP[idx] ?? STAGE_RAMP[0];
}

/** Is this stage a terminal "lost"-type stage (for muted / negative treatment)? */
export function isLostStage(name: string | undefined | null): boolean {
  if (!name) return false;
  return KNOWN[slug(name)] === 6;
}

/** Is this a terminal "won"/purchase stage? */
export function isWonStage(name: string | undefined | null): boolean {
  if (!name) return false;
  return KNOWN[slug(name)] === 5;
}

/** Chip pair: solid `fg` color + a translucent `bg` tint from the same hue.
 *  Follows the existing `color + "1A"` tint convention used across the app. */
export function stageChip(name: string | undefined | null): { fg: string; bg: string } {
  const fg = stageColor(name);
  return { fg, bg: fg + "1A" };
}
