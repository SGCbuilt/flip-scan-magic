CREATE TABLE public.auction_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Auction watch',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT 'NC',
  county text NOT NULL DEFAULT '',
  zip text NOT NULL DEFAULT '',
  days_ahead integer NOT NULL DEFAULT 90,
  max_price integer NOT NULL DEFAULT 0,
  notify_email text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_run_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auction_watches TO authenticated;
GRANT ALL ON public.auction_watches TO service_role;
ALTER TABLE public.auction_watches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own auction watches" ON public.auction_watches
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own auction watches" ON public.auction_watches
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own auction watches" ON public.auction_watches
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own auction watches" ON public.auction_watches
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_auction_watches_updated_at
  BEFORE UPDATE ON public.auction_watches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.auction_seen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_id uuid NOT NULL REFERENCES public.auction_watches(id) ON DELETE CASCADE,
  addr_key text NOT NULL,
  address text NOT NULL DEFAULT '',
  auction_date date,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (watch_id, addr_key)
);

GRANT SELECT ON public.auction_seen TO authenticated;
GRANT ALL ON public.auction_seen TO service_role;
ALTER TABLE public.auction_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own auction history" ON public.auction_seen
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.auction_watches w WHERE w.id = watch_id AND w.user_id = auth.uid())
  );

CREATE INDEX auction_seen_watch_idx ON public.auction_seen (watch_id);