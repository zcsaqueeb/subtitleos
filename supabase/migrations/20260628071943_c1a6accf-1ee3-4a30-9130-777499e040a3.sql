CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE OR REPLACE FUNCTION private.is_workspace_member(_user uuid, _workspace uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE user_id = _user
      AND workspace_id = _workspace
  );
$$;

CREATE OR REPLACE FUNCTION private.workspace_role_of(_user uuid, _workspace uuid)
RETURNS public.workspace_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.workspace_members
  WHERE user_id = _user
    AND workspace_id = _workspace
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.can_manage_workspace(_user uuid, _workspace uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE user_id = _user
      AND workspace_id = _workspace
      AND role IN ('owner', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION private.is_workspace_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.workspace_role_of(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_manage_workspace(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_workspace_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.workspace_role_of(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_manage_workspace(uuid, uuid) TO authenticated, service_role;

ALTER POLICY "members read workspaces" ON public.workspaces
  USING (private.is_workspace_member(auth.uid(), id));

ALTER POLICY "members read members" ON public.workspace_members
  USING (private.is_workspace_member(auth.uid(), workspace_id));

ALTER POLICY "admins update members" ON public.workspace_members
  USING (private.can_manage_workspace(auth.uid(), workspace_id))
  WITH CHECK (private.can_manage_workspace(auth.uid(), workspace_id));

ALTER POLICY "admins remove members or self leave" ON public.workspace_members
  USING (private.can_manage_workspace(auth.uid(), workspace_id) OR user_id = auth.uid());

ALTER POLICY "admins create invites" ON public.workspace_invites
  WITH CHECK (private.can_manage_workspace(auth.uid(), workspace_id) AND invited_by = auth.uid());

ALTER POLICY "admins read invites" ON public.workspace_invites
  USING (private.can_manage_workspace(auth.uid(), workspace_id) OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', '')));

ALTER POLICY "admins delete invites" ON public.workspace_invites
  USING (private.can_manage_workspace(auth.uid(), workspace_id));

REVOKE ALL ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workspace_role_of(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_manage_workspace(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.workspace_role_of(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_workspace(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';