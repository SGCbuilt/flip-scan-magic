CREATE TABLE public.auction_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  state text NOT NULL DEFAULT '',
  county text NOT NULL DEFAULT '',
  auction_type text NOT NULL DEFAULT 'Sheriff Sale',
  parser text NOT NULL DEFAULT 'notice_text',
  url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'new',
  last_run_at timestamptz,
  last_ok_at timestamptz,
  last_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (url)
);
GRANT SELECT, INSERT ON public.auction_sources TO authenticated;
GRANT ALL ON public.auction_sources TO service_role;
ALTER TABLE public.auction_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users view sources" ON public.auction_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed-in users add sources" ON public.auction_sources FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND parser = 'notice_text');
CREATE TRIGGER update_auction_sources_updated_at BEFORE UPDATE ON public.auction_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.auction_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  addr_key text NOT NULL UNIQUE,
  address text NOT NULL,
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  zip text NOT NULL DEFAULT '',
  county text NOT NULL DEFAULT '',
  auction_type text NOT NULL DEFAULT 'Foreclosure Auction',
  status text NOT NULL DEFAULT 'scheduled',
  sale_date date,
  opening_bid numeric,
  case_number text,
  plaintiff text,
  defendant text,
  source_id uuid,
  source_url text,
  detail_url text,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  origin text NOT NULL DEFAULT 'collector',
  lat double precision,
  lng double precision,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auction_records_state_county_idx ON public.auction_records (state, county);
CREATE INDEX auction_records_sale_date_idx ON public.auction_records (sale_date);
GRANT SELECT ON public.auction_records TO authenticated;
GRANT ALL ON public.auction_records TO service_role;
ALTER TABLE public.auction_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users view auction records" ON public.auction_records FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_auction_records_updated_at BEFORE UPDATE ON public.auction_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.auction_record_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.auction_records(id) ON DELETE CASCADE,
  event text NOT NULL,
  detail text,
  sale_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auction_record_events_record_idx ON public.auction_record_events (record_id);
GRANT SELECT ON public.auction_record_events TO authenticated;
GRANT ALL ON public.auction_record_events TO service_role;
ALTER TABLE public.auction_record_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users view record history" ON public.auction_record_events FOR SELECT TO authenticated USING (true);

CREATE TABLE public.auction_source_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.auction_sources(id) ON DELETE CASCADE,
  ok boolean NOT NULL DEFAULT false,
  found integer NOT NULL DEFAULT 0,
  added integer NOT NULL DEFAULT 0,
  note text,
  ran_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.auction_source_runs TO authenticated;
GRANT ALL ON public.auction_source_runs TO service_role;
ALTER TABLE public.auction_source_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users view source runs" ON public.auction_source_runs FOR SELECT TO authenticated USING (true);