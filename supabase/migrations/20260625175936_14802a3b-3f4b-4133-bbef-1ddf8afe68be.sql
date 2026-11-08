
-- Move has_role to a private schema not exposed via PostgREST so signed-in users cannot call it directly
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO postgres, service_role;

-- Drop public.has_role and all dependent policies in cascade
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role) CASCADE;

-- Recreate policies using private.has_role
-- profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- user_roles
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert roles" ON public.user_roles FOR INSERT WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete roles" ON public.user_roles FOR DELETE USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Block non-admin role inserts" ON public.user_roles AS RESTRICTIVE FOR INSERT WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- translations
CREATE POLICY "Admins can view all translations" ON public.translations FOR SELECT USING (private.has_role(auth.uid(), 'admin'::app_role));

-- payments
CREATE POLICY "Admins view all payments" ON public.payments FOR SELECT USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update payments" ON public.payments FOR UPDATE USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- api_keys
CREATE POLICY "Admins view all api keys" ON public.api_keys FOR SELECT USING (private.has_role(auth.uid(), 'admin'::app_role));

-- contact_audit_log
CREATE POLICY "Admins insert contact audit log" ON public.contact_audit_log FOR INSERT WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) AND actor_id = auth.uid());
CREATE POLICY "Admins read contact audit log" ON public.contact_audit_log FOR SELECT USING (private.has_role(auth.uid(), 'admin'::app_role));

-- contact_messages
CREATE POLICY "Admins view contact" ON public.contact_messages FOR SELECT USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update contact" ON public.contact_messages FOR UPDATE USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete contact" ON public.contact_messages FOR DELETE USING (private.has_role(auth.uid(), 'admin'::app_role));

-- contact_replies
CREATE POLICY "Admins view contact replies" ON public.contact_replies FOR SELECT USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert contact replies" ON public.contact_replies FOR INSERT WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) AND author_id = auth.uid());
CREATE POLICY "Admins update contact replies" ON public.contact_replies FOR UPDATE USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete contact replies" ON public.contact_replies FOR DELETE USING (private.has_role(auth.uid(), 'admin'::app_role));

-- app_settings
CREATE POLICY "Admins can insert app settings" ON public.app_settings FOR INSERT WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update app settings" ON public.app_settings FOR UPDATE USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete app settings" ON public.app_settings FOR DELETE USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can read app settings" ON public.app_settings FOR SELECT USING (private.has_role(auth.uid(), 'admin'::app_role));

-- storage.objects (contact-attachments)
CREATE POLICY "Admins read contact attachments" ON storage.objects FOR SELECT USING (bucket_id = 'contact-attachments' AND private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins upload contact attachments" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'contact-attachments' AND private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update contact attachments" ON storage.objects FOR UPDATE USING (bucket_id = 'contact-attachments' AND private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (bucket_id = 'contact-attachments' AND private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete contact attachments" ON storage.objects FOR DELETE USING (bucket_id = 'contact-attachments' AND private.has_role(auth.uid(), 'admin'::app_role));
