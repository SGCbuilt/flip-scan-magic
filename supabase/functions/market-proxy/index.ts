import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
}

const ALLOWED = [
  "api.census.gov",
  "api.usa.gov", 
  "api.bls.gov",
  "geocoding.geo.census.gov",
  // Socrata open-data portals
  "data.norfolk.gov",
  "data.richmondgov.com",
  "data.virginia.gov",
  "data.henrico.us",
  // ArcGIS FeatureServers / MapServers
  "gis.charlottenc.gov",
  "services.arcgis.com",
  "services1.arcgis.com",
  "services2.arcgis.com",
  "services3.arcgis.com",
  "services5.arcgis.com",
  "services6.arcgis.com",
  "services7.arcgis.com",
  "services8.arcgis.com",
  "services9.arcgis.com",
  "gisservices.chathamcountync.gov",
  "webgis2.durhamnc.gov",
  "gisweb.durhamnc.gov",
  "gis.forsyth.cc",
  "geo.forsythco.com",
  "maps.wakegov.com",
  "maps.wake.gov",
  "services.wake.gov",
  "gis.chesterfield.gov",
  "gis.data.vbgov.com",
]

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS })
  }

  try {
    const { url, headers = {} } = await req.json()

    if (!url) {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      })
    }

    // Security: only allow whitelisted government APIs
    let hostname = ""
    try {
      hostname = new URL(url).hostname
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      })
    }

    if (!ALLOWED.some(h => hostname === h)) {
      return new Response(JSON.stringify({ error: `Host not allowed: ${hostname}` }), {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      })
    }

    const response = await fetch(url, {
      headers: { "Accept": "application/json", ...headers },
    })

    const text = await response.text()
    let data: any
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    })
  }
})
