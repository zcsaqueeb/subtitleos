
CREATE TABLE IF NOT EXISTS public.transcription_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_id text NOT NULL,
  file_name text,
  duration_sec numeric,
  chunks integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, file_id)
);

GRANT SELECT, INSERT ON public.transcription_usage TO authenticated;
GRANT ALL ON public.transcription_usage TO service_role;

ALTER TABLE public.transcription_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own transcription usage"
  ON public.transcription_usage FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own transcription usage"
  ON public.transcription_usage FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS transcription_usage_user_created_idx
  ON public.transcription_usage (user_id, created_at DESC);
