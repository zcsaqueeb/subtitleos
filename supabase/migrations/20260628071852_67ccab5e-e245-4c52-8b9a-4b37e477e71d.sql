REVOKE ALL ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.workspace_role_of(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_workspace(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_role_of(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_workspace(uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.workspace_role_of(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_workspace(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';