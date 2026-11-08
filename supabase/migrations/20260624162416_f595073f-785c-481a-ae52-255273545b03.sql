
-- 1) has_role: switch to SECURITY INVOKER. Safe because existing user_roles SELECT
-- policies allow each user to read their own roles, which is all has_role(auth.uid(), ...) needs.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 2) handle_new_user: remove public execute surface. Trigger invocation does not
-- require EXECUTE grants on the function for the inserting role.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- 3) payments: explicit admin-only UPDATE policy (no general user UPDATE).
DROP POLICY IF EXISTS "Admins update payments" ON public.payments;
CREATE POLICY "Admins update payments"
ON public.payments
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) user_roles: explicit admin-only INSERT and DELETE policies. Prevents
-- self-assignment of admin role via the Data API.
DROP POLICY IF EXISTS "Admins insert roles" ON public.user_roles;
CREATE POLICY "Admins insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins delete roles" ON public.user_roles;
CREATE POLICY "Admins delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
