import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ThemeToggle } from "@/components/theme-toggle";
import { RatioStrip, emptyCounts } from "@/components/ratio-strip";
import { COLORS, RATIO_ORDER, colorFromAiLabel, isColorKey, type ColorKey } from "@/lib/colors";

type DayPoint = { day: string } & Record<ColorKey, number>;

const getSession = createServerFn({ method: "GET" })
  .inputValidator((data) => data as { docId: string })
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } },
    );
    const { data: doc } = await client
      .from("documents")
      .select("id, title")
      .eq("id", data.docId)
      .maybeSingle();
    if (!doc) return null;
    const { data: segs, error } = await client
      .from("segments")
      .select("id, ai_label, user_color, updated_at")
      .eq("doc_id", data.docId);
    if (error) throw new Error(error.message);

    const rows = segs ?? [];
    const days = Array.from(
      new Set(rows.map((s) => String(s.updated_at).slice(0, 10))),
    ).sort();

    // For each edited day, the distribution as of the end of that day:
    // a sentence counts with its color once its last edit is on/before that day.
    const series: DayPoint[] = days.map((day) => {
      const counts = emptyCounts();
      for (const s of rows) {
        if (String(s.updated_at).slice(0, 10) > day) continue;
        const color = isColorKey(s.user_color)
          ? s.user_color
          : colorFromAiLabel(s.ai_label);
        if (color) counts[color] += 1;
      }
      return { day, ...counts };
    });

    const current = emptyCounts();
    for (const s of rows) {
      const color = isColorKey(s.user_color) ? s.user_color : colorFromAiLabel(s.ai_label);
      if (color) current[color] += 1;
    }

    return { doc, total: rows.length, series, current };
  });

function sessionQueryOptions(docId: string) {
  return queryOptions({
    queryKey: ["session", docId],
    queryFn: () => getSession({ data: { docId } }),
  });
}

export const Route = createFileRoute("/session/$docId")({
  loader: async ({ params, context }) => {
    const result = await context.queryClient.ensureQueryData(sessionQueryOptions(params.docId));
    if (!result) throw notFound();
    return result;
  },
  head: (ctx) => {
    const title =
      (ctx.loaderData as { doc?: { title?: string } } | undefined)?.doc?.title ?? "Session";
    return {
      meta: [
        { title: `Session history — ${title} · Chroma Reader` },
        {
          name: "description",
          content: `How your understanding of "${title}" has shifted across review sessions.`,
        },
        { property: "og:title", content: `Session history — ${title}` },
        {
          property: "og:description",
          content: "Watch green grow as you re-review your material in Chroma Reader.",
        },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: SessionPage,
});

const CHART_COLOR: Record<ColorKey, string> = {
  green: "var(--hl-green-strong)",
  amber: "var(--hl-amber-strong)",
  red: "var(--hl-red-strong)",
  blue: "var(--hl-blue-strong)",
  gray: "var(--hl-gray-strong)",
};

function SessionPage() {
  const { docId } = Route.useParams();
  const { data } = useSuspenseQuery(sessionQueryOptions(docId));
  if (!data) return null;

  return (
    <main className="mx-auto max-w-[680px] px-6 py-16 font-serif">
      <header className="mb-8 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-semibold tracking-tight">{data.doc.title}</h1>
          <p className="mt-2 font-sans text-sm text-muted-foreground">
            Session history · {data.series.length} day
            {data.series.length === 1 ? "" : "s"} of edits
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <Link
            to="/read/$docId"
            params={{ docId }}
            className="rounded-md border border-border px-3 py-1 font-sans text-xs text-muted-foreground hover:text-foreground"
          >
            Back to reading
          </Link>
        </div>
      </header>

      <RatioStrip counts={data.current} total={data.total} className="mb-8" />

      {data.series.length < 2 ? (
        <p className="font-sans text-sm text-muted-foreground">
          Only one day of edits so far. Come back after your next review session to see the shape of
          your progress.
        </p>
      ) : (
        <div className="h-72 w-full font-sans text-xs">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.series} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--foreground)",
                  fontSize: 12,
                }}
              />
              {RATIO_ORDER.map((key) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stackId="1"
                  stroke={CHART_COLOR[key]}
                  fill={CHART_COLOR[key]}
                  fillOpacity={0.85}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <ul className="mt-8 flex flex-wrap gap-x-4 gap-y-1 font-sans text-xs text-muted-foreground">
        {COLORS.map((c) => (
          <li key={c.key} className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              className="inline-block size-2 rounded-[2px]"
              style={{ background: CHART_COLOR[c.key] }}
            />
            {c.label}
          </li>
        ))}
      </ul>
    </main>
  );
}
