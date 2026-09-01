
const SWATCH_TEXT: Record<ColorKey, string> = {
  green: "text-hl-green-strong",
  amber: "text-hl-amber-strong",
  red: "text-hl-red-strong",
  blue: "text-hl-blue-strong",
  gray: "text-hl-gray-strong",
};

const BAR_HEIGHT = 32;
const BAR_GAP = 6;

function FloatingColorBar({
  anchor,
  current,
  onPick,
  onClear,
}: {
  anchor: Element | null;
  current: ColorKey | null;
  onPick: (color: ColorKey) => void;
  onClear: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const coarse = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
    [],
  );

  useEffect(() => {
    if (!anchor) return;
    const rect = anchor.getClientRects()[0];
    if (!rect) return;
    const barWidth = barRef.current?.offsetWidth ?? 200;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    // Clamp horizontally so the bar never leaves the viewport.
    const left = Math.max(
      scrollX + 8,
      Math.min(rect.left + scrollX, scrollX + window.innerWidth - barWidth - 8),
    );
    // Above the first line; flip below when there's no room in the viewport.
    const aboveTop = rect.top + scrollY - BAR_HEIGHT - BAR_GAP;
    const top =
      rect.top - BAR_HEIGHT - BAR_GAP < 8
        ? rect.bottom + scrollY + BAR_GAP
        : aboveTop;
    setPos({ left, top });
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [anchor]);

  return (
    <div
      ref={barRef}
      data-color-bar
      role="toolbar"
      aria-label="Assign color"
      className="absolute z-20 flex items-center gap-1 rounded-[var(--radius)] border-[0.5px] border-border bg-card p-1 shadow-sm transition-opacity duration-100"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        opacity: visible && pos ? 1 : 0,
        height: coarse ? 40 : BAR_HEIGHT,
      }}
    >
      {COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          title={`${c.label} (${c.shortcut})`}
          onClick={() => onPick(c.key)}
          className={[
            "flex items-center justify-center rounded-[4px] font-sans text-[11px] font-semibold",
            HIGHLIGHT_CLASS[c.key],
            SWATCH_TEXT[c.key],
            current === c.key ? "ring-2 ring-ring ring-offset-1 ring-offset-card" : "",
            coarse ? "h-8 w-9" : "h-6 w-[26px]",
          ].join(" ")}
        >
          {c.shortcut}
        </button>
      ))}
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
      <button
        type="button"
        title="Clear color"
        onClick={onClear}
        className={[
          "flex items-center justify-center rounded-[4px] font-sans text-sm text-muted-foreground hover:text-foreground",
          coarse ? "h-8 w-8" : "h-6 w-6",
        ].join(" ")}
      >
        ×
      </button>
    </div>
  );
}
