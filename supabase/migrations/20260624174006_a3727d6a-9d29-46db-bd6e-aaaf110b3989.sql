
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hide_email boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Avatars: owner can read" ON storage.objects;
CREATE POLICY "Avatars: owner can read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Avatars: owner can insert" ON storage.objects;
CREATE POLICY "Avatars: owner can insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Avatars: owner can update" ON storage.objects;
CREATE POLICY "Avatars: owner can update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Avatars: owner can delete" ON storage.objects;
CREATE POLICY "Avatars: owner can delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
