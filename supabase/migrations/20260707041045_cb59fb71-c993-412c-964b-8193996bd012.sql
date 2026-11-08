
ALTER TABLE public.dub_lines
  ADD COLUMN IF NOT EXISTS rendered_ms integer,
  ADD COLUMN IF NOT EXISTS stretch_factor numeric,
  ADD COLUMN IF NOT EXISTS trim_ms integer;

CREATE TABLE IF NOT EXISTS public.dub_render_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.dub_projects(id) ON DELETE CASCADE,
  line_id uuid REFERENCES public.dub_lines(id) ON DELETE CASCADE,
  stage text NOT NULL,
  pct integer NOT NULL DEFAULT 0,
  message text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dub_render_progress_project_idx
  ON public.dub_render_progress(project_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dub_render_progress TO authenticated;
GRANT ALL ON public.dub_render_progress TO service_role;

ALTER TABLE public.dub_render_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage own render progress"
ON public.dub_render_progress
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.dub_projects p
  WHERE p.id = dub_render_progress.project_id AND p.user_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.dub_projects p
  WHERE p.id = dub_render_progress.project_id AND p.user_id = auth.uid()
));
