
-- Status enum + column on contact_messages
DO $$ BEGIN
  CREATE TYPE public.contact_status AS ENUM ('new', 'in_progress', 'resolved');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.contact_messages
  ADD COLUMN IF NOT EXISTS status public.contact_status NOT NULL DEFAULT 'new';

-- Replies table
CREATE TABLE IF NOT EXISTS public.contact_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.contact_messages(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  channel text NOT NULL DEFAULT 'note' CHECK (channel IN ('note', 'email')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_replies_message_id_idx
  ON public.contact_replies(message_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_replies TO authenticated;
GRANT ALL ON public.contact_replies TO service_role;

ALTER TABLE public.contact_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view contact replies"
  ON public.contact_replies FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert contact replies"
  ON public.contact_replies FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND author_id = auth.uid());

CREATE POLICY "Admins update contact replies"
  ON public.contact_replies FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete contact replies"
  ON public.contact_replies FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
