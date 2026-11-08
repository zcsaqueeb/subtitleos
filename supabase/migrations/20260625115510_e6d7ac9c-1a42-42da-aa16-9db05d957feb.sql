
DROP POLICY IF EXISTS "Anyone can submit contact" ON public.contact_messages;
CREATE POLICY "Anyone can submit contact" ON public.contact_messages
  FOR INSERT
  WITH CHECK (
    length(email) <= 320
    AND length(message) >= 10
    AND length(message) <= 2000
    AND (user_id IS NULL OR user_id = auth.uid())
  );

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
