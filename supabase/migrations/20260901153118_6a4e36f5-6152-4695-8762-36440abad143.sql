ALTER TABLE public.segments ADD COLUMN IF NOT EXISTS terms text[] NOT NULL DEFAULT '{}';

INSERT INTO public.documents (id, title, raw_text, created_at)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'Why Studying Feels Easier Than It Is',
  'Learning is the durable change in long-term memory that survives a delay. Fluency is not the same as learning, and confusing the two is the most common mistake students make. When you reread a chapter, the text feels familiar, and that familiarity is mistaken for mastery. Retrieval practice reverses this: instead of putting information in, you pull it out. Every act of recall strengthens the path back to the memory. Spacing the practice out over days forces partial forgetting, and relearning something you have partly forgotten is what makes it stick. Interleaving different problem types feels worse in the moment because each switch costs effort. That extra effort is exactly the signal that deeper encoding is happening. Ebbinghaus first charted the forgetting curve in 1885 using nonsense syllables. Highlighting a textbook, by contrast, produces almost no measurable benefit on later tests. A good rule of thumb is to close the book and write down everything you remember before you look again. Difficulty that leads to better retention is called a desirable difficulty.',
  now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.segments (doc_id, order_index, text, ai_label, user_color, terms)
VALUES
 ('11111111-1111-4111-8111-111111111111', 0, 'Learning is the durable change in long-term memory that survives a delay.', 'key', NULL, ARRAY['long-term memory']),
 ('11111111-1111-4111-8111-111111111111', 1, 'Fluency is not the same as learning, and confusing the two is the most common mistake students make.', 'hard', NULL, ARRAY['Fluency']),
 ('11111111-1111-4111-8111-111111111111', 2, 'When you reread a chapter, the text feels familiar, and that familiarity is mistaken for mastery.', 'soft', NULL, ARRAY['familiarity','mastery']),
 ('11111111-1111-4111-8111-111111111111', 3, 'Retrieval practice reverses this: instead of putting information in, you pull it out.', 'key', NULL, ARRAY['Retrieval practice']),
 ('11111111-1111-4111-8111-111111111111', 4, 'Every act of recall strengthens the path back to the memory.', 'soft', NULL, ARRAY['recall']),
 ('11111111-1111-4111-8111-111111111111', 5, 'Spacing the practice out over days forces partial forgetting, and relearning something you have partly forgotten is what makes it stick.', 'hard', NULL, ARRAY['Spacing','forgetting']),
 ('11111111-1111-4111-8111-111111111111', 6, 'Interleaving different problem types feels worse in the moment because each switch costs effort.', 'hard', NULL, ARRAY['Interleaving']),
 ('11111111-1111-4111-8111-111111111111', 7, 'That extra effort is exactly the signal that deeper encoding is happening.', 'soft', NULL, ARRAY['encoding']),
 ('11111111-1111-4111-8111-111111111111', 8, 'Ebbinghaus first charted the forgetting curve in 1885 using nonsense syllables.', 'skip', NULL, ARRAY['Ebbinghaus']),
 ('11111111-1111-4111-8111-111111111111', 9, 'Highlighting a textbook, by contrast, produces almost no measurable benefit on later tests.', 'soft', NULL, ARRAY['Highlighting']),
 ('11111111-1111-4111-8111-111111111111', 10, 'A good rule of thumb is to close the book and write down everything you remember before you look again.', 'soft', NULL, ARRAY['rule of thumb']),
 ('11111111-1111-4111-8111-111111111111', 11, 'Difficulty that leads to better retention is called a desirable difficulty.', 'key', NULL, ARRAY['desirable difficulty'])
ON CONFLICT DO NOTHING;