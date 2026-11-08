
-- 1) contact-attachments: explicit restrictive deny for anon + authenticated; service role bypasses RLS
DROP POLICY IF EXISTS "contact_attachments_block_client_access" ON storage.objects;
CREATE POLICY "contact_attachments_block_client_access"
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (bucket_id <> 'contact-attachments')
WITH CHECK (bucket_id <> 'contact-attachments');

-- 2) lipsync-temp: same explicit restrictive deny for client roles
DROP POLICY IF EXISTS "lipsync_temp_block_client_access" ON storage.objects;
CREATE POLICY "lipsync_temp_block_client_access"
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (bucket_id <> 'lipsync-temp')
WITH CHECK (bucket_id <> 'lipsync-temp');

-- 3) workspace_members: restrictive policy preventing privilege escalation.
-- Block inserting an 'owner' row if the workspace already has any member.
DROP POLICY IF EXISTS "workspace_members_block_owner_escalation" ON public.workspace_members;
CREATE POLICY "workspace_members_block_owner_escalation"
ON public.workspace_members
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  role <> 'owner'
  OR NOT EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = workspace_members.workspace_id
  )
);
