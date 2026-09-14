CREATE POLICY "No client access to scrape cache"
ON public.auction_scrape_cache
FOR SELECT
TO authenticated
USING (false);