import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { analyzeSegments } from "@/lib/analyze.functions";
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
        for (const { id, label } of res.labels) {
          void supabase.from("segments").update({ ai_label: label }).eq("id", id);
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
        <p className="mb-12 font-sans text-xs uppercase tracking-widest text-muted-foreground">
          Click a sentence, then press 1–5 to mark it.
        </p>
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
                {seg.text}{" "}
              </span>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function Toolbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-[680px] items-center justify-between gap-2 px-6 py-2.5">
        <Link
          to="/"
          className="font-serif text-sm font-semibold tracking-tight text-foreground hover:opacity-70"
        >
          Chroma Reader
        </Link>
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
        </nav>
      </div>
    </header>
  );
}
