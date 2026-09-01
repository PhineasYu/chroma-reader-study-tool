import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { ThemeToggle } from "@/components/theme-toggle";
import { RatioStrip } from "@/components/ratio-strip";
import { colorFromAiLabel, isColorKey, type ColorKey } from "@/lib/colors";

type LibraryDoc = {
  id: string;
  title: string;
  created_at: string;
  total: number;
  counts: Record<ColorKey, number>;
};

const listDocuments = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } },
  );
  const { data: docs, error } = await client
    .from("documents")
    .select("id, title, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const ids = (docs ?? []).map((d) => d.id);
  const { data: segs } = ids.length
    ? await client.from("segments").select("doc_id, ai_label, user_color").in("doc_id", ids)
    : { data: [] as Array<{ doc_id: string; ai_label: string | null; user_color: string | null }> };

  const byDoc = new Map<string, { total: number; counts: Record<ColorKey, number> }>();
  for (const id of ids) {
    byDoc.set(id, {
      total: 0,
      counts: { green: 0, amber: 0, red: 0, blue: 0, gray: 0 },
    });
  }
  for (const s of segs ?? []) {
    const entry = byDoc.get(s.doc_id);
    if (!entry) continue;
    entry.total += 1;
    const color = isColorKey(s.user_color) ? s.user_color : colorFromAiLabel(s.ai_label);
    if (color) entry.counts[color] += 1;
  }
  const list = (docs ?? []).map((d) => ({
    ...d,
    total: byDoc.get(d.id)?.total ?? 0,
    counts: byDoc.get(d.id)?.counts ?? { green: 0, amber: 0, red: 0, blue: 0, gray: 0 },
  })) as LibraryDoc[];

  // Weakest material first: highest share of red, then highest red count.
  return list.sort((a, b) => {
    const ra = a.total ? a.counts.red / a.total : 0;
    const rb = b.total ? b.counts.red / b.total : 0;
    if (rb !== ra) return rb - ra;
    if (b.counts.red !== a.counts.red) return b.counts.red - a.counts.red;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
});

const libraryQueryOptions = queryOptions({
  queryKey: ["library"],
  queryFn: () => listDocuments(),
});

export const Route = createFileRoute("/library")({
  loader: ({ context }) => context.queryClient.ensureQueryData(libraryQueryOptions),
  head: () => ({
    meta: [
      { title: "Library — Chroma Reader" },
      {
        name: "description",
        content:
          "Every saved reading, with a color-ratio strip showing how much you've got, what's shaky, and what you don't get yet.",
      },
      { property: "og:title", content: "Library — Chroma Reader" },
      {
        property: "og:description",
        content: "Every saved reading, with a color-ratio strip of your mastery at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const { data: docs } = useSuspenseQuery(libraryQueryOptions);

  return (
    <main className="mx-auto max-w-[680px] px-6 py-16 font-serif">
      <header className="mb-10 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
          <p className="mt-2 font-sans text-sm text-muted-foreground">
            {docs.length} saved reading{docs.length === 1 ? "" : "s"} · sorted by most red first
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            to="/"
            className="rounded-md border border-border px-3 py-1 font-sans text-xs text-muted-foreground hover:text-foreground"
          >
            New
          </Link>
        </div>
      </header>

      {docs.length === 0 ? (
        <p className="font-sans text-sm text-muted-foreground">
          Nothing saved yet. <Link to="/" className="underline">Import a text</Link> to begin.
        </p>
      ) : (
        <ul className="space-y-3">
          {docs.map((doc) => (
            <li key={doc.id}>
              <Link
                to="/read/$docId"
                params={{ docId: doc.id }}
                className="block rounded-lg border border-border bg-card px-5 py-4 transition-colors hover:border-ring"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="truncate text-xl font-semibold tracking-tight">{doc.title}</h2>
                  <span className="shrink-0 font-sans text-xs text-muted-foreground">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </span>
                </div>
                <RatioStrip counts={doc.counts} total={doc.total} className="mt-3" />
                <p className="mt-2 font-sans text-xs text-muted-foreground">
                  {doc.total} sentence{doc.total === 1 ? "" : "s"} ·{" "}
                  {doc.total ? Math.round((doc.counts.green / doc.total) * 100) : 0}% got it ·{" "}
                  {doc.counts.red} still red
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
