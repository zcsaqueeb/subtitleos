
CREATE TABLE public.translation_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_lang text NOT NULL,
  target_lang text NOT NULL,
  source_hash text NOT NULL,
  source_text text NOT NULL,
  target_text text NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  hits integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_lang, target_lang, source_hash)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.translation_memory TO authenticated;
GRANT ALL ON public.translation_memory TO service_role;

ALTER TABLE public.translation_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tm_owner_all"
  ON public.translation_memory
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX tm_lookup_idx
  ON public.translation_memory (user_id, source_lang, target_lang, source_hash);

CREATE TRIGGER tm_updated_at
  BEFORE UPDATE ON public.translation_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
