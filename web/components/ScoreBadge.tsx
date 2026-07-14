import { scoreColor } from "@/lib/utils";

// Lead score as a thin colored ring circle — matches the mobile app's score
// style (_ScoreCircle) so the same lead reads identically on web and mobile.
// The value is rounded to a whole number (like mobile) to fit the circle.
export function ScoreBadge({ score, size = 32 }: { score: number; size?: number }) {
  const col = scoreColor(score);
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center rounded-full font-extrabold tabular-nums leading-none"
      style={{
        width: size,
        height: size,
        border: `1.8px solid ${col}`,
        color: col,
        fontSize: size <= 28 ? 11 : 12,
      }}
      aria-label={`Lead score ${Math.round(score)}`}
    >
      {Math.round(score)}
    </span>
  );
}

export default ScoreBadge;
