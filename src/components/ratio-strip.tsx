import { RATIO_ORDER, SWATCH_CLASS, type ColorKey } from "@/lib/colors";

export type ColorCounts = Record<ColorKey, number>;

export function emptyCounts(): ColorCounts {
  return { green: 0, amber: 0, red: 0, blue: 0, gray: 0 };
}

/** Thin horizontal "health bar" showing a document's color distribution. */
export function RatioStrip({
  counts,
  total,
  className = "",
}: {
  counts: ColorCounts;
  total: number;
  className?: string;
}) {
  const colored = RATIO_ORDER.reduce((n, k) => n + counts[k], 0);
  const uncolored = Math.max(total - colored, 0);
  const denom = Math.max(total, 1);
  return (
    <div
      className={`flex h-2 w-full overflow-hidden rounded-full bg-muted ${className}`}
      role="img"
      aria-label={RATIO_ORDER.map((k) => `${k} ${counts[k]}`).join(", ")}
    >
      {RATIO_ORDER.map((key) =>
        counts[key] > 0 ? (
          <span
            key={key}
            className={`${SWATCH_CLASS[key]} transition-[width] duration-300`}
            style={{ width: `${(counts[key] / denom) * 100}%` }}
          />
        ) : null,
      )}
      {uncolored > 0 && <span style={{ width: `${(uncolored / denom) * 100}%` }} />}
    </div>
  );
}
