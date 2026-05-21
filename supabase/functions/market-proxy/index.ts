import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
}

const ALLOWED = ["api.census.gov", "api.usa.gov", "api.bls.gov", "geocoding.geo.census.gov"]

function withServerKey(url: URL) {
  if (url.hostname === "api.census.gov" && !url.searchParams.has("key")) {
    const key = Deno.env.get("CENSUS_API_KEY")
    if (key) url.searchParams.set("key", key)
  }

  if (url.hostname === "api.usa.gov" && !url.searchParams.has("API_KEY")) {
    const key = Deno.env.get("FBI_API_KEY")
    if (key) url.searchParams.set("API_KEY", key)
  }

  return url.toString()
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  try {
    const { url, headers = {} } = await req.json()
    if (!url) return new Response(JSON.stringify({ error: "Missing url" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } })
    const target = new URL(url)
    const hostname = target.hostname
    if (!ALLOWED.some(h => hostname === h)) return new Response(JSON.stringify({ error: `Not allowed: ${hostname}` }), { status: 403, headers: { ...CORS, "Content-Type": "application/json" } })
    const response = await fetch(withServerKey(target), { headers: { "Accept": "application/json", ...headers } })
    const text = await response.text()
    let data: any
    try { data = JSON.parse(text) } catch { data = { raw: text } }
    return new Response(JSON.stringify(data), { status: response.status, headers: { ...CORS, "Content-Type": "application/json" } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } })
  }
})
