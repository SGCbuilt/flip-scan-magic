DROP POLICY IF EXISTS "Signed-in users can view waitlist" ON public.waitlist_leads;
CREATE POLICY "Admins can view waitlist" ON public.waitlist_leads FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

REVOKE SELECT ON public.email_send_state, public.email_send_log, public.suppressed_emails, public.email_unsubscribe_tokens FROM anon, authenticated;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.cron_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  cron_secret text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.cron_config FROM PUBLIC, anon, authenticated;
INSERT INTO private.cron_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verify_cron_secret(_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(length(_token) >= 32 AND EXISTS (
    SELECT 1 FROM private.cron_config WHERE id = 1 AND cron_secret = _token
  ), false)
$$;
REVOKE ALL ON FUNCTION public.verify_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;