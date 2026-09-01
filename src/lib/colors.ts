export type ColorKey = "green" | "amber" | "red" | "blue" | "gray";

export const COLORS: Array<{
  key: ColorKey;
  label: string;
  shortcut: string;
}> = [
  { key: "green", label: "Got it", shortcut: "1" },
  { key: "amber", label: "Shaky", shortcut: "2" },
  { key: "red", label: "Don't get it", shortcut: "3" },
  { key: "blue", label: "Key idea", shortcut: "4" },
  { key: "gray", label: "Skip", shortcut: "5" },
];

export const HIGHLIGHT_CLASS: Record<ColorKey, string> = {
  green: "bg-hl-green text-hl-ink",
  amber: "bg-hl-amber text-hl-ink",
  red: "bg-hl-red text-hl-ink",
  blue: "bg-hl-blue text-hl-ink",
  gray: "bg-hl-gray text-hl-ink",
};

/** Fixed order used by the Library color-ratio strip. */
export const RATIO_ORDER: ColorKey[] = ["green", "amber", "red", "blue", "gray"];

export const SWATCH_CLASS: Record<ColorKey, string> = {
  green: "bg-hl-green-strong",
  amber: "bg-hl-amber-strong",
  red: "bg-hl-red-strong",
  blue: "bg-hl-blue-strong",
  gray: "bg-hl-gray-strong",
};

export function isColorKey(value: string | null | undefined): value is ColorKey {
  return COLORS.some((c) => c.key === value);
}

/** AI labels map onto the reader's color system. */
export const AI_LABEL_COLOR: Record<string, ColorKey> = {
  key: "blue",
  hard: "red",
  soft: "green",
  skip: "gray",
};

export function colorFromAiLabel(label: string | null | undefined): ColorKey | null {
  if (!label) return null;
  return AI_LABEL_COLOR[label] ?? (isColorKey(label) ? label : null);
}


/** Split raw text into sentences, preserving punctuation. */
export function splitSentences(raw: string): string[] {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const matches = normalized.match(/[^.!?…]+[.!?…]+["'”’)]*|[^.!?…]+$/g);
  return (matches ?? []).map((s) => s.trim()).filter(Boolean);
}
