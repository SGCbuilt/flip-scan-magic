/**
 * Lead Radar — Motivated Seller Early Warning System
 * Pulls real public records from VA + NC government APIs
 * Integrated: Skip Tracing (Tracerfy) + CRM Pipeline
 */
import { useState, useCallback, useEffect } from 'react'
import {
  fetchLeadRadar, RADAR_SOURCES,
  Lead, RadarResult, RadarSource, Severity, SignalType
} from '../lib/leadRadar'
import { skipTrace, fetchTracerBalance, SkipTraceResult } from '../lib/skipTrace'
import { computeMotivationScore, MotivationScore } from '../lib/motivationScore'
import { addToPipeline, isInPipeline, getPipeline } from '../lib/pipeline'
import { pullComps, CompResult } from '../lib/compPull'

import DealGradePanel from './DealGrade'
// ─── Helpers ─────────────────────────────────────────────────────────────────
const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; bg: string; dot: string }> = {
  critical: { label: 'Critical',  color: '#C0341D', bg: '#FEF0ED', dot: '#C0341D' },
  high:     { label: 'High',      color: '#8A5700', bg: '#FEF7EA', dot: '#C45E1A' },
  medium:   { label: 'Medium',    color: '#534AB7', bg: '#EEEDFE', dot: '#534AB7' },
  low:      { label: 'Low',       color: 'var(--sgc-gray-mid)', bg: 'var(--sgc-gray-light)', dot: 'var(--sgc-gray-mid)' },
}

const SIGNAL_CONFIG: Record<SignalType, { icon: string; label: string }> = {
  code_violation:  { icon: '🚧', label: 'Code Violation'  },
  building_permit: { icon: '🏗️', label: 'Building Permit' },
  fire_damage:     { icon: '🔥', label: 'Fire Damage'     },
  tax_delinquent:  { icon: '💸', label: 'Tax Delinquent'  },
  probate:         { icon: '⚖️', label: 'Probate'         },
  foreclosure:     { icon: '🏚️', label: 'Foreclosure'     },
  eviction:        { icon: '📄', label: 'Eviction'        },
  vacant:          { icon: '🪟', label: 'Vacant Property' },
}

function ScoreBadge({ score }: { score: number }) {
  const c = score >= 80 ? '#1A7A4A' : score >= 60 ? '#C45E1A' : '#534AB7'
  const bg = score >= 80 ? '#EDFAF3' : score >= 60 ? '#FEF3EA' : '#EEEDFE'
  return (
    <div className="flex items-center justify-center w-10 h-10 rounded-full font-black text-sm flex-shrink-0"
      style={{ background: bg, color: c, border: `2px solid ${c}30` }}>
      {score}
    </div>
  )
}

function SeverityPill({ severity }: { severity: Severity }) {
  const c = SEVERITY_CONFIG[severity]
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: c.bg, color: c.color }}>
      {c.label.toUpperCase()}
    </span>
  )
}

// ─── Lead Card ────────────────────────────────────────────────────────────────
function LeadCard({ lead, onExpand, expanded, tracerKey }: {
  lead: Lead; onExpand: () => void; expanded: boolean; tracerKey: string
}) {
  const sc  = SEVERITY_CONFIG[lead.severity]
  const sig = SIGNAL_CONFIG[lead.signalType]
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(lead.address + ', ' + lead.city + ', ' + lead.state)}`
  const [tracing,  setTracing]  = useState(false)
  const [traceResult, setTrace] = useState<SkipTraceResult | null>(null)
  const [inPipeline, setInPipeline] = useState(() => isInPipeline(lead.id))
  const [motivation,    setMotivation]    = useState<MotivationScore | null>(null)
  const [motivLoading,  setMotivLoading]  = useState(false)
  const [comps,         setComps]         = useState<CompResult | null>(null)
  const [compsLoading,  setCompsLoading]  = useState(false)

  // Auto-pull comps when card is expanded for the first time
  useEffect(() => {
    if (expanded && !comps && !compsLoading) {
      setCompsLoading(true)
      pullComps(lead.address, lead.city, lead.state, lead.zip)
        .then(r => { if (r) setComps(r) })
        .finally(() => setCompsLoading(false))
    }
  }, [expanded])

  const handleSkipTrace = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!tracerKey) { alert('Add your Tracerfy API key in the settings panel to enable skip tracing.'); return }
    setTracing(true)
    const r = await skipTrace(lead.address, lead.city, lead.state, lead.zip, tracerKey)
    setTrace(r)
    setTracing(false)
    // Auto-compute motivation score after trace completes
    if (r?.hit) {
      setMotivLoading(true)
      const m = await computeMotivationScore(lead, r)
      if (m) setMotivation(m)
      setMotivLoading(false)
    }
  }

  const handleMotivationScore = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (motivation) return
    setMotivLoading(true)
    const m = await computeMotivationScore(lead, traceResult)
    if (m) setMotivation(m)
    setMotivLoading(false)
  }

  const handleAddToPipeline = (e: React.MouseEvent) => {
    e.stopPropagation()
    addToPipeline({
      id: lead.id,
      stage: 'new',
      priority: lead.investorScore >= 80 ? 'hot' : lead.investorScore >= 60 ? 'warm' : 'cold',
      address: lead.address, city: lead.city, state: lead.state,
      zip: lead.zip, county: lead.county,
      signalType: lead.signalType, signalLabel: lead.signalLabel,
      investorScore: lead.investorScore, severity: lead.severity, source: lead.source,
      ownerName:   traceResult?.owner?.name   || '',
      phones:      traceResult?.phones        || [],
      emails:      traceResult?.emails        || [],
      mailingAddr: traceResult?.owner?.mailingAddr || '',
      estimatedARV:    traceResult?.property?.estimatedValue || 0,
      estimatedRehab:  0,
      estimatedProfit: 0,
      maxOffer:        0,
      notes: '',
      tags: [lead.signalType, lead.severity],
      assignedTo: 'Albert',
    })
    setInPipeline(true)
  }

  return (
    <div onClick={onExpand} className="bg-white rounded-xl border cursor-pointer hover:shadow-md transition-all overflow-hidden"
      style={{ borderColor: lead.severity === 'critical' || lead.severity === 'high' ? sc.color + '40' : 'var(--sgc-gray-border)' }}>
      {/* Severity stripe */}
      <div className="h-1 w-full" style={{ background: sc.dot }} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-2">
          <ScoreBadge score={lead.investorScore} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-base leading-none">{sig.icon}</span>
              <SeverityPill severity={lead.severity} />
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)' }}>
                {lead.city}, {lead.state}
              </span>
              {lead.filedDate && (
                <span className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                  {new Date(lead.filedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
            <div className="font-bold text-sm leading-tight" style={{ color: 'var(--sgc-black)' }}>
              {lead.address}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
              {lead.signalLabel}
            </div>
          </div>
        </div>

        {/* Description preview */}
        <div className="text-xs mb-2 line-clamp-2 leading-relaxed" style={{ color: 'var(--sgc-gray-mid)' }}>
          {lead.description}
        </div>

        {/* Status pill */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] px-2 py-0.5 rounded-full"
            style={{
              background: lead.status.toLowerCase().includes('open') ? '#FEF0ED' : 'var(--sgc-gray-light)',
              color: lead.status.toLowerCase().includes('open') ? '#C0341D' : 'var(--sgc-gray-mid)',
            }}>
            {lead.status}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
            {expanded ? '▲ less' : '▼ more'}
          </span>
        </div>

        {/* Expanded */}
        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-3" style={{ borderColor: 'var(--sgc-gray-border)' }}>

            {/* ── COMP AUTO-PULL PANEL ── */}
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--sgc-gray-border)' }}>
              {/* Header */}
              <div className="px-3 py-2 flex items-center justify-between"
                style={{ background: comps ? 'var(--sgc-navy)' : 'var(--sgc-gray-light)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">🏠</span>
                  <span className="text-xs font-bold" style={{ color: comps ? 'white' : 'var(--sgc-gray-mid)' }}>
                    Comps & ARV — RentCast Live
                  </span>
                </div>
                {compsLoading && (
                  <div className="w-3.5 h-3.5 border-2 rounded-full spin"
                    style={{ borderColor: 'var(--sgc-gray-border)', borderTopColor: 'var(--sgc-navy)' }}/>
                )}
                {comps && !compsLoading && (
                  <span className="text-[10px] text-white font-semibold">{comps.confidence} confidence</span>
                )}
              </div>

              {compsLoading && (
                <div className="px-3 py-3 text-xs text-center" style={{ color: 'var(--sgc-gray-mid)' }}>
                  Pulling comps from RentCast...
                </div>
              )}

              {!compsLoading && !comps && (
                <div className="px-3 py-3 text-xs text-center" style={{ color: 'var(--sgc-gray-mid)' }}>
                  No comp data available for this address
                </div>
              )}

              {comps && !compsLoading && (
                <div className="p-3 space-y-3">
                  {/* AVM Summary */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-2.5 rounded-xl" style={{ background: '#EEF2FB' }}>
                      <div className="text-[9px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>Est. Value</div>
                      <div className="text-base font-black" style={{ color: 'var(--sgc-navy)' }}>
                        ${Math.round(comps.estimatedValue / 1000)}k
                      </div>
                    </div>
                    <div className="text-center p-2.5 rounded-xl" style={{ background: '#EDFAF3' }}>
                      <div className="text-[9px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>Suggested ARV</div>
                      <div className="text-base font-black" style={{ color: '#1A7A4A' }}>
                        ${Math.round(comps.arvSuggestion / 1000)}k
                      </div>
                    </div>
                    <div className="text-center p-2.5 rounded-xl" style={{ background: '#FEF7EA' }}>
                      <div className="text-[9px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>Range</div>
                      <div className="text-[11px] font-bold" style={{ color: '#8A5700' }}>
                        ${Math.round(comps.priceLow/1000)}k–${Math.round(comps.priceHigh/1000)}k
                      </div>
                    </div>
                  </div>

                  {/* MAO quick calc */}
                  {comps.arvSuggestion > 0 && (
                    <div className="p-2.5 rounded-xl text-xs flex items-center justify-between"
                      style={{ background: 'var(--sgc-navy-pale)' }}>
                      <span style={{ color: 'var(--sgc-navy)' }}>70% Rule Max Offer (no rehab)</span>
                      <span className="font-black text-sm" style={{ color: 'var(--sgc-navy)' }}>
                        ${Math.round(comps.arvSuggestion * 0.70 / 1000)}k
                      </span>
                    </div>
                  )}

                  {/* Comps table */}
                  {comps.comps.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--sgc-gray-mid)' }}>
                        Sold Comps ({comps.comps.length})
                      </div>
                      <div className="space-y-1.5">
                        {comps.comps.slice(0, 5).map((c, i) => (
                          <div key={i} className="flex items-center gap-2 p-2 rounded-lg text-xs"
                            style={{ background: i === 0 ? '#EEF2FB' : 'var(--sgc-gray-light)' }}>
                            {/* Rank */}
                            <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0"
                              style={{ background: i === 0 ? 'var(--sgc-navy)' : 'var(--sgc-gray-border)', color: i === 0 ? 'white' : 'var(--sgc-gray-mid)' }}>
                              {i + 1}
                            </span>
                            {/* Address */}
                            <div className="flex-1 min-w-0">
                              <div className="truncate font-medium" style={{ color: 'var(--sgc-black)' }}>{c.address}</div>
                              <div style={{ color: 'var(--sgc-gray-mid)' }}>
                                {c.beds}bd · {c.baths}ba
                                {c.sqft > 0 && ` · ${c.sqft.toLocaleString()}sf`}
                                {c.soldDate && ` · ${new Date(c.soldDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}`}
                              </div>
                            </div>
                            {/* Price */}
                            <div className="text-right flex-shrink-0">
                              <div className="font-black" style={{ color: 'var(--sgc-navy)' }}>
                                ${Math.round(c.price / 1000)}k
                              </div>
                              {c.pricePerSqft > 0 && (
                                <div style={{ color: 'var(--sgc-gray-mid)' }}>${c.pricePerSqft}/sf</div>
                              )}
                            </div>
                            {/* Distance */}
                            {c.distance > 0 && (
                              <div className="text-[9px] flex-shrink-0" style={{ color: 'var(--sgc-gray-mid)' }}>
                                {c.distance.toFixed(2)}mi
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                    Source: RentCast AVM · {new Date(comps.fetchedAt).toLocaleTimeString()} · Conservative ARV = median of comps − 3%
                  </div>
                </div>
              )}
            </div>

            {/* Map */}
            {lead.lat && lead.lng && (
              <div className="rounded-xl overflow-hidden" style={{ height: 140 }}>
                <iframe
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(lead.address + ', ' + lead.city + ', ' + lead.state)}&output=embed&z=17`}
                  className="w-full h-full border-0" loading="lazy" title="Property location"
                />
              </div>
            )}

            {/* Full details */}
            <div className="space-y-1 text-xs">
              {lead.caseNumber && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--sgc-gray-mid)' }}>Case #</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--sgc-black)' }}>{lead.caseNumber}</span>
                </div>
              )}
              {lead.county && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--sgc-gray-mid)' }}>County</span>
                  <span style={{ color: 'var(--sgc-black)' }}>{lead.county}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span style={{ color: 'var(--sgc-gray-mid)' }}>Investor Score</span>
                <span className="font-bold" style={{ color: '#1A7A4A' }}>{lead.investorScore}/100</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--sgc-gray-mid)' }}>Data Source</span>
                <span style={{ color: 'var(--sgc-black)' }}>{lead.source}</span>
              </div>
            </div>

            {/* Skip trace + pipeline actions */}
            <div className="flex gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
              <button onClick={handleSkipTrace} disabled={tracing || !!traceResult}
                className="text-xs font-bold px-3 py-1.5 rounded-lg border-none cursor-pointer"
                style={{ background: traceResult ? '#EDFAF3' : tracing ? 'var(--sgc-gray-mid)' : 'var(--sgc-navy)', color: traceResult ? '#1A7A4A' : 'white' }}>
                {tracing ? '⟳ Tracing...' : traceResult ? '✓ Traced' : '🔍 Skip Trace'}
              </button>
              <button onClick={handleMotivationScore} disabled={motivLoading || !!motivation}
                className="text-xs font-bold px-3 py-1.5 rounded-lg border-none cursor-pointer"
                style={{ background: motivation ? '#EEEDFE' : motivLoading ? 'var(--sgc-gray-mid)' : '#534AB7', color: motivation ? '#534AB7' : 'white' }}>
                {motivLoading ? '⟳ Scoring...' : motivation ? `🧠 ${motivation.score}` : '🧠 AI Score'}
              </button>
              <DealGradePanel
                compact={true}
                input={{
                  address:       lead.address,
                  city:          lead.city,
                  state:         lead.state,
                  yearBuilt:     traceResult?.property?.yearBuilt || undefined,
                  sqft:          traceResult?.property?.sqft || undefined,
                  beds:          traceResult?.property?.beds || undefined,
                  baths:         traceResult?.property?.baths || undefined,
                  estimatedValue:traceResult?.property?.estimatedValue || undefined,
                  arvSuggestion: comps?.arvSuggestion || undefined,
                  arvPriceLow:   comps?.priceLow || undefined,
                  arvPriceHigh:  comps?.priceHigh || undefined,
                  compsCount:    comps?.comps?.length || undefined,
                  signalType:    lead.signalType,
                  signalLabel:   lead.signalLabel,
                  severity:      lead.severity,
                  description:   lead.description,
                }}
              />
              <button onClick={handleAddToPipeline} disabled={inPipeline}
                className="text-xs font-bold px-3 py-1.5 rounded-lg border-none cursor-pointer"
                style={{ background: inPipeline ? '#EDFAF3' : '#1A7A4A', color: inPipeline ? '#1A7A4A' : 'white' }}>
                {inPipeline ? '✓ In Pipeline' : '+ Pipeline'}
              </button>
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border"
                style={{ color: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)30', background: 'var(--sgc-navy-pale)' }}>
                📍 Maps
              </a>
              <a href={`https://www.zillow.com/homes/${encodeURIComponent(lead.address + ' ' + lead.city + ' ' + lead.state)}`}
                target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border"
                style={{ color: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)30', background: 'var(--sgc-navy-pale)' }}>
                🏠 Zillow
              </a>
            </div>

            {/* Skip trace result */}
            {traceResult && (
              <div className="rounded-xl border p-3" onClick={e => e.stopPropagation()}
                style={{ borderColor: traceResult.hit ? '#1A7A4A40' : 'var(--sgc-gray-border)', background: traceResult.hit ? '#EDFAF3' : 'var(--sgc-gray-light)' }}>
                {traceResult.error ? (
                  <div className="text-xs" style={{ color: '#C0341D' }}>⚠ {traceResult.error}</div>
                ) : !traceResult.hit ? (
                  <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>No contact found in Tracerfy database for this address</div>
                ) : (
                  <>
                    <div className="text-xs font-bold mb-2" style={{ color: '#1A7A4A' }}>✓ Owner Found</div>
                    {traceResult.owner?.name && <div className="font-bold text-sm mb-1" style={{ color: 'var(--sgc-black)' }}>👤 {traceResult.owner.name}</div>}
                    {traceResult.phones.filter(p => !p.litigator).slice(0, 3).map((p, i) => (
                      <div key={i} className="flex items-center gap-2 mb-1">
                        <a href={`tel:${p.number}`} className="text-sm font-mono font-semibold"
                          style={{ color: p.dnc ? '#C0341D' : 'var(--sgc-navy)' }}
                          onClick={e => { e.stopPropagation(); if (p.dnc) { e.preventDefault(); alert('DNC — Do Not Call. TCPA violation risk.') } }}>
                          📞 {p.number}
                        </a>
                        <span className="text-[10px] capitalize" style={{ color: 'var(--sgc-gray-mid)' }}>{p.type}</span>
                        {p.dnc && <span className="text-[10px] font-bold" style={{ color: '#C0341D' }}>⛔ DNC</span>}
                      </div>
                    ))}
                    {traceResult.emails.slice(0, 2).map((em, i) => (
                      <a key={i} href={`mailto:${em.address}`} className="block text-sm mb-1"
                        style={{ color: 'var(--sgc-navy)' }} onClick={e => e.stopPropagation()}>
                        ✉️ {em.address}
                      </a>
                    ))}
                    {traceResult.property && (traceResult.property.estimatedValue || 0) > 0 && (
                      <div className="mt-2 pt-2 border-t grid grid-cols-3 gap-2 text-xs" style={{ borderColor: '#1A7A4A30' }}>
                        <div className="text-center"><div className="text-[9px]" style={{ color: '#1A7A4A' }}>Est Value</div><div className="font-bold">${Math.round((traceResult.property.estimatedValue||0)/1000)}k</div></div>
                        <div className="text-center"><div className="text-[9px]" style={{ color: '#1A7A4A' }}>Equity</div><div className="font-bold">{traceResult.property.equityPct?.toFixed(0)||'—'}%</div></div>
                        <div className="text-center"><div className="text-[9px]" style={{ color: '#1A7A4A' }}>Tax</div><div className="font-bold capitalize">{traceResult.property.taxStatus||'—'}</div></div>
                      </div>
                    )}
                    <div className="text-[9px] mt-1.5" style={{ color: '#8A5700' }}>⚠ TCPA: Never call DNC numbers. One-to-one consent required (FTC Jan 2025).</div>
                  </>
                )}
              </div>
            )}

            {/* ── AI Motivation Score Panel ── */}
            {(motivation || motivLoading) && (
              <div className="rounded-xl border overflow-hidden" onClick={e => e.stopPropagation()}
                style={{ borderColor: motivation ? '#534AB740' : 'var(--sgc-gray-border)' }}>

                {/* Header bar */}
                <div className="px-4 py-2.5 flex items-center justify-between"
                  style={{ background: motivation ? '#534AB7' : 'var(--sgc-gray-light)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🧠</span>
                    <span className="text-xs font-bold text-white">AI Motivation Score</span>
                  </div>
                  {motivation && (
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black text-white">{motivation.score}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: motivation.tier === 'critical' ? '#C0341D' : motivation.tier === 'hot' ? '#C45E1A' : motivation.tier === 'warm' ? '#8A5700' : '#666',
                          color: 'white',
                        }}>
                        {motivation.tier.toUpperCase()}
                      </span>
                    </div>
                  )}
                  {motivLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full spin"/>}
                </div>

                {motivation && (
                  <div className="p-4 space-y-3">
                    {/* Primary driver */}
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#534AB7' }}>Primary Motivation Signal</div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--sgc-black)' }}>{motivation.primaryDriver}</div>
                    </div>

                    {/* Explanation */}
                    <div className="text-xs leading-relaxed p-3 rounded-xl" style={{ background: '#EEEDFE', color: '#374151' }}>
                      {motivation.explanation}
                    </div>

                    {/* Urgency + action */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-2.5 rounded-xl" style={{ background: motivation.urgency === 'immediate' ? '#FEF0ED' : motivation.urgency === 'this_week' ? '#FEF7EA' : 'var(--sgc-gray-light)' }}>
                        <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5"
                          style={{ color: motivation.urgency === 'immediate' ? '#C0341D' : motivation.urgency === 'this_week' ? '#8A5700' : 'var(--sgc-gray-mid)' }}>
                          Urgency
                        </div>
                        <div className="text-xs font-bold capitalize" style={{ color: motivation.urgency === 'immediate' ? '#C0341D' : 'var(--sgc-black)' }}>
                          {motivation.urgency === 'immediate' ? '🔥 Call Today' : motivation.urgency === 'this_week' ? '📅 This Week' : motivation.urgency === 'this_month' ? '📆 This Month' : '🧊 Low'}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl" style={{ background: 'var(--sgc-gray-light)' }}>
                        <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>Best Call Time</div>
                        <div className="text-xs font-bold" style={{ color: 'var(--sgc-black)' }}>📞 {motivation.bestCallTime}</div>
                      </div>
                    </div>

                    {/* Recommended action */}
                    <div className="p-3 rounded-xl border-l-4" style={{ background: '#EDFAF3', borderLeftColor: '#1A7A4A' }}>
                      <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: '#1A7A4A' }}>Recommended Action</div>
                      <div className="text-xs" style={{ color: 'var(--sgc-black)' }}>{motivation.recommendedAction}</div>
                    </div>

                    {/* Suggested offer */}
                    {motivation.suggestedOffer && (
                      <div className="p-3 rounded-xl" style={{ background: 'var(--sgc-navy-pale)' }}>
                        <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--sgc-navy)' }}>Suggested Opening Offer</div>
                        <div className="text-xs font-semibold" style={{ color: 'var(--sgc-navy)' }}>{motivation.suggestedOffer}</div>
                      </div>
                    )}

                    {/* Green flags */}
                    {motivation.greenFlags?.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#1A7A4A' }}>✓ Green Flags</div>
                        {motivation.greenFlags.map((f, i) => (
                          <div key={i} className="text-xs mb-0.5" style={{ color: 'var(--sgc-black)' }}>• {f}</div>
                        ))}
                      </div>
                    )}

                    {/* Red flags */}
                    {motivation.redFlags?.length > 0 && (
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#C0341D' }}>⚠ Red Flags</div>
                        {motivation.redFlags.map((f, i) => (
                          <div key={i} className="text-xs mb-0.5" style={{ color: 'var(--sgc-black)' }}>• {f}</div>
                        ))}
                      </div>
                    )}

                    <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                      AI analysis · Claude Sonnet · temperature 0 · {new Date(motivation.computedAt).toLocaleTimeString()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Source Toggle ────────────────────────────────────────────────────────────
function SourceToggle({ source, enabled, onToggle }: { source: RadarSource; enabled: boolean; onToggle: () => void }) {
  const statusDot = source.status === 'loaded' ? '#1A7A4A'
    : source.status === 'loading' ? '#C45E1A'
    : source.status === 'error' ? '#C0341D'
    : 'var(--sgc-gray-border)'

  return (
    <div
      onClick={onToggle}
      className="flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all"
      style={{
        borderColor: enabled ? 'var(--sgc-navy)40' : 'var(--sgc-gray-border)',
        background: enabled ? 'var(--sgc-navy-pale)' : 'white',
        opacity: enabled ? 1 : 0.6,
      }}>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold leading-tight truncate" style={{ color: enabled ? 'var(--sgc-navy)' : 'var(--sgc-gray-mid)' }}>
          {source.name}
        </div>
        <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
          {source.state} · {source.signalTypes.map(t => SIGNAL_CONFIG[t].icon).join(' ')}
          {source.status === 'loaded' && source.count > 0 && ` · ${source.count} leads`}
          {source.status === 'error' && ' · failed'}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full" style={{ background: statusDot }} />
        <div className="w-9 h-5 rounded-full relative transition-all" style={{ background: enabled ? 'var(--sgc-navy)' : 'var(--sgc-gray-border)' }}>
          <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
            style={{ left: enabled ? 'calc(100% - 1.125rem)' : '0.125rem' }} />
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
const DAYS_OPTIONS = [
  { v: 1,  l: '24h'   },
  { v: 7,  l: '7 days' },
  { v: 14, l: '14 days' },
  { v: 30, l: '30 days' },
  { v: 60, l: '60 days' },
  { v: 90, l: '90 days' },
]

export default function LeadRadar() {
  const [enabledSources, setEnabledSources] = useState<Set<string>>(
    new Set(RADAR_SOURCES.filter(s => s.enabled).map(s => s.id))
  )
  const [days,       setDays]       = useState(30)
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState<RadarResult | null>(null)
  const [expandedId, setExpanded]   = useState<string | null>(null)
  const [sources,    setSources]    = useState(RADAR_SOURCES.map(s => ({ ...s })))
  const [progress,   setProgress]   = useState<Record<string, string>>({})
  const [tracerKey,  setTracerKey]  = useState(() => { try { return localStorage.getItem('fscan_tracer') || '' } catch { return '' } })
  const [showTracerSetup, setShowTracerSetup] = useState(false)
  const [draftTracerKey, setDraftTracerKey] = useState('')
  const [tracerBalance, setTracerBalance] = useState<{ credits: number } | null>(null)

  const saveTracerKey = async (key: string) => {
    try { localStorage.setItem('fscan_tracer', key.trim()) } catch {}
    setTracerKey(key.trim())
    setShowTracerSetup(false)
    if (key.trim()) {
      const bal = await fetchTracerBalance(key.trim())
      if (bal) setTracerBalance(bal)
    }
  }

  // Filters
  const [filterState,    setFilterState]    = useState<'all' | 'VA' | 'NC'>('all')
  const [filterSeverity, setFilterSeverity] = useState<'all' | Severity>('all')
  const [filterType,     setFilterType]     = useState<'all' | SignalType>('all')
  const [filterMinScore, setFilterMinScore] = useState(0)
  const [sortBy,         setSortBy]         = useState<'score' | 'date' | 'severity'>('score')
  const [searchText,     setSearchText]     = useState('')

  const toggleSource = (id: string) => {
    setEnabledSources(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleFetch = useCallback(async () => {
    if (!enabledSources.size) return
    setLoading(true)
    setResult(null)
    setProgress({})
    setSources(RADAR_SOURCES.map(s => ({ ...s, status: enabledSources.has(s.id) ? 'loading' : 'idle' as any })))

    const r = await fetchLeadRadar(
      Array.from(enabledSources),
      days,
      (sourceId, status, count) => {
        setSources(prev => prev.map(s =>
          s.id === sourceId ? { ...s, status: status as any, count: count ?? s.count } : s
        ))
        setProgress(prev => ({ ...prev, [sourceId]: status }))
      }
    )

    setResult(r)
    setSources(r.sources)
    setLoading(false)
  }, [enabledSources, days])

  // Filtered + sorted leads
  const displayLeads = (result?.leads || [])
    .filter(l => filterState === 'all' || l.state === filterState)
    .filter(l => filterSeverity === 'all' || l.severity === filterSeverity)
    .filter(l => filterType === 'all' || l.signalType === filterType)
    .filter(l => l.investorScore >= filterMinScore)
    .filter(l => !searchText || l.address.toLowerCase().includes(searchText.toLowerCase()) ||
                 l.description.toLowerCase().includes(searchText.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'score')    return b.investorScore - a.investorScore
      if (sortBy === 'date')     return b.filedDate.localeCompare(a.filedDate)
      if (sortBy === 'severity') {
        const order = { critical: 0, high: 1, medium: 2, low: 3 }
        return order[a.severity] - order[b.severity]
      }
      return 0
    })

  const vaCount = displayLeads.filter(l => l.state === 'VA').length
  const ncCount = displayLeads.filter(l => l.state === 'NC').length

  return (
    <div className="h-full flex overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* LEFT PANEL */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r bg-white" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <div className="text-sm font-bold" style={{ color: 'var(--sgc-navy)' }}>📡 Lead Radar</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
            Real public records · VA + NC · Live government APIs
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">

          {/* Time window */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)', letterSpacing: '0.08em' }}>
              Time Window
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {DAYS_OPTIONS.map(opt => (
                <button key={opt.v} onClick={() => setDays(opt.v)}
                  className="py-1.5 rounded-lg border text-xs font-medium cursor-pointer"
                  style={days === opt.v
                    ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                    : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          {/* Sources */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-navy)', letterSpacing: '0.08em' }}>
                Data Sources
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEnabledSources(new Set(RADAR_SOURCES.filter(s => s.enabled).map(s => s.id)))}
                  className="text-[10px] cursor-pointer bg-transparent border-none font-semibold"
                  style={{ color: 'var(--sgc-navy)' }}>Verified</button>
                <button onClick={() => setEnabledSources(new Set())}
                  className="text-[10px] cursor-pointer bg-transparent border-none font-semibold"
                  style={{ color: 'var(--sgc-gray-mid)' }}>None</button>
              </div>
            </div>

            {/* VA sources */}
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--sgc-gray-mid)' }}>
              Virginia
            </div>
            <div className="space-y-1.5 mb-3">
              {sources.filter(s => s.state === 'VA').map(s => (
                <SourceToggle key={s.id} source={s} enabled={enabledSources.has(s.id)} onToggle={() => toggleSource(s.id)} />
              ))}
            </div>

            {/* NC sources */}
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--sgc-gray-mid)' }}>
              North Carolina
            </div>
            <div className="space-y-1.5 mb-3">
              {sources.filter(s => s.state === 'NC' && s.county !== 'Chatham').map(s => (
                <SourceToggle key={s.id} source={s} enabled={enabledSources.has(s.id)} onToggle={() => toggleSource(s.id)} />
              ))}
            </div>

            {/* Chatham County specific */}
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--sgc-gray-mid)' }}>
              Chatham County, NC
            </div>
            <div className="space-y-1.5">
              {sources.filter(s => s.county === 'Chatham').map(s => (
                <SourceToggle key={s.id} source={s} enabled={enabledSources.has(s.id)} onToggle={() => toggleSource(s.id)} />
              ))}
            </div>
          </div>

          {/* Tracerfy skip trace setup */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--sgc-navy)', letterSpacing: '0.08em' }}>Skip Tracing</div>
              <button onClick={() => setShowTracerSetup(s => !s)}
                className="text-[10px] cursor-pointer bg-transparent border-none font-semibold"
                style={{ color: 'var(--sgc-navy)' }}>{tracerKey ? 'Change' : 'Setup'}</button>
            </div>
            <div className="rounded-xl border p-3" style={{
              borderColor: tracerKey ? '#1A7A4A40' : 'var(--sgc-gray-border)',
              background: tracerKey ? '#EDFAF3' : 'var(--sgc-gray-light)',
            }}>
              <div className="text-[10px] font-semibold" style={{ color: tracerKey ? '#1A7A4A' : 'var(--sgc-gray-mid)' }}>
                {tracerKey ? `✓ Tracerfy Active${tracerBalance ? ` · ${tracerBalance.credits} credits` : ''}` : '⚠ No skip trace key'}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
                {tracerKey ? '$0.20/trace · owner name, phone, email, equity' : 'Get key at tracerfy.com · $0.02/credit'}
              </div>
            </div>
            {showTracerSetup && (
              <div className="mt-2 space-y-2">
                <input className="w-full rounded-lg border text-xs px-3 py-2 outline-none bg-white"
                  style={{ borderColor: 'var(--sgc-gray-border)' }}
                  type="password" value={draftTracerKey}
                  onChange={e => setDraftTracerKey(e.target.value)}
                  placeholder="Your Tracerfy API key" />
                <div className="flex gap-2">
                  <button onClick={() => saveTracerKey(draftTracerKey)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white border-none cursor-pointer"
                    style={{ background: 'var(--sgc-navy)' }}>Save</button>
                  <button onClick={() => setShowTracerSetup(false)}
                    className="px-3 py-1.5 rounded-lg text-xs border-none cursor-pointer"
                    style={{ background: 'var(--sgc-gray-border)' }}>Cancel</button>
                </div>
                <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                  TCPA: Skip trace data for personal use only. Always DNC-scrub before calling. Key stored in your browser only.
                </div>
              </div>
            )}
          </div>
          <div className="rounded-xl p-3 text-[10px]" style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
            <div className="font-semibold mb-1" style={{ color: 'var(--sgc-navy)' }}>Legal Data Sources</div>
            All data is public record under Virginia Public Records Act (Va. Code §42.1-76) and NC Public Records Law (NCGS Ch. 132). Direct government API access — no scraping.
          </div>
        </div>

        {/* Scan button */}
        <div className="p-4 border-t" style={{ borderColor: 'var(--sgc-gray-border)' }}>
          <button onClick={handleFetch} disabled={loading || !enabledSources.size}
            className="w-full py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
            style={{ background: loading ? 'var(--sgc-gray-mid)' : enabledSources.size ? 'var(--sgc-navy)' : 'var(--sgc-gray-mid)' }}>
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full spin inline-block" />
                  Scanning {enabledSources.size} sources...
                </span>
              : `📡 Scan ${enabledSources.size} Sources · Last ${days} Days`}
          </button>
          {/* Live progress */}
          {loading && Object.entries(progress).length > 0 && (
            <div className="mt-2 space-y-1">
              {Object.entries(progress).map(([id, status]) => {
                const src = RADAR_SOURCES.find(s => s.id === id)
                return (
                  <div key={id} className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{
                      background: status === 'loaded' ? '#1A7A4A' : status === 'error' ? '#C0341D' : '#C45E1A'
                    }} />
                    {src?.name} — {status === 'loading' ? '⟳ fetching...' : status === 'loaded' ? '✓ done' : '✗ error'}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Filter bar — only when results exist */}
        {result && (
          <div className="flex-shrink-0 border-b bg-white" style={{ borderColor: 'var(--sgc-gray-border)' }}>
            {/* Stats strip */}
            <div className="grid border-b" style={{ gridTemplateColumns: 'repeat(6, 1fr)', borderColor: 'var(--sgc-gray-border)' }}>
              {[
                { l: 'Total Leads',  v: result.stats.total,    c: 'var(--sgc-navy)'  },
                { l: 'Critical',     v: result.stats.critical, c: '#C0341D'          },
                { l: 'High',         v: result.stats.high,     c: '#C45E1A'          },
                { l: 'Virginia',     v: vaCount,               c: '#1B3A8C'          },
                { l: 'N. Carolina',  v: ncCount,               c: '#1A7A4A'          },
                { l: 'New Today',    v: result.stats.newToday, c: '#534AB7'          },
              ].map((s, i) => (
                <div key={s.l} className={`p-3 ${i < 5 ? 'border-r' : ''}`} style={{ borderColor: 'var(--sgc-gray-border)' }}>
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--sgc-gray-mid)' }}>{s.l}</div>
                  <div className="text-lg font-bold" style={{ color: s.c }}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Filter controls */}
            <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
              {/* Search */}
              <input
                className="text-xs px-3 py-1.5 rounded-lg border outline-none bg-white w-40"
                style={{ borderColor: 'var(--sgc-gray-border)' }}
                placeholder="Search address..."
                value={searchText} onChange={e => setSearchText(e.target.value)}
              />

              <div className="flex items-center gap-1">
                {(['all', 'VA', 'NC'] as const).map(s => (
                  <button key={s} onClick={() => setFilterState(s)}
                    className="text-[10px] px-2 py-1 rounded border cursor-pointer"
                    style={filterState === s
                      ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                      : { background: 'transparent', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {s === 'all' ? 'All States' : s}
                  </button>
                ))}
              </div>

              {/* Severity */}
              <div className="flex items-center gap-1">
                {(['all', 'critical', 'high', 'medium'] as const).map(s => (
                  <button key={s} onClick={() => setFilterSeverity(s)}
                    className="text-[10px] px-2 py-1 rounded border cursor-pointer capitalize"
                    style={filterSeverity === s
                      ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                      : { background: 'transparent', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {s === 'all' ? 'All Severity' : s}
                  </button>
                ))}
              </div>

              {/* Min score */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>Min Score:</span>
                {[0, 50, 65, 80].map(v => (
                  <button key={v} onClick={() => setFilterMinScore(v)}
                    className="text-[10px] px-2 py-1 rounded border cursor-pointer"
                    style={filterMinScore === v
                      ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                      : { background: 'transparent', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {v === 0 ? 'All' : `${v}+`}
                  </button>
                ))}
              </div>

              {/* Sort */}
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>Sort:</span>
                {(['score', 'date', 'severity'] as const).map(s => (
                  <button key={s} onClick={() => setSortBy(s)}
                    className="text-[10px] px-2 py-1 rounded border cursor-pointer capitalize"
                    style={sortBy === s
                      ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                      : { background: 'transparent', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {s === 'score' ? '🎯 Score' : s === 'date' ? '📅 Date' : '⚠ Severity'}
                  </button>
                ))}
                <span className="text-[10px] ml-2" style={{ color: 'var(--sgc-gray-mid)' }}>
                  {displayLeads.length} leads shown
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* Idle state */}
          {!loading && !result && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto px-8">
              <div className="text-6xl mb-4">📡</div>
              <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--sgc-navy)' }}>Lead Radar</h3>
              <p className="text-sm mb-6" style={{ color: 'var(--sgc-gray-mid)' }}>
                Pulls real-time motivated seller signals from public government APIs across Virginia and North Carolina. You see these leads the same day they're filed — before any national data broker picks them up.
              </p>
              <div className="grid grid-cols-2 gap-4 text-left w-full mb-6">
                {[
                  { icon: '🚧', t: 'Code Violations',   d: 'Structural, electrical, plumbing issues — owners who can\'t afford to fix' },
                  { icon: '🏗️', t: 'Building Permits',  d: 'Distressed rehab signals — owners starting work they may not finish' },
                  { icon: '🔥', t: 'Fire Damage',        d: 'Immediate distressed seller signal — insurance complications' },
                  { icon: '💸', t: 'Tax Delinquent',    d: 'Owners behind on taxes — highest motivation to sell quickly' },
                  { icon: '🧠', t: 'AI Motivation Score', d: 'Claude AI analyzes every signal + skip trace data to score 0-100 seller motivation probability. Same deal, completely different owners = different scores.' },
                  { icon: '🔍', t: 'Skip Trace Built-In', d: 'One click → owner name, phone, email, equity, tax status. DNC flags shown automatically. TCPA-safe workflow.' },
                ].map(s => (
                  <div key={s.t} className="rounded-xl border p-3 bg-white flex gap-3" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                    <span className="text-2xl flex-shrink-0">{s.icon}</span>
                    <div>
                      <div className="text-sm font-bold mb-0.5" style={{ color: 'var(--sgc-navy)' }}>{s.t}</div>
                      <div className="text-xs leading-relaxed" style={{ color: 'var(--sgc-gray-mid)' }}>{s.d}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={handleFetch}
                className="px-8 py-3 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
                style={{ background: 'var(--sgc-navy)' }}>
                📡 Start Scanning
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="w-12 h-12 border-2 rounded-full spin mb-5"
                style={{ borderColor: 'var(--sgc-gray-border)', borderTopColor: 'var(--sgc-navy)' }} />
              <div className="text-base font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>
                Scanning {enabledSources.size} government data sources...
              </div>
              <div className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>
                Pulling real public records from VA + NC APIs
              </div>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <>
              {displayLeads.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">🔍</div>
                  <div className="text-sm font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>No leads match your filters</div>
                  <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                    Try widening the time window, lowering the score filter, or enabling more sources
                  </div>
                </div>
              ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
                  {displayLeads.map(lead => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      expanded={expandedId === lead.id}
                      onExpand={() => setExpanded(expandedId === lead.id ? null : lead.id)}
                      tracerKey={tracerKey}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
