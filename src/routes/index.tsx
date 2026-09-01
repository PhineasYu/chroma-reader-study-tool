import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { splitSentences } from "@/lib/colors";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chroma Reader — Import a text" },
      {
        name: "description",
        content:
          "Paste any long text and color-code it by mastery: got it, shaky, don't get it, key idea, skip.",
      },
      { property: "og:title", content: "Chroma Reader — Import a text" },
      {
        property: "og:description",
        content:
          "Paste any long text and color-code it by mastery: got it, shaky, don't get it, key idea, skip.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportPage,
});

function ImportPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const sentenceCount = splitSentences(text).length;

  async function analyze() {
    const sentences = splitSentences(text);
    if (sentences.length === 0) {
      toast.error("Paste some text first.");
      return;
    }
    setSaving(true);
    try {
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .insert({ title: title.trim() || "Untitled", raw_text: text })
        .select("id")
        .single();
      if (docError || !doc) throw docError ?? new Error("Could not save document");

      const rows = sentences.map((s, i) => ({
        doc_id: doc.id,
        order_index: i,
        text: s,
        ai_label: null,
        user_color: null,
      }));
      const { error: segError } = await supabase.from("segments").insert(rows);
      if (segError) throw segError;

      navigate({ to: "/read/$docId", params: { docId: doc.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-[680px] px-6 py-20 font-serif">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Chroma Reader</h1>
        <p className="mt-3 text-muted-foreground">
          Paste a long text, then color-code every sentence by how well you know it.
        </p>
      </header>

      <div className="space-y-6">
        <div>
          <label htmlFor="title" className="mb-2 block font-sans text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Title
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Chapter 4 — Cellular Respiration"
            className="w-full rounded-md border border-input bg-card px-4 py-3 text-lg outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring"
          />
        </div>

        <div>
          <label htmlFor="text" className="mb-2 block font-sans text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Text
          </label>
          <textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your text here…"
            rows={14}
            className="w-full resize-y rounded-md border border-input bg-card px-4 py-3 leading-[1.8] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-ring"
          />
          <p className="mt-2 font-sans text-xs text-muted-foreground">
            {text.trim() ? `${sentenceCount} sentence${sentenceCount === 1 ? "" : "s"} detected` : "Sentences are split automatically."}
          </p>
        </div>

        <button
          onClick={analyze}
          disabled={saving || !text.trim()}
          className="w-full rounded-md bg-primary px-6 py-3.5 font-sans text-sm font-semibold uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Analyzing…" : "Analyze"}
        </button>
      </div>
    </main>
  );
}
