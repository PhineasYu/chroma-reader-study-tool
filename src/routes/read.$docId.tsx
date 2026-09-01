import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { analyzeSegments } from "@/lib/analyze.functions";
import { ThemeToggle } from "@/components/theme-toggle";
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
  terms: string[] | null;
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
      .select("id, order_index, text, ai_label, user_color, terms")
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

function effectiveColor(seg: Segment): ColorKey | null {
  if (isColorKey(seg.user_color)) return seg.user_color;
  return colorFromAiLabel(seg.ai_label);
}

function ReaderPage() {
  const { docId } = Route.useParams();
  const { data } = useSuspenseQuery(docQueryOptions(docId));
  const segments = data?.segments ?? [];
  const runAnalysis = useServerFn(analyzeSegments);

  const [selected, setSelected] = useState<number>(-1);
  const [colors, setColors] = useState<Record<string, ColorKey | null>>(() =>
    Object.fromEntries(segments.map((s) => [s.id, effectiveColor(s)])),
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [recall, setRecall] = useState(false);
  const [loadingTerms, setLoadingTerms] = useState(false);
  const [terms, setTerms] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(segments.filter((s) => s.terms?.length).map((s) => [s.id, s.terms ?? []])),
  );
  const userTouched = useRef<Set<string>>(new Set());
  const bodyRef = useRef<HTMLDivElement>(null);

  const unlabeled = segments.filter((s) => !s.ai_label && !s.user_color);

  useEffect(() => {
    if (unlabeled.length === 0) return;
    let cancelled = false;
    setAnalyzing(true);
    runAnalysis({ data: { segments: unlabeled.map((s) => ({ id: s.id, text: s.text })) } })
      .then((res) => {
        if (cancelled) return;
        if (res.error) toast.error("AI first pass unavailable");
        if (res.labels.length === 0) return;
        setColors((prev) => {
          const next = { ...prev };
          for (const { id, label } of res.labels) {
            if (userTouched.current.has(id)) continue;
            const color = colorFromAiLabel(label);
            if (color) next[id] = color;
          }
          return next;
        });
        setTerms((prev) => {
          const next = { ...prev };
          for (const { id, label: _label, terms: t } of res.labels) next[id] = t;
          return next;
        });
        for (const { id, label, terms: t } of res.labels) {
          void supabase.from("segments").update({ ai_label: label, terms: t }).eq("id", id);
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

  const toggleRecall = useCallback(async () => {
    const next = !recall;
    setRecall(next);
    if (!next) return;
    const missing = segments.filter((s) => !terms[s.id]?.length);
    if (missing.length === 0) return;
    setLoadingTerms(true);
    try {
      const res = await runAnalysis({
        data: { segments: missing.map((s) => ({ id: s.id, text: s.text })) },
      });
      if (res.error) toast.error("Could not pick recall terms");
      for (const { id, terms: t } of res.labels) {
        void supabase.from("segments").update({ terms: t }).eq("id", id);
      }
      setTerms((prev) => {
        const merged = { ...prev };
        for (const { id, terms: t } of res.labels) merged[id] = t;
        for (const s of missing) merged[s.id] ??= [];
        return merged;
      });
    } catch {
      toast.error("Could not pick recall terms");
    } finally {
      setLoadingTerms(false);
    }
  }, [recall, segments, terms, runAnalysis]);

  const greenCount = segments.filter((s) => colors[s.id] === "green").length;
  const mastery = segments.length ? Math.round((greenCount / segments.length) * 100) : 0;



  const assign = useCallback(
    (index: number, color: ColorKey) => {
      const seg = segments[index];
      if (!seg) return;
      userTouched.current.add(seg.id);
      setColors((prev) => ({ ...prev, [seg.id]: color }));
      setSelected(Math.min(index + 1, segments.length - 1));

      supabase
        .from("segments")
        .update({ user_color: color })
        .eq("id", seg.id)
        .then(({ error }) => {
          if (error) toast.error("Could not save color");
        });
    },
    [segments],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const match = COLORS.find((c) => c.shortcut === e.key);
      if (match && selected >= 0) {
        e.preventDefault();
        assign(selected, match.key);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, segments.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, segments.length, assign]);

  useEffect(() => {
    if (selected < 0) return;
    bodyRef.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selected]);

  return (
    <div className="min-h-screen">
      <Toolbar />
      <main className="mx-auto max-w-[680px] px-6 pb-32 pt-28">
        <h1 className="mb-4 font-serif text-3xl font-semibold tracking-tight">
          {data?.doc.title ?? "Untitled"}
        </h1>
        <p className="no-print mb-3 font-sans text-xs uppercase tracking-widest text-muted-foreground">
          Click a sentence, then press 1–5 to mark it.
        </p>
        <div className="no-print mb-6 flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-2 font-sans text-xs text-muted-foreground">
          {analyzing ? (
            <>
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
              <span>Running the AI first pass over your sentences…</span>
            </>
          ) : (
            <span>
              Colors you see now are <em className="not-italic font-medium text-foreground">AI suggestions</em> — a rough
              first pass. Override them with 1–5 as you read; your choices always win.
            </span>
          )}
        </div>

        <div className="no-print mb-10 flex flex-wrap items-center gap-4 font-sans text-xs">
          <button
            onClick={() => void toggleRecall()}
            aria-pressed={recall}
            className={[
              "rounded-md border px-3 py-1.5 font-medium uppercase tracking-widest transition-colors",
              recall
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {loadingTerms ? "Preparing recall…" : recall ? "Recall on" : "Recall"}
          </button>
          {recall && (
            <span className="text-muted-foreground">Hold a block to peek at the hidden word.</span>
          )}
          <div className="ml-auto flex min-w-[180px] items-center gap-2">
            <span className="whitespace-nowrap text-muted-foreground">Mastery {mastery}%</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-hl-green-strong transition-all"
                style={{ width: `${mastery}%` }}
              />
            </div>
          </div>
        </div>

        <div
          ref={bodyRef}
          className="font-serif text-lg"
          style={{ lineHeight: 2 }}
        >
          {segments.map((seg, i) => {
            const color = colors[seg.id];
            const isSelected = i === selected;
            return (
              <span
                key={seg.id}
                data-index={i}
                onClick={() => setSelected(i)}
                className={[
                  "cursor-pointer rounded-[3px] px-1 py-0.5 transition-colors",
                  color ? HIGHLIGHT_CLASS[color] : "",
                  isSelected ? "outline outline-2 outline-ring" : "",
                ].join(" ")}
              >
                {recall && color ? (
                  <RecallText text={seg.text} terms={terms[seg.id] ?? []} color={color} />
                ) : (
                  seg.text
                )}{" "}
              </span>
            );
          })}
        </div>

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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function RecallText({
  text,
  terms,
  color,
}: {
  text: string;
  terms: string[];
  color: ColorKey;
}) {
  const clean = terms.filter((t) => t.trim().length > 1);
  if (clean.length === 0) return <>{text}</>;
  const pattern = new RegExp(`(${clean.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) =>
        clean.some((t) => t.toLowerCase() === part.toLowerCase()) ? (
          <RecallBlock key={i} word={part} color={color} />
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function RecallBlock({ word, color }: { word: string; color: ColorKey }) {
  const [revealed, setRevealed] = useState(false);
  const hide = () => setRevealed(false);
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Hidden term — hold to reveal"
      onMouseDown={(e) => {
        e.stopPropagation();
        setRevealed(true);
      }}
      onMouseUp={hide}
      onMouseLeave={hide}
      onTouchStart={(e) => {
        e.stopPropagation();
        setRevealed(true);
      }}
      onTouchEnd={hide}
      onTouchCancel={hide}
      onContextMenu={(e) => e.preventDefault()}
      className={[
        "inline-block cursor-pointer select-none rounded-[3px] align-baseline transition-colors",
        revealed ? "" : SWATCH_CLASS[color],
      ].join(" ")}
      style={revealed ? undefined : undefined}
    >
      {revealed ? word : <span className="invisible">{word}</span>}
    </span>
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
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground"
              title={`${c.label} (${c.shortcut})`}
            >
              <span className={`inline-block size-3 rounded-[3px] ${SWATCH_CLASS[c.key]}`} />
              <span className="hidden sm:inline">{c.label}</span>
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
