-- Drop the overly-permissive prefix-based policies
DROP POLICY IF EXISTS "App can read workspace sync records"   ON public.flipscan_store;
DROP POLICY IF EXISTS "App can create workspace sync records" ON public.flipscan_store;
DROP POLICY IF EXISTS "App can update workspace sync records" ON public.flipscan_store;

-- Authenticated-only, owner-scoped (user_id is TEXT, store auth.uid()::text)
CREATE POLICY "Users view own sync records"
  ON public.flipscan_store FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users insert own sync records"
  ON public.flipscan_store FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users update own sync records"
  ON public.flipscan_store FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users delete own sync records"
  ON public.flipscan_store FOR DELETE TO authenticated
  USING (user_id = auth.uid()::text);

-- Revoke anon access entirely
REVOKE ALL ON public.flipscan_store FROM anon;