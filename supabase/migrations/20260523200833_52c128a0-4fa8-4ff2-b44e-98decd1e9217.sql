CREATE TABLE IF NOT EXISTS public.flipscan_store (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  key text NOT NULL,
  data jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT flipscan_store_user_key_unique UNIQUE (user_id, key)
);

ALTER TABLE public.flipscan_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "App can read workspace sync records" ON public.flipscan_store;
DROP POLICY IF EXISTS "App can create workspace sync records" ON public.flipscan_store;
DROP POLICY IF EXISTS "App can update workspace sync records" ON public.flipscan_store;

CREATE POLICY "App can read workspace sync records"
ON public.flipscan_store
FOR SELECT
TO anon, authenticated
USING (user_id LIKE 'sgc-%');

CREATE POLICY "App can create workspace sync records"
ON public.flipscan_store
FOR INSERT
TO anon, authenticated
WITH CHECK (user_id LIKE 'sgc-%');

CREATE POLICY "App can update workspace sync records"
ON public.flipscan_store
FOR UPDATE
TO anon, authenticated
USING (user_id LIKE 'sgc-%')
WITH CHECK (user_id LIKE 'sgc-%');

CREATE INDEX IF NOT EXISTS idx_flipscan_store_user_id ON public.flipscan_store (user_id);
CREATE INDEX IF NOT EXISTS idx_flipscan_store_key ON public.flipscan_store (key);

DROP TRIGGER IF EXISTS update_flipscan_store_updated_at ON public.flipscan_store;
CREATE TRIGGER update_flipscan_store_updated_at
BEFORE UPDATE ON public.flipscan_store
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();