CREATE TABLE public.research_agent_seen (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  watch_id uuid NOT NULL REFERENCES public.auction_watches(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'auction-radar',
  addr_key text NOT NULL,
  address text NOT NULL DEFAULT '',
  score integer NOT NULL DEFAULT 0,
  grade text NOT NULL DEFAULT '',
  auto_added boolean NOT NULL DEFAULT false,
  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (watch_id, addr_key)
);

GRANT SELECT ON public.research_agent_seen TO authenticated;
GRANT ALL ON public.research_agent_seen TO service_role;

ALTER TABLE public.research_agent_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own research agent history"
ON public.research_agent_seen FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.auction_watches w
  WHERE w.id = research_agent_seen.watch_id AND w.user_id = auth.uid()
));

CREATE INDEX idx_research_agent_seen_watch ON public.research_agent_seen (watch_id, addr_key);