CREATE TABLE public.property_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address text NOT NULL,
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  zip text NOT NULL DEFAULT '',
  county text NOT NULL DEFAULT '',
  addr_key text NOT NULL,
  notify_email text NOT NULL,
  auction_date date,
  auction_date_label text,
  auction_type text,
  opening_bid numeric,
  source_url text,
  active boolean NOT NULL DEFAULT true,
  notified_at timestamp with time zone,
  last_checked_at timestamp with time zone,
  last_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, addr_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_follows TO authenticated;
GRANT ALL ON public.property_follows TO service_role;

ALTER TABLE public.property_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own property follows" ON public.property_follows
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own property follows" ON public.property_follows
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own property follows" ON public.property_follows
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own property follows" ON public.property_follows
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_property_follows_updated_at
  BEFORE UPDATE ON public.property_follows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX property_follows_active_idx ON public.property_follows (active, state, city);