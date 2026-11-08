
CREATE TABLE public.rate_limits (
  bucket TEXT NOT NULL,
  identifier TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, identifier)
);

GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (via SECURITY DEFINER function) touches this table.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket TEXT,
  _identifier TEXT,
  _max INTEGER,
  _window_seconds INTEGER
)
RETURNS TABLE(allowed BOOLEAN, remaining INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.rate_limits%ROWTYPE;
  win_start TIMESTAMPTZ;
BEGIN
  INSERT INTO public.rate_limits AS rl (bucket, identifier, count, window_start, updated_at)
  VALUES (_bucket, _identifier, 1, now(), now())
  ON CONFLICT (bucket, identifier) DO UPDATE
    SET count = CASE
          WHEN rl.window_start < now() - make_interval(secs => _window_seconds) THEN 1
          ELSE rl.count + 1
        END,
        window_start = CASE
          WHEN rl.window_start < now() - make_interval(secs => _window_seconds) THEN now()
          ELSE rl.window_start
        END,
        updated_at = now()
  RETURNING * INTO rec;

  win_start := rec.window_start;
  allowed := rec.count <= _max;
  remaining := GREATEST(_max - rec.count, 0);
  reset_at := win_start + make_interval(secs => _window_seconds);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

CREATE INDEX rate_limits_updated_at_idx ON public.rate_limits (updated_at);
