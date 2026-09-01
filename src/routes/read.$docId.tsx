import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { analyzeSegments } from "@/lib/analyze.functions";
import { ThemeToggle } from "@/components/theme-toggle";
import { RatioStrip, emptyCounts } from "@/components/ratio-strip";
import {
  COLORS,
  HIGHLIGHT_CLASS,
  SWATCH_CLASS,
  colorFromAiLabel,
  isColorKey,
  type ColorKey,
} from "@/lib/colors";

type Segment = {
  id: string;
  order_index: number;
  text: string;
  ai_label: string | null;
  user_color: string | null;
};

const getDocument = createServerFn({ method: "GET" })
  .inputValidator((data) => data as { docId: string })
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } },
    );
    const { data: doc, error: docError } = await client
      .from("documents")
      .select("id, title")
      .eq("id", data.docId)
      .maybeSingle();
    if (docError) throw new Error(docError.message);
    if (!doc) return null;
    const { data: segments, error: segError } = await client
      .from("segments")
      .select("id, order_index, text, ai_label, user_color")
      .eq("doc_id", data.docId)
      .order("order_index", { ascending: true });
    if (segError) throw new Error(segError.message);
    return { doc, segments: (segments ?? []) as Segment[] };
  });

function docQueryOptions(docId: string) {
  return queryOptions({
    queryKey: ["document", docId],
    queryFn: () => getDocument({ data: { docId } }),
  });
}

export const Route = createFileRoute("/read/$docId")({
  loader: async ({ params, context }) => {
    const result = await context.queryClient.ensureQueryData(docQueryOptions(params.docId));
    if (!result) throw notFound();
    return result;
  },
  head: (ctx) => {
    const title = (ctx.loaderData as { doc?: { title?: string } } | undefined)?.doc?.title ?? "Reading";
    return {
      meta: [
        { title: `${title} — Chroma Reader` },
        { name: "description", content: `Color-coding "${title}" by mastery in Chroma Reader.` },
        { property: "og:title", content: `${title} — Chroma Reader` },
        { property: "og:description", content: `Color-coding "${title}" by mastery in Chroma Reader.` },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: ReaderPage,
});

type UserColors = Record<string, ColorKey | null>;

function ReaderPage() {
  const { docId } = Route.useParams();
  const { data } = useSuspenseQuery(docQueryOptions(docId));
  const segments = useMemo(() => data?.segments ?? [], [data]);
  const runAnalysis = useServerFn(analyzeSegments);

  const [selected, setSelected] = useState<number>(-1);
  const [barOpen, setBarOpen] = useState(false);
  /** Explicit user choices only. null = deliberately cleared. */
  const [userColors, setUserColors] = useState<UserColors>(() =>
    Object.fromEntries(
      segments.filter((s) => isColorKey(s.user_color)).map((s) => [s.id, s.user_color as ColorKey]),
    ),
  );
  const [aiColors, setAiColors] = useState<Record<string, ColorKey>>(() =>
    Object.fromEntries(
      segments
        .map((s) => [s.id, colorFromAiLabel(s.ai_label)] as const)
        .filter((entry): entry is readonly [string, ColorKey] => entry[1] !== null),
    ),
  );
  const [analyzing, setAnalyzing] = useState(false);
  const undoStack = useRef<Array<{ id: string; color: ColorKey | null }>>([]);
  const bodyRef = useRef<HTMLDivElement>(null);

  const colorOf = useCallback(
    (seg: Segment): ColorKey | null => {
      if (seg.id in userColors) return userColors[seg.id] ?? null;
      return aiColors[seg.id] ?? null;
    },
    [userColors, aiColors],
  );

  useEffect(() => {
    const unlabeled = segments.filter((s) => !s.ai_label && !s.user_color);
    if (unlabeled.length === 0) return;
    let cancelled = false;
    setAnalyzing(true);
    runAnalysis({ data: { segments: unlabeled.map((s) => ({ id: s.id, text: s.text })) } })
      .then((res) => {
        if (cancelled) return;
        if (res.error) toast.error("AI first pass unavailable");
        if (res.labels.length === 0) return;
        setAiColors((prev) => {
          const next = { ...prev };
          for (const { id, label } of res.labels) {
            const color = colorFromAiLabel(label);
            if (color) next[id] = color;
          }
          return next;
        });
        for (const { id, label } of res.labels) {
          // AI only fills blanks: never touches a segment with a user color.
          void supabase.from("segments").update({ ai_label: label }).eq("id", id).is("user_color", null);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("AI first pass failed");
      })
      .finally(() => {
        if (!cancelled) setAnalyzing(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const counts = useMemo(() => {
    const c = emptyCounts();
    for (const seg of segments) {
      const color = colorOf(seg);
      if (color) c[color] += 1;
    }
    return c;
  }, [segments, colorOf]);

  const persist = useCallback((id: string, color: ColorKey | null) => {
    supabase
      .from("segments")
      .update({ user_color: color, updated_at: new Date().toISOString() })
      .eq("id", id)
      .then(({ error }) => {
        if (error) toast.error("Could not save color");
      });
  }, []);

  /** Select a sentence and open the floating bar. */
  const select = useCallback((index: number) => {
    setSelected(index);
    setBarOpen(true);
  }, []);

  /** Optimistic write; pressing the same number again clears the color. */
  const assign = useCallback(
    (index: number, color: ColorKey, advance = true) => {
      const seg = segments[index];
      if (!seg) return;
      const current = seg.id in userColors ? userColors[seg.id] ?? null : null;
      const next: ColorKey | null = current === color ? null : color;

      undoStack.current.push({ id: seg.id, color: current });
      setUserColors((prev) => ({ ...prev, [seg.id]: next }));
      if (advance && next !== null) setSelected(Math.min(index + 1, segments.length - 1));
      persist(seg.id, next);
    },
    [segments, userColors, persist],
  );

  /** Clear a sentence back to unmarked. */
  const clearColor = useCallback(
    (index: number) => {
      const seg = segments[index];
      if (!seg) return;
      const current = seg.id in userColors ? userColors[seg.id] ?? null : null;
      if (current === null) return;
      undoStack.current.push({ id: seg.id, color: current });
      setUserColors((prev) => ({ ...prev, [seg.id]: null }));
      persist(seg.id, null);
    },
    [segments, userColors, persist],
  );

  const undo = useCallback(() => {
    const last = undoStack.current.pop();
    if (!last) return;
    setUserColors((prev) => ({ ...prev, [last.id]: last.color }));
    persist(last.id, last.color);
    const idx = segments.findIndex((s) => s.id === last.id);
    if (idx >= 0) setSelected(idx);
  }, [segments, persist]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setBarOpen(false);
        setSelected(-1);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const match = COLORS.find((c) => c.shortcut === e.key);
      if (match && selected >= 0) {
        e.preventDefault();
        assign(selected, match.key);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        setBarOpen(true);
        setSelected((s) => Math.min(s + 1, segments.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setBarOpen(true);
        setSelected((s) => Math.max(s - 1, 0));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, segments.length, assign, undo]);

  // Clicking outside any sentence (and outside the bar) closes the bar.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-sentence]") || target.closest("[data-color-bar]")) return;
      setBarOpen(false);
      setSelected(-1);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (selected < 0) return;
    bodyRef.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selected]);

  const total = segments.length;

  return (
    <div className="min-h-screen">
      <Toolbar />

      {/* Fixed left progress sidebar — stays visible while scrolling */}
      <aside
        className="no-print fixed left-0 top-0 z-10 hidden h-screen w-40 flex-col border-r border-border bg-background pt-14 md:flex lg:w-52"
        aria-label="Document review progress"
      >
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 lg:p-5">
          <div>
            <h2 className="mb-3 font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Progress
            </h2>
            <RatioStrip counts={counts} total={total} />
            <div className="mt-3 flex flex-col gap-2 font-sans text-xs text-muted-foreground">
              {COLORS.map((c) => (
                <span key={c.key} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className={`inline-block size-2 rounded-[2px] ${SWATCH_CLASS[c.key]}`} />
                    {c.label}
                  </span>
                  <span className="font-medium text-foreground">
                    {total ? Math.round((counts[c.key] / total) * 100) : 0}%
                  </span>
                </span>
              ))}
            </div>
          </div>
          <Link
            to="/session/$docId"
            params={{ docId }}
            className="mt-auto font-sans text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Session history
          </Link>
        </div>
      </aside>

      {/* Mobile top progress strip */}
      <div className="no-print mx-auto max-w-[680px] px-6 pt-20 md:hidden">
        <section className="mb-4" aria-label="Document review progress">
          <RatioStrip counts={counts} total={total} />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-sans text-xs text-muted-foreground">
            {COLORS.map((c) => (
              <span key={c.key} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className={`inline-block size-2 rounded-[2px] ${SWATCH_CLASS[c.key]}`} />
                {c.label} {total ? Math.round((counts[c.key] / total) * 100) : 0}%
              </span>
            ))}
            <Link
              to="/session/$docId"
              params={{ docId }}
              className="ml-auto underline underline-offset-2 hover:text-foreground"
            >
              Session history
            </Link>
          </div>
        </section>
      </div>

      <main className="mx-auto max-w-[680px] px-6 pb-32 pt-8 md:ml-40 md:mr-0 md:max-w-[580px] md:pt-28 lg:ml-52 lg:max-w-[680px]">
        <h1 className="mb-4 font-serif text-3xl font-semibold tracking-tight">
          {data?.doc.title ?? "Untitled"}
        </h1>

        <p className="no-print mb-3 font-sans text-xs uppercase tracking-widest text-muted-foreground">
          Click any sentence, press 1–5 to recolor · same key clears it · ⌘/Ctrl+Z undoes
        </p>
        <div className="no-print mb-10 flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-2 font-sans text-xs text-muted-foreground">
          {analyzing ? (
            <>
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
              <span>Running the AI first pass over your sentences…</span>
            </>
          ) : (
            <span>
              Colors you haven't set yourself are{" "}
              <em className="not-italic font-medium text-foreground">AI suggestions</em> — override them
              freely as you review; your choices always win.
            </span>
          )}
        </div>

        <div ref={bodyRef} className="font-serif text-lg" style={{ lineHeight: 2 }}>
          {segments.map((seg, i) => {
            const color = colorOf(seg);
            const isSelected = i === selected;
            return (
              <span
                key={seg.id}
                data-index={i}
                data-sentence
                onClick={() => select(i)}
                className={[
                  "cursor-pointer rounded-[3px] px-1 py-0.5 transition-colors",
                  color ? HIGHLIGHT_CLASS[color] : "",
                  isSelected ? "outline outline-2 outline-ring" : "",
                ].join(" ")}
              >
                {seg.text}{" "}
              </span>
            );
          })}
        </div>

        {barOpen && selected >= 0 && (
          <FloatingColorBar
            anchor={bodyRef.current?.querySelector(`[data-index="${selected}"]`) ?? null}
            current={(() => {
              const seg = segments[selected];
              return seg ? colorOf(seg) : null;
            })()}
            onPick={(color) => {
              assign(selected, color, false);
              setBarOpen(false);
            }}
            onClear={() => {
              clearColor(selected);
              setBarOpen(false);
            }}
          />
        )}

        <div className="no-print mt-14 flex flex-wrap items-center gap-3 border-t border-border pt-6 font-sans text-xs">
          <button
            onClick={() => window.print()}
            className="rounded-md border border-border px-3 py-1.5 font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            Export PDF
          </button>
          <button
            onClick={async () => {
              const url = window.location.href;
              try {
                await navigator.clipboard.writeText(url);
                toast.success("Shareable link copied");
              } catch {
                toast.error(url);
              }
            }}
            className="rounded-md border border-border px-3 py-1.5 font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            Copy share link
          </button>
          <span className="text-muted-foreground">
            The PDF keeps every highlight color; the link opens this exact colored reading.
          </span>
        </div>
      </main>
    </div>
  );
}

function Toolbar() {
  return (
    <header className="no-print fixed inset-x-0 top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-[680px] items-center justify-between gap-2 px-6 py-2.5">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="font-serif text-sm font-semibold tracking-tight text-foreground hover:opacity-70"
          >
            Chroma Reader
          </Link>
          <Link
            to="/library"
            className="font-sans text-xs text-muted-foreground hover:text-foreground"
          >
            Library
          </Link>
        </div>
        <nav className="flex items-center gap-1 font-sans text-xs">
          {COLORS.map((c) => (
            <span
              key={c.key}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-muted-foreground"
              title={`${c.label} (${c.shortcut})`}
            >
              <span className={`inline-block size-3 rounded-[3px] ${SWATCH_CLASS[c.key]}`} />
              <span className="hidden whitespace-nowrap sm:inline">{c.label}</span>
              <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">
                {c.shortcut}
              </kbd>
            </span>
          ))}
          <ThemeToggle className="ml-1" />
        </nav>
      </div>
    </header>
  );
}

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
