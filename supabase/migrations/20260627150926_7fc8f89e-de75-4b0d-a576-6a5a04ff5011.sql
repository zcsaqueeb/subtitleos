
CREATE TABLE public.transcribe_overrides (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  daily_limit INTEGER,
  monthly_limit INTEGER,
  expires_at TIMESTAMPTZ,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.transcribe_overrides TO authenticated;
GRANT ALL ON public.transcribe_overrides TO service_role;
ALTER TABLE public.transcribe_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all overrides"
  ON public.transcribe_overrides FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "User reads own override"
  ON public.transcribe_overrides FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_transcribe_overrides_updated_at
  BEFORE UPDATE ON public.transcribe_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.transcribe_override_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.transcribe_override_audit TO authenticated;
GRANT ALL ON public.transcribe_override_audit TO service_role;
ALTER TABLE public.transcribe_override_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read override audit"
  ON public.transcribe_override_audit FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_transcribe_override_audit_target
  ON public.transcribe_override_audit (target_user_id, created_at DESC);
CREATE INDEX idx_transcribe_override_audit_created
  ON public.transcribe_override_audit (created_at DESC);
