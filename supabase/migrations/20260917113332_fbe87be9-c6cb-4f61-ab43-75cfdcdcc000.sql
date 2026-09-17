CREATE TABLE public.waitlist_leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  markets text NOT NULL,
  motion text NOT NULL,
  company text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX waitlist_leads_email_key ON public.waitlist_leads (email);
GRANT INSERT ON public.waitlist_leads TO anon;
GRANT SELECT ON public.waitlist_leads TO authenticated;
GRANT ALL ON public.waitlist_leads TO service_role;
ALTER TABLE public.waitlist_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can join the waitlist" ON public.waitlist_leads FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Signed-in users can view waitlist" ON public.waitlist_leads FOR SELECT TO authenticated USING (true);