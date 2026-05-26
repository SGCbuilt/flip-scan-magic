
CREATE TABLE public.portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sym text NOT NULL,
  qty numeric NOT NULL,
  avg_price numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolios TO authenticated;
GRANT ALL ON public.portfolios TO service_role;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own portfolios" ON public.portfolios FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own portfolios" ON public.portfolios FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own portfolios" ON public.portfolios FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own portfolios" ON public.portfolios FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sym text NOT NULL,
  alert_price numeric,
  alert_type text NOT NULL DEFAULT 'below',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlists TO authenticated;
GRANT ALL ON public.watchlists TO service_role;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own watchlists" ON public.watchlists FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own watchlists" ON public.watchlists FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own watchlists" ON public.watchlists FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own watchlists" ON public.watchlists FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.alerts_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sym text NOT NULL,
  message text NOT NULL,
  triggered_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts_log TO authenticated;
GRANT ALL ON public.alerts_log TO service_role;
ALTER TABLE public.alerts_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own alerts" ON public.alerts_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own alerts" ON public.alerts_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own alerts" ON public.alerts_log FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own alerts" ON public.alerts_log FOR DELETE TO authenticated USING (auth.uid() = user_id);
