
CREATE POLICY "Admins read contact attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'contact-attachments' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins upload contact attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'contact-attachments' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update contact attachments"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'contact-attachments' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'contact-attachments' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete contact attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'contact-attachments' AND public.has_role(auth.uid(), 'admin'));
