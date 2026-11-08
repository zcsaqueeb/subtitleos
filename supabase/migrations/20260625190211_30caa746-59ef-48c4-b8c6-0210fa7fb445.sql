
-- Studio: custom glossaries (term -> translation pairs) scoped to a user.
CREATE TABLE public.glossaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT,
  entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.glossaries TO authenticated;
GRANT ALL ON public.glossaries TO service_role;

ALTER TABLE public.glossaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Glossaries: owner can read" ON public.glossaries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Glossaries: owner can insert" ON public.glossaries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Glossaries: owner can update" ON public.glossaries
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Glossaries: owner can delete" ON public.glossaries
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX glossaries_user_idx ON public.glossaries(user_id);

CREATE TRIGGER glossaries_set_updated_at
  BEFORE UPDATE ON public.glossaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
