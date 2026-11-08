ALTER TABLE public.dub_projects
  ADD COLUMN IF NOT EXISTS source_video_path text,
  ADD COLUMN IF NOT EXISTS source_video_name text,
  ADD COLUMN IF NOT EXISTS final_video_url text,
  ADD COLUMN IF NOT EXISTS lipsync_job_id text,
  ADD COLUMN IF NOT EXISTS lipsync_status text;

ALTER TABLE public.dub_characters
  ADD COLUMN IF NOT EXISTS clone_provider text NOT NULL DEFAULT 'elevenlabs';