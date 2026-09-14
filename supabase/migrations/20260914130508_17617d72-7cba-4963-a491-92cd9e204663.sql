CREATE TABLE public.auction_scrape_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url text NOT NULL UNIQUE,
  content text NOT NULL,
  fetched_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX auction_scrape_cache_fetched_at_idx ON public.auction_scrape_cache (fetched_at);
GRANT ALL ON public.auction_scrape_cache TO service_role;
ALTER TABLE public.auction_scrape_cache ENABLE ROW LEVEL SECURITY;