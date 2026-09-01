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
  green: "bg-hl-green",
  amber: "bg-hl-amber",
  red: "bg-hl-red",
  blue: "bg-hl-blue",
  gray: "bg-hl-gray",
};

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

/** Split raw text into sentences, preserving punctuation. */
export function splitSentences(raw: string): string[] {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const matches = normalized.match(/[^.!?…]+[.!?…]+["'”’)]*|[^.!?…]+$/g);
  return (matches ?? []).map((s) => s.trim()).filter(Boolean);
}
