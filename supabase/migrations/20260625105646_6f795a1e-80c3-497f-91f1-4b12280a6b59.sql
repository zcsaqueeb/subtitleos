-- ============ ENUM ============
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
CREATE TYPE public.translation_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  banned BOOLEAN NOT NULL DEFAULT false,
  hide_email boolean NOT NULL DEFAULT false,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','studio','enterprise')),
  plan_activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role helper
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon, service_role;

-- ============ TRANSLATIONS ============
CREATE TABLE public.translations (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  source_text TEXT NOT NULL,
  translated_text TEXT,
  status public.translation_status NOT NULL DEFAULT 'pending',
  char_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_translations_user_id ON public.translations(user_id);
CREATE INDEX idx_translations_created_at ON public.translations(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.translations TO authenticated;
GRANT ALL ON public.translations TO service_role;
ALTER TABLE public.translations ENABLE ROW LEVEL SECURITY;

-- profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- user_roles policies
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- translations policies
CREATE POLICY "Users can view their own translations" ON public.translations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all translations" ON public.translations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert their own translations" ON public.translations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own translations" ON public.translations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own translations" ON public.translations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- handle_new_user: auto-create profile + default user role; first user becomes admin; zccoffins@gmail.com always becomes admin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count INTEGER;
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  SELECT COUNT(*) INTO user_count FROM public.profiles;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  IF lower(NEW.email) = 'zccoffins@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ PAYMENTS ============
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL,
  amount_usd numeric(10,2) NOT NULL,
  amount_inr numeric(12,2),
  currency text,
  status text NOT NULL DEFAULT 'pending',
  provider text NOT NULL DEFAULT 'coinbase',
  charge_id text UNIQUE,
  hosted_url text,
  payer_name text,
  payer_vpa text,
  utr text,
  note text,
  admin_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own payments" ON public.payments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all payments" ON public.payments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update payments" ON public.payments FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ API KEYS ============
CREATE TABLE public.api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  last_used_at timestamptz,
  usage_count integer NOT NULL DEFAULT 0,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_keys_user_id_idx ON public.api_keys(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own api keys" ON public.api_keys FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own api keys" ON public.api_keys FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own api keys" ON public.api_keys FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own api keys" ON public.api_keys FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all api keys" ON public.api_keys FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ CONTACT MESSAGES + REPLIES + AUDIT LOG ============
CREATE TYPE public.contact_status AS ENUM ('new', 'in_progress', 'resolved');

CREATE TABLE public.contact_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  message text NOT NULL,
  user_id uuid,
  handled boolean NOT NULL DEFAULT false,
  status public.contact_status NOT NULL DEFAULT 'new',
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contact_messages_created_at_idx ON public.contact_messages (created_at DESC);
GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit contact" ON public.contact_messages FOR INSERT TO anon, authenticated WITH CHECK (length(email) <= 320 AND length(message) BETWEEN 10 AND 2000);
CREATE POLICY "Admins view contact" ON public.contact_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update contact" ON public.contact_messages FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete contact" ON public.contact_messages FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.contact_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.contact_messages(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  channel text NOT NULL DEFAULT 'note' CHECK (channel IN ('note', 'email')),
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contact_replies_message_id_idx ON public.contact_replies(message_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_replies TO authenticated;
GRANT ALL ON public.contact_replies TO service_role;
ALTER TABLE public.contact_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view contact replies" ON public.contact_replies FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert contact replies" ON public.contact_replies FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND author_id = auth.uid());
CREATE POLICY "Admins update contact replies" ON public.contact_replies FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete contact replies" ON public.contact_replies FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.contact_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.contact_messages(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contact_audit_log_message_id_idx ON public.contact_audit_log (message_id, created_at DESC);
GRANT SELECT, INSERT ON public.contact_audit_log TO authenticated;
GRANT ALL ON public.contact_audit_log TO service_role;
ALTER TABLE public.contact_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read contact audit log" ON public.contact_audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert contact audit log" ON public.contact_audit_log FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND actor_id = auth.uid());

-- ============ STORAGE RLS (avatars + contact-attachments) ============
CREATE POLICY "Avatars: owner can read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Avatars: owner can insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Avatars: owner can update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Avatars: owner can delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Admins read contact attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'contact-attachments' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins upload contact attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'contact-attachments' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update contact attachments" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'contact-attachments' AND public.has_role(auth.uid(), 'admin')) WITH CHECK (bucket_id = 'contact-attachments' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete contact attachments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'contact-attachments' AND public.has_role(auth.uid(), 'admin'));

-- ============ RATE LIMITS ============
CREATE TABLE public.rate_limits (
  bucket TEXT NOT NULL,
  identifier TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, identifier)
);
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
CREATE INDEX rate_limits_updated_at_idx ON public.rate_limits (updated_at);

CREATE OR REPLACE FUNCTION public.check_rate_limit(_bucket TEXT, _identifier TEXT, _max INTEGER, _window_seconds INTEGER)
RETURNS TABLE(allowed BOOLEAN, remaining INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rec public.rate_limits%ROWTYPE; win_start TIMESTAMPTZ;
BEGIN
  INSERT INTO public.rate_limits AS rl (bucket, identifier, count, window_start, updated_at)
  VALUES (_bucket, _identifier, 1, now(), now())
  ON CONFLICT (bucket, identifier) DO UPDATE
    SET count = CASE WHEN rl.window_start < now() - make_interval(secs => _window_seconds) THEN 1 ELSE rl.count + 1 END,
        window_start = CASE WHEN rl.window_start < now() - make_interval(secs => _window_seconds) THEN now() ELSE rl.window_start END,
        updated_at = now()
  RETURNING * INTO rec;
  win_start := rec.window_start;
  allowed := rec.count <= _max;
  remaining := GREATEST(_max - rec.count, 0);
  reset_at := win_start + make_interval(secs => _window_seconds);
  RETURN NEXT;
END; $$;
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

-- Backfill admin for the designated owner if they already exist.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role FROM auth.users u
WHERE lower(u.email) = 'zccoffins@gmail.com'
ON CONFLICT DO NOTHING;
