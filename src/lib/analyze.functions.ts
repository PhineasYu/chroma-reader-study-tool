import { createServerFn } from "@tanstack/react-start";

export type AiLabel = "key" | "hard" | "soft" | "skip";

export type LabelResult = { id: string; label: AiLabel; terms: string[] };

const SYSTEM_PROMPT = `You classify sentences from study material to help a student triage what to focus on. For each sentence return exactly one label:
  "key"   — a core definition, principle, or thesis
  "hard"  — dense, counterintuitive, or a common misconception
  "soft"  — an example, illustration, or restatement
  "skip"  — background, historical aside, or filler

Also return "terms": the 1-2 most content-bearing words in that sentence (key nouns or technical terms), copied verbatim from the sentence.

Return only valid JSON: [{"id":1,"label":"key","terms":["photosynthesis"]}]
No prose, no markdown, no code fences.`;


const BATCH_SIZE = 40;
const VALID: AiLabel[] = ["key", "hard", "soft", "skip"];

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function parseLabels(raw: string): Array<{ id: number; label: string; terms?: unknown }> {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const analyzeSegments = createServerFn({ method: "POST" })
  .inputValidator((data) => data as { segments: Array<{ id: string; text: string }> })
  .handler(async ({ data }): Promise<{ labels: LabelResult[]; error?: string }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { labels: [], error: "AI is not configured." };

    const segments = (data.segments ?? []).filter((s) => s && s.id && s.text);
    if (segments.length === 0) return { labels: [] };

    const batches = chunk(segments, BATCH_SIZE);

    const results = await Promise.all(
      batches.map(async (batch) => {
        const payload = batch.map((s, i) => ({ id: i + 1, text: s.text }));
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-3.6-flash",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: JSON.stringify(payload) },
            ],
          }),
        });

        if (!res.ok) {
          const message = await res.text();
          return { labels: [] as LabelResult[], error: `${res.status}: ${message.slice(0, 300)}` };
        }

        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.message?.content ?? "";
        const labels: LabelResult[] = [];
        for (const item of parseLabels(content)) {
          const seg = batch[Number(item.id) - 1];
          const label = String(item.label).toLowerCase() as AiLabel;
          if (!seg || !VALID.includes(label)) continue;
          const terms = (Array.isArray(item.terms) ? item.terms : [])
            .map((t) => String(t).trim())
            .filter((t) => t.length > 1 && seg.text.toLowerCase().includes(t.toLowerCase()))
            .slice(0, 2);
          labels.push({ id: seg.id, label, terms });
        }

        return { labels, error: undefined as string | undefined };
      }),
    );

    const labels = results.flatMap((r) => r.labels);
    const firstError = results.find((r) => r.error)?.error;
    return firstError ? { labels, error: firstError } : { labels };
  });
