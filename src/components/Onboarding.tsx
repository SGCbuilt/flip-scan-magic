/**
 * Onboarding — shown on first launch when no API keys are configured
 *
 * Guides the user through the 3 required setup steps:
 *   1. RentCast API key  (required — powers all search + comps)
 *   2. Anthropic key     (optional — AI scoring, deal grade, analysis)
 *   3. Tracerfy key      (optional — skip tracing)
 *
 * Dismissed once RentCast key is saved. Never shown again.
 */
import { useState } from 'react'
import { toast } from '../lib/toast'

const STEPS = [
  {
    key:   'fscan_rentcast',
    title: 'RentCast API Key',
    emoji: '🏠',
    required: true,
    desc:  'Powers Deal Scanner, comp pull, ARV estimates, and all market data. Required for core functionality.',
    docsUrl: 'https://app.rentcast.io/app/api-keys',
    docsLabel: 'Get free key at rentcast.io',
    placeholder: 'Paste your RentCast API key',
  },
  {
    key:   'fscan_anthropic',
    title: 'Anthropic (Claude AI)',
    emoji: '🧠',
    required: false,
    desc:  'Powers GC Deal Grade, AI Motivation Score, Area Intelligence, and Market Analysis. ~$0.003/request.',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'Get key at console.anthropic.com',
    placeholder: 'sk-ant-api03-...',
  },
  {
    key:   'fscan_tracer',
    title: 'Tracerfy Skip Trace',
    emoji: '🔍',
    required: false,
    desc:  'Returns owner name, phone, email, equity, DNC status per property. Pay-per-trace.',
    docsUrl: 'https://tracerfy.com',
    docsLabel: 'Get key at tracerfy.com',
    placeholder: 'tracer_live_...',
  },
]

interface Props {
  onDismiss: () => void
}

export default function Onboarding({ onDismiss }: Props) {
  const [step,    setStep]    = useState(0)
  const [vals,    setVals]    = useState<Record<string, string>>({})
  const [visible, setVisible] = useState<Record<string, boolean>>({})

  const current = STEPS[step]
  const isLast  = step === STEPS.length - 1

  const handleSave = () => {
    const val = (vals[current.key] || '').trim()
    if (current.required && !val) {
      toast.error('RentCast API key is required to use FlipScan Pro')
      return
    }
    if (val) {
      try { localStorage.setItem(current.key, val) } catch {}
      toast.success(`${current.title} saved`)
    }
    if (isLast) {
      onDismiss()
    } else {
      setStep(s => s + 1)
    }
  }

  const handleSkip = () => {
    if (current.required) {
      toast.warning('RentCast key is required — the app won\'t work without it')
      return
    }
    if (isLast) onDismiss()
    else setStep(s => s + 1)
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,36,96,0.85)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center" style={{ background: '#0F2460' }}>
          <div className="text-4xl mb-2">⚡</div>
          <div className="text-xl font-black text-white tracking-tight">Welcome to FlipScan Pro</div>
          <div className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.65)' }}>
            SGC General Contractors · Let's get you set up
          </div>
          {/* Step dots */}
          <div className="flex justify-center gap-2 mt-4">
            {STEPS.map((_, i) => (
              <div key={i} className="rounded-full transition-all"
                style={{
                  width:   i === step ? 20 : 8,
                  height:  8,
                  background: i === step ? 'white' : i < step ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
                }}/>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="text-3xl flex-shrink-0">{current.emoji}</div>
            <div>
              <div className="flex items-center gap-2">
                <div className="font-bold text-base" style={{ color: '#0F2460' }}>{current.title}</div>
                {current.required
                  ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#FEF0ED', color: '#C0341D' }}>Required</span>
                  : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#EEF2FB', color: '#1B3A8C' }}>Optional</span>}
              </div>
              <div className="text-sm mt-1 leading-relaxed" style={{ color: '#64748B' }}>{current.desc}</div>
            </div>
          </div>

          <div className="relative">
            <input
              type={visible[current.key] ? 'text' : 'password'}
              value={vals[current.key] || ''}
              onChange={e => setVals(v => ({ ...v, [current.key]: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder={current.placeholder}
              autoFocus
              className="w-full rounded-xl border px-4 py-3 text-sm font-mono outline-none transition-all"
              style={{ borderColor: '#D1D9E6', background: '#F8FAFC' }}
            />
            <button onClick={() => setVisible(v => ({ ...v, [current.key]: !v[current.key] }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] cursor-pointer bg-transparent border-none"
              style={{ color: '#94A3B8' }}>
              {visible[current.key] ? 'hide' : 'show'}
            </button>
          </div>

          <a href={current.docsUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm font-semibold no-underline"
            style={{ color: '#1B3A8C' }}>
            <span>🔗</span>
            <span>{current.docsLabel} →</span>
          </a>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={handleSave}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
            style={{ background: '#0F2460' }}>
            {isLast ? 'Launch FlipScan Pro →' : `Save & Continue →`}
          </button>
          {!current.required && (
            <button onClick={handleSkip}
              className="px-4 py-3 rounded-xl text-sm font-semibold border-none cursor-pointer"
              style={{ background: '#F1F5F9', color: '#94A3B8' }}>
              Skip
            </button>
          )}
        </div>

        {/* Already have keys note */}
        <div className="px-6 pb-4 text-center text-xs" style={{ color: '#94A3B8' }}>
          Keys can be updated anytime in Settings → API Keys
        </div>
      </div>
    </div>
  )
}
