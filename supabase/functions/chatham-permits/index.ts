// Chatham County monthly permit report fetcher.
// Uses Firecrawl to (1) locate the latest monthly report page/file and
// (2) return its text so the client can parse it into flip opportunities.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const FIRECRAWL = 'https://api.firecrawl.dev/v2';

async function fc(path: string, body: unknown) {
  const key = Deno.env.get('FIRECRAWL_API_KEY');
  if (!key) throw new Error('FIRECRAWL_API_KEY not configured');
  const r = await fetch(`${FIRECRAWL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Firecrawl ${path} ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

// Pull the best "report" link out of a Firecrawl scrape result.
function pickReportLink(links: string[] = []): string | null {
  const scored = links
    .filter(u => typeof u === 'string')
    .map(u => {
      const s = u.toLowerCase();
      let score = 0;
      if (/chathamcountync\.gov/.test(s)) score += 3;
      if (/permit/.test(s)) score += 3;
      if (/monthly|report|issued/.test(s)) score += 2;
      if (/\.(pdf|csv|xlsx?|txt)(\?|$)/.test(s)) score += 4;
      // prefer recent year in filename
      const yr = s.match(/20(2[3-9]|3\d)/);
      if (yr) score += parseInt(yr[0].slice(2), 10) - 22;
      return { u, score };
    })
    .filter(x => x.score >= 5)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.u ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // 1. Search for the county's monthly-permit-report landing page.
    const search = await fc('/search', {
      query: 'Chatham County NC central permitting monthly permit report',
      limit: 8,
    });
    const results: any[] = search?.data?.web || search?.data || search?.web || [];
    const landing = results
      .map(r => r.url as string)
      .find(u => /chathamcountync\.gov/i.test(u || '') && /permit/i.test(u || ''));

    // 2. Scrape the landing page to collect links, then pick the newest report file.
    let reportUrl: string | null = null;
    let landingUsed = landing || null;
    if (landing) {
      const scr = await fc('/scrape', { url: landing, formats: ['links', 'markdown'], onlyMainContent: false });
      const links = scr?.data?.links || scr?.links || [];
      reportUrl = pickReportLink(links);
    }

    // 3. Fallback: try the /search result URLs directly for a report-file link.
    if (!reportUrl) {
      reportUrl = pickReportLink(results.map(r => r.url).filter(Boolean));
    }

    if (!reportUrl) {
      return new Response(JSON.stringify({
        error: 'Could not locate a Chatham monthly permit report file.',
        landing: landingUsed,
        hint: 'Open the county page manually and paste the report.',
      }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 4. Scrape the report file itself as markdown/text.
    const doc = await fc('/scrape', { url: reportUrl, formats: ['markdown'], onlyMainContent: false });
    const text = doc?.data?.markdown || doc?.markdown || '';
    if (!text || text.length < 200) {
      return new Response(JSON.stringify({
        error: 'Report file fetched but no readable text extracted.',
        reportUrl,
      }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      reportUrl,
      landing: landingUsed,
      text,
      chars: text.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});