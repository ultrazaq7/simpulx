import { scoreColor } from "@/lib/utils";

// Lead score as a radial progress ring — the arc fills proportionally to the
// 0–100 score so low scores (0, 1) look intentionally empty and high scores
// (92) look nearly complete. Matches the mobile app's _ScoreCircle aesthetic.
export function ScoreBadge({ score, size = 32 }: { score: number; size?: number }) {
  const col = scoreColor(score);
  const r = (size - 4) / 2;          // inner radius (leaving room for stroke)
  const circ = 2 * Math.PI * r;      // full circumference
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const dash = circ * pct;           // filled portion
  const gap = circ - dash;           // unfilled portion
  const fs = size <= 28 ? 10 : size <= 34 ? 11 : 12;

  return (
    <span
      className="shrink-0 inline-flex items-center justify-center relative"
      style={{ width: size, height: size }}
      aria-label={`Lead score ${Math.round(score)}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* Track (background ring) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="text-border"
        />
        {/* Progress arc */}
        {pct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={col}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${gap}`}
          />
        )}
      </svg>
      <span
        className="relative font-extrabold tabular-nums leading-none"
        style={{ color: col, fontSize: fs }}
      >
        {Math.round(score)}
      </span>
    </span>
  );
}

export default ScoreBadge;

