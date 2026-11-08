-- Roles enum
DO $$ BEGIN
  CREATE TYPE public.workspace_role AS ENUM ('owner','admin','editor','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Workspaces
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Members
CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.workspace_role NOT NULL DEFAULT 'editor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT ALL ON public.workspace_members TO service_role;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Invites
CREATE TABLE public.workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'editor',
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24),'hex'),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invites_email ON public.workspace_invites(lower(email));
CREATE INDEX idx_invites_workspace ON public.workspace_invites(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_invites TO authenticated;
GRANT ALL ON public.workspace_invites TO service_role;
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

-- Helper: membership check (security definer to avoid recursion)
CREATE OR REPLACE FUNCTION public.is_workspace_member(_user UUID, _workspace UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE user_id=_user AND workspace_id=_workspace);
$$;

CREATE OR REPLACE FUNCTION public.workspace_role_of(_user UUID, _workspace UUID)
RETURNS public.workspace_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.workspace_members WHERE user_id=_user AND workspace_id=_workspace LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_workspace(_user UUID, _workspace UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members
    WHERE user_id=_user AND workspace_id=_workspace AND role IN ('owner','admin'));
$$;

-- Workspaces policies
CREATE POLICY "members read workspaces" ON public.workspaces FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), id));
CREATE POLICY "users create own workspaces" ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner updates workspace" ON public.workspaces FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner deletes workspace" ON public.workspaces FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

-- Members policies
CREATE POLICY "members read members" ON public.workspace_members FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "self insert as owner on creation" ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND role = 'owner'
    AND EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.owner_id = auth.uid())
  );
CREATE POLICY "admins update members" ON public.workspace_members FOR UPDATE TO authenticated
  USING (public.can_manage_workspace(auth.uid(), workspace_id))
  WITH CHECK (public.can_manage_workspace(auth.uid(), workspace_id));
CREATE POLICY "admins remove members or self leave" ON public.workspace_members FOR DELETE TO authenticated
  USING (public.can_manage_workspace(auth.uid(), workspace_id) OR user_id = auth.uid());

-- Invites policies
CREATE POLICY "admins read invites" ON public.workspace_invites FOR SELECT TO authenticated
  USING (public.can_manage_workspace(auth.uid(), workspace_id)
    OR lower(email) = lower(coalesce((auth.jwt() ->> 'email'), '')));
CREATE POLICY "admins create invites" ON public.workspace_invites FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace(auth.uid(), workspace_id) AND invited_by = auth.uid());
CREATE POLICY "admins delete invites" ON public.workspace_invites FOR DELETE TO authenticated
  USING (public.can_manage_workspace(auth.uid(), workspace_id));
CREATE POLICY "invitee marks accepted" ON public.workspace_invites FOR UPDATE TO authenticated
  USING (lower(email) = lower(coalesce((auth.jwt() ->> 'email'), '')))
  WITH CHECK (lower(email) = lower(coalesce((auth.jwt() ->> 'email'), '')));

-- updated_at trigger
CREATE TRIGGER trg_workspaces_updated_at BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
