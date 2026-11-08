-- Fix 1: Allow users to read their own contact_messages submissions
CREATE POLICY "Users can read their own contact messages"
ON public.contact_messages
FOR SELECT
TO authenticated
USING (user_id IS NOT NULL AND user_id = auth.uid());

-- Fix 2: Restore SECURITY DEFINER on has_role to prevent inlining/role-resolution issues in RLS
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Lock down execution: only authenticated callers (used by RLS policies) may execute.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;