import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const key = Deno.env.get('LOVABLE_API_KEY')
    if (!key) return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

    const ct = req.headers.get('content-type') || ''
    let audioB64 = ''
    let mime = 'audio/webm'
    if (ct.includes('application/json')) {
      const body = await req.json()
      audioB64 = body.audio || ''
      mime = body.mime || 'audio/webm'
    } else {
      return new Response(JSON.stringify({ error: 'Send JSON { audio, mime }' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!audioB64) return new Response(JSON.stringify({ error: 'audio (base64) required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

    // Decode base64 into a Blob
    const bin = Uint8Array.from(atob(audioB64), c => c.charCodeAt(0))
    if (bin.length < 512) return new Response(JSON.stringify({ error: 'Recording too short' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
    const extMap: Record<string, string> = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' }
    const ext = extMap[mime.split(';')[0]] || 'webm'
    const blob = new Blob([bin], { type: mime })

    const fd = new FormData()
    fd.append('model', 'openai/gpt-4o-mini-transcribe')
    fd.append('file', blob, `note.${ext}`)

    const res = await fetch('https://ai.gateway.lovable.dev/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: fd,
    })
    if (!res.ok) {
      const detail = await res.text()
      if (res.status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted. Add credits in workspace settings.' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
      if (res.status === 429) return new Response(JSON.stringify({ error: 'Rate limited — try again shortly.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
      return new Response(JSON.stringify({ error: `Transcription failed (${res.status})`, detail }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const data = await res.json()
    return new Response(JSON.stringify({ text: data.text || '' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})