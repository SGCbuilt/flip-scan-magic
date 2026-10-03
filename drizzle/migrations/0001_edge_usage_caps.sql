CREATE TABLE public.edge_usage (
  user_key text NOT NULL,
  fn text NOT NULL,
  day date NOT NULL DEFAULT current_date,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_key, fn, day)
);
GRANT ALL ON public.edge_usage TO service_role;
ALTER TABLE public.edge_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_edge_quota(_user_key text, _fn text, _limit integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE c integer;
BEGIN
  INSERT INTO public.edge_usage (user_key, fn, day, count)
  VALUES (_user_key, _fn, current_date, 1)
  ON CONFLICT (user_key, fn, day) DO UPDATE SET count = edge_usage.count + 1, updated_at = now()
  RETURNING count INTO c;
  RETURN c <= _limit;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_edge_quota(text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_edge_quota(text, text, integer) TO service_role;