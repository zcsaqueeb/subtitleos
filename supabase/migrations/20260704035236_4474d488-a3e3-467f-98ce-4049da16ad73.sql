
-- Multi-character voice dubbing: projects, characters, lines.

CREATE TABLE public.dub_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT,
  style_preset TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | rendering | complete | failed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dub_projects TO authenticated;
GRANT ALL ON public.dub_projects TO service_role;
ALTER TABLE public.dub_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner all dub_projects" ON public.dub_projects
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_dub_projects_updated_at
  BEFORE UPDATE ON public.dub_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.dub_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.dub_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  character_type TEXT NOT NULL DEFAULT 'neutral',
  voice_id TEXT,               -- ElevenLabs voice_id or lovable-tts voice name
  voice_provider TEXT NOT NULL DEFAULT 'elevenlabs', -- elevenlabs | lovable
  locked BOOLEAN NOT NULL DEFAULT false,
  sample_line TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dub_characters TO authenticated;
GRANT ALL ON public.dub_characters TO service_role;
ALTER TABLE public.dub_characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner all dub_characters" ON public.dub_characters
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.dub_projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.dub_projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );
CREATE TRIGGER trg_dub_characters_updated_at
  BEFORE UPDATE ON public.dub_characters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_dub_characters_project ON public.dub_characters(project_id);

CREATE TABLE public.dub_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.dub_projects(id) ON DELETE CASCADE,
  character_id UUID REFERENCES public.dub_characters(id) ON DELETE SET NULL,
  idx INTEGER NOT NULL,
  start_ms INTEGER,
  end_ms INTEGER,
  text TEXT NOT NULL,
  translated_text TEXT,
  emotion TEXT,
  audio_url TEXT,
  locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dub_lines TO authenticated;
GRANT ALL ON public.dub_lines TO service_role;
ALTER TABLE public.dub_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner all dub_lines" ON public.dub_lines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.dub_projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.dub_projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );
CREATE TRIGGER trg_dub_lines_updated_at
  BEFORE UPDATE ON public.dub_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_dub_lines_project ON public.dub_lines(project_id, idx);
CREATE INDEX idx_dub_lines_character ON public.dub_lines(character_id);
