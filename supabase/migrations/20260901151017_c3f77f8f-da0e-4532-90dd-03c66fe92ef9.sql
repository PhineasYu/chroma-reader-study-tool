CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Untitled',
  raw_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO anon;
GRANT ALL ON public.documents TO service_role;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Documents readable by all" ON public.documents FOR SELECT TO anon USING (true);
CREATE POLICY "Documents insertable by all" ON public.documents FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Documents updatable by all" ON public.documents FOR UPDATE TO anon USING (true);

CREATE TABLE public.segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  order_index int NOT NULL,
  text text NOT NULL,
  ai_label text,
  user_color text
);

CREATE INDEX segments_doc_id_idx ON public.segments(doc_id, order_index);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.segments TO anon;
GRANT ALL ON public.segments TO service_role;

ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Segments readable by all" ON public.segments FOR SELECT TO anon USING (true);
CREATE POLICY "Segments insertable by all" ON public.segments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Segments updatable by all" ON public.segments FOR UPDATE TO anon USING (true);