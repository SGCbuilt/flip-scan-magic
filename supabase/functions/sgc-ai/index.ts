// supabase/functions/sgc-ai/index.ts
// SGC INVEST — AI Proxy Edge Function
// Deploy: Supabase Dashboard → Edge Functions → New → "sgc-ai" → Deploy
// Secret: ANTHROPIC_API_KEY = sk-ant-api03-xxxxx

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set in Supabase Edge Function Secrets." }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    const { messages, system, max_tokens = 1500 } = await req.json();
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": ANTHROPIC_API_KEY },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens, system: system ?? "Você é consultor de investimentos especialista no método Barsi.", messages }),
    });
    if (!resp.ok) { const err = await resp.text(); return new Response(JSON.stringify({ error: `Anthropic ${resp.status}: ${err}` }), { status: resp.status, headers: { ...CORS, "Content-Type": "application/json" } }); }
    const data = await resp.json();
    return new Response(JSON.stringify({ text: data.content?.[0]?.text ?? "Sem resposta." }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
