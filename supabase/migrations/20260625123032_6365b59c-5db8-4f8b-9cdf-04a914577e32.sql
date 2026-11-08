
-- 1) Make has_role SECURITY DEFINER so RLS on user_roles can't be used to bypass it
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 2) Prevent duplicate role grants
DO $$ BEGIN
  ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- 3) Defense-in-depth: restrictive policy blocking non-admin INSERTs (even via future permissive policies)
DROP POLICY IF EXISTS "Block non-admin role inserts" ON public.user_roles;
CREATE POLICY "Block non-admin role inserts"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) rate_limits: keep fail-closed for clients. Explicitly revoke any client grants.
REVOKE ALL ON public.rate_limits FROM anon, authenticated;
GRANT ALL ON public.rate_limits TO service_role;
