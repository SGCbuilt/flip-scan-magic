/**
 * GC Deal Grade — Property Intelligence Panel
 *
 * Shows the Grade (A/B/C/D) + full contractor analysis.
 * Embeds into: Lead Radar expanded card, Pipeline drawer, Drive for Dollars result.
 *
 * The feature no platform can copy — because it requires GC expertise
 * encoded into AI, calibrated to your specific market and cost history.
 */
import { useState, useCallback } from 'react'
import { computeDealGrade, DealGradeInput, DealGradeResult, GCRisk } from '../lib/dealGrade'

const fmt$ = (n: number) => '$' + Math.round(n).toLocaleString()

function getAnthropicKey() {
  try { return localStorage.getItem('fscan_anthropic') || '' } catch { return '' }
}

// ── Risk badge ────────────────────────────────────────────────────────────────
function ProbabilityBadge({ p }: { p: GCRisk['probability'] }) {
  const cfg = {
    certain: { label: 'Certain',  bg: '#FEF0ED', color: '#C0341D' },
    likely:  { label: 'Likely',   bg: '#FEF3EA', color: '#C45E1A' },
    possible:{ label: 'Possible', bg: '#FEF7EA', color: '#8A5700' },
  }[p]
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

// ── Grade badge ───────────────────────────────────────────────────────────────
export function GradeBadge({ grade, size = 'md' }: { grade: string; size?: 'sm' | 'md' | 'lg' }) {
  const colors: Record<string, { color: string; bg: string }> = {
    A: { color: '#1A7A4A', bg: '#EDFAF3' },
    B: { color: '#1B3A8C', bg: '#EEF2FB' },
    C: { color: '#C45E1A', bg: '#FEF3EA' },
    D: { color: '#C0341D', bg: '#FEF0ED' },
  }
  const c = colors[grade] || colors.D
  const sz = size === 'sm' ? 'w-7 h-7 text-sm' : size === 'lg' ? 'w-16 h-16 text-3xl' : 'w-10 h-10 text-lg'
  return (
    <div className={`${sz} rounded-xl flex items-center justify-center font-black flex-shrink-0`}
      style={{ background: c.bg, color: c.color, border: `2px solid ${c.color}40` }}>
      {grade}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
interface Props {
  input:      DealGradeInput
  compact?:   boolean   // true = lead card (collapsed by default), false = full drawer
  className?: string
}

export default function DealGradePanel({ input, compact = true, className = '' }: Props) {
  const [result,   setResult]   = useState<DealGradeResult | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [expanded, setExpanded] = useState(!compact)
  const [error,    setError]    = useState<string | null>(null)

  const handleCompute = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (result) { setExpanded(true); return }
    setLoading(true)
    setError(null)
    try {
      const key = getAnthropicKey()
      const r = await computeDealGrade(input, key)
      setResult(r)
      setExpanded(true)
    } catch (err: any) {
      setError(err?.message || 'Grade computation failed')
    }
    setLoading(false)
  }, [input, result])

  // ── Compact trigger button (for lead cards) ────────────────────────────────
  if (!result && !loading && compact) {
    return (
      <button
        onClick={handleCompute}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border-none cursor-pointer text-xs font-bold"
        style={{ background: '#1B3A8C', color: 'white' }}>
        🏗️ GC Grade
      </button>
    )
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={`rounded-2xl border overflow-hidden ${className}`}
        style={{ borderColor: 'var(--sgc-gray-border)' }}>
        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: '#EEF2FB' }}>
            <div className="w-5 h-5 border-2 rounded-full spin"
              style={{ borderColor: '#EEF2FB', borderTopColor: '#1B3A8C' }}/>
          </div>
          <div>
            <div className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>
              GC Deal Grade computing...
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
              Building age risks · Permit signals · Comp confidence · AI analysis
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={`rounded-2xl border p-3 ${className}`}
        style={{ borderColor: '#C0341D30', background: '#FEF0ED' }}>
        <div className="text-xs font-semibold" style={{ color: '#C0341D' }}>⚠ Grade error: {error}</div>
      </div>
    )
  }

  if (!result) return null

  // ── Full result ────────────────────────────────────────────────────────────
  const { grade, gradeColor, gradeBg } = result
  const certainRisks  = result.gcRisks.filter(r => r.probability === 'certain')
  const likelyRisks   = result.gcRisks.filter(r => r.probability === 'likely')
  const possibleRisks = result.gcRisks.filter(r => r.probability === 'possible')

  return (
    <div className={`rounded-2xl border overflow-hidden ${className}`}
      style={{ borderColor: gradeColor + '40' }}
      onClick={e => e.stopPropagation()}>

      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full border-none cursor-pointer text-left"
        style={{ background: gradeColor }}>
        <div className="px-4 py-3 flex items-center gap-3">
          {/* Grade badge */}
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-2xl"
            style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
            {grade}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white leading-tight">{result.headline}</div>
            {result.gcNote && (
              <div className="text-[10px] mt-0.5 text-white/75 leading-tight line-clamp-1">
                🔧 {result.gcNote}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {result.gcRisks.filter(r => r.probability === 'certain').length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.25)', color: 'white' }}>
                {certainRisks.length} certain risk{certainRisks.length !== 1 ? 's' : ''}
              </span>
            )}
            <span className="text-white text-sm">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="bg-white">

          {/* Summary */}
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            <div className="text-xs leading-relaxed" style={{ color: '#374151' }}>
              {result.summary}
            </div>
          </div>

          {/* Key metrics row */}
          <div className="grid grid-cols-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            {[
              {
                l: 'Hidden Risk',
                v: result.totalRiskAdder[0] > 0
                  ? `${fmt$(result.totalRiskAdder[0])}–${fmt$(result.totalRiskAdder[1])}`
                  : 'Low',
                c: result.totalRiskAdder[1] > 20000 ? '#C0341D' : result.totalRiskAdder[1] > 8000 ? '#C45E1A' : '#1A7A4A',
              },
              {
                l: 'Rehab Buffer',
                v: `+${result.adjustedRehabBuffer}%`,
                c: result.adjustedRehabBuffer >= 20 ? '#C0341D' : result.adjustedRehabBuffer >= 15 ? '#C45E1A' : '#1A7A4A',
              },
              {
                l: 'Comp Strength',
                v: result.compConfidence.charAt(0).toUpperCase() + result.compConfidence.slice(1),
                c: result.compConfidence === 'strong' ? '#1A7A4A' : result.compConfidence === 'moderate' ? '#C45E1A' : '#C0341D',
              },
            ].map((m, i) => (
              <div key={m.l} className={`p-3 ${i < 2 ? 'border-r' : ''} text-center`}
                style={{ borderColor: 'var(--sgc-gray-border)' }}>
                <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
                <div className="text-sm font-black" style={{ color: m.c }}>{m.v}</div>
              </div>
            ))}
          </div>

          {/* Recommended action */}
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)', background: gradeBg }}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: gradeColor }}>
              Recommended Action
            </div>
            <div className="text-xs font-semibold" style={{ color: gradeColor }}>
              → {result.recommendedAction}
            </div>
          </div>

          {/* GC Risk flags */}
          {result.gcRisks.length > 0 && (
            <div className="border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="px-4 py-2.5 flex items-center justify-between"
                style={{ background: 'var(--sgc-gray-light)' }}>
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-navy)' }}>
                  🏗️ GC Risk Flags ({result.gcRisks.length})
                </div>
                <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                  Based on {input.yearBuilt ? `${new Date().getFullYear() - input.yearBuilt}yr old construction` : 'building age'}
                </div>
              </div>

              {/* Certain risks */}
              {certainRisks.map((risk, i) => (
                <div key={i} className="px-4 py-3 border-b"
                  style={{ borderColor: '#C0341D15', background: '#FEF0ED10' }}>
                  <div className="flex items-start gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ background: '#C0341D' }}/>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold" style={{ color: '#C0341D' }}>{risk.system}</span>
                        <ProbabilityBadge p={risk.probability} />
                        <span className="text-xs font-semibold" style={{ color: '#374151' }}>{risk.flag}</span>
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{risk.basis}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-bold" style={{ color: '#C0341D' }}>
                        {fmt$(risk.costImpact[0])}–{fmt$(risk.costImpact[1])}
                      </div>
                      <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>cost impact</div>
                    </div>
                  </div>
                  <div className="ml-4 text-[10px] px-2.5 py-1.5 rounded-lg"
                    style={{ background: '#FEF0ED', color: '#8A2020' }}>
                    🔍 {risk.inspectionFocus}
                  </div>
                </div>
              ))}

              {/* Likely risks */}
              {likelyRisks.map((risk, i) => (
                <div key={i} className="px-4 py-3 border-b"
                  style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <div className="flex items-start gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ background: '#C45E1A' }}/>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold" style={{ color: '#C45E1A' }}>{risk.system}</span>
                        <ProbabilityBadge p={risk.probability} />
                        <span className="text-xs" style={{ color: '#374151' }}>{risk.flag}</span>
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{risk.basis}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-bold" style={{ color: '#C45E1A' }}>
                        {fmt$(risk.costImpact[0])}–{fmt$(risk.costImpact[1])}
                      </div>
                    </div>
                  </div>
                  <div className="ml-4 text-[10px] px-2.5 py-1.5 rounded-lg"
                    style={{ background: '#FEF7EA', color: '#8A5700' }}>
                    🔍 {risk.inspectionFocus}
                  </div>
                </div>
              ))}

              {/* Possible risks — collapsed summary */}
              {possibleRisks.length > 0 && (
                <div className="px-4 py-2.5" style={{ background: 'var(--sgc-gray-light)' }}>
                  <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>
                    Possible ({possibleRisks.length}):
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {possibleRisks.map((r, i) => (
                      <span key={i} className="text-[9px] px-2 py-0.5 rounded-full"
                        style={{ background: '#FEF7EA', color: '#8A5700' }}>
                        {r.system}: {r.flag.split(' ').slice(0,4).join(' ')}...
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Permit / signal insights */}
          {result.permitInsights.length > 0 && (
            <div className="border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="px-4 py-2" style={{ background: 'var(--sgc-gray-light)' }}>
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-navy)' }}>
                  Signal-Specific GC Risks
                </div>
              </div>
              {result.permitInsights.slice(0, 4).map((p, i) => (
                <div key={i} className="flex items-start gap-2 px-4 py-2.5 border-b text-xs"
                  style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: p.severity === 'red' ? '#C0341D' : '#C45E1A' }}/>
                  <span style={{ color: '#374151' }}>{p.detail}</span>
                </div>
              ))}
            </div>
          )}

          {/* Inspection checklist */}
          {result.inspectionFocus.length > 0 && (
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)' }}>
                📋 Inspection Priority Checklist
              </div>
              {result.inspectionFocus.map((f, i) => (
                <div key={i} className="flex items-start gap-2 mb-1.5 text-xs">
                  <span className="flex-shrink-0 font-bold" style={{ color: 'var(--sgc-navy)' }}>{i + 1}.</span>
                  <span style={{ color: '#374151' }}>{f}</span>
                </div>
              ))}
            </div>
          )}

          {/* GC Note */}
          {result.gcNote && (
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)', background: gradeBg }}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: gradeColor }}>
                🔧 What a Contractor Sees (Investors Miss This)
              </div>
              <div className="text-xs italic" style={{ color: gradeColor }}>{result.gcNote}</div>
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-2 flex items-center justify-between"
            style={{ background: 'var(--sgc-gray-light)' }}>
            <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>
              GC Deal Grade · Claude Sonnet · Building code risk database · VA/NC market data
              · {new Date(result.computedAt).toLocaleTimeString()}
            </div>
            <div className="text-[9px] font-bold" style={{ color: gradeColor }}>Grade {grade}</div>
          </div>
        </div>
      )}
    </div>
  )
}
