/**
 * Costing Intelligence Panel
 *
 * Embedded inside Deal P&L — shows what the system has learned
 * from your closed deals and lets you apply those learnings
 * to adjust the current deal's estimates in one click.
 */
import { useState } from 'react'
import {
  buildCostingIntelligence, applyIntelligence, upsertLineItem,
  CostingIntelligence as CI, PLLineItem,
} from '../lib/dealPL'

const fmt$ = (n: number) => n !== 0 ? (n > 0 ? '+' : '') + '$' + Math.abs(Math.round(n)).toLocaleString() : '—'
const fmt$abs = (n: number) => '$' + Math.round(Math.abs(n)).toLocaleString()

interface Props {
  dealId:  string
  items:   PLLineItem[]
  onApply: () => void
}

export default function CostingIntelligencePanel({ dealId, items, onApply }: Props) {
  const [intel] = useState<CI>(() => buildCostingIntelligence())
  const [expanded, setExpanded] = useState(false)
  const [applied, setApplied]   = useState(false)
  const [preview, setPreview]   = useState(false)

  if (!intel.hasEnoughData) {
    return (
      <div className="rounded-2xl p-4" style={{ background: '#EEF2FB', border: '1px solid var(--sgc-navy)20' }}>
        <div className="flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">🧠</span>
          <div>
            <div className="text-sm font-bold mb-1" style={{ color: 'var(--sgc-navy)' }}>
              Deal Costing Intelligence
            </div>
            <div className="text-xs leading-relaxed" style={{ color: 'var(--sgc-gray-mid)' }}>
              {intel.dealsAnalyzed === 0
                ? 'Close your first deal with actuals entered in the P&L tracker. After 2 closed deals with actual costs, this panel learns your systematic estimation patterns and adjusts future estimates automatically.'
                : `${intel.dealsAnalyzed} closed deal analyzed — need 2+ with actuals to detect patterns. Keep entering actual costs as you close.`}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const adjustments = applyIntelligence(items, intel)
  const totalAdjustment = adjustments.reduce((s, a) => s + (a.adjusted - a.original), 0)

  const handleApply = () => {
    for (const adj of adjustments) {
      const item = items.find(i => i.id === adj.itemId)
      if (item) upsertLineItem(dealId, { ...item, estimated: adj.adjusted })
    }
    setApplied(true)
    setPreview(false)
    onApply()
  }

  return (
    <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--sgc-navy)30' }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 border-none cursor-pointer"
        style={{ background: 'var(--sgc-navy)' }}>
        <div className="flex items-center gap-3">
          <span className="text-xl">🧠</span>
          <div className="text-left">
            <div className="text-sm font-bold text-white">Deal Costing Intelligence</div>
            <div className="text-[10px] text-white/70 mt-0.5">
              Learned from {intel.dealsAnalyzed} closed deal{intel.dealsAnalyzed !== 1 ? 's' : ''} ·{' '}
              {intel.estimatedAccuracy}% accuracy · {expanded ? 'collapse' : 'expand'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {adjustments.length > 0 && !applied && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: '#FBBF24', color: '#1a1a1a' }}>
              {adjustments.length} adj available
            </span>
          )}
          <span className="text-white text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="bg-white p-5 space-y-5">

          {/* Accuracy score */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { l: 'Overall Accuracy', v: `${intel.estimatedAccuracy}%`, c: intel.estimatedAccuracy >= 85 ? '#1A7A4A' : intel.estimatedAccuracy >= 70 ? '#C45E1A' : '#C0341D', bg: intel.estimatedAccuracy >= 85 ? '#EDFAF3' : '#FEF7EA' },
              { l: 'Rehab Bias', v: intel.rehabBias > 0 ? `+${intel.rehabBias}% over` : intel.rehabBias < 0 ? `${intel.rehabBias}% under` : 'Accurate', c: Math.abs(intel.rehabBias) > 10 ? '#C0341D' : '#1A7A4A', bg: Math.abs(intel.rehabBias) > 10 ? '#FEF0ED' : '#EDFAF3' },
              { l: 'Suggested Buffer', v: `+${intel.suggestedRehabBuffer}%`, c: '#1B3A8C', bg: '#EEF2FB' },
            ].map(m => (
              <div key={m.l} className="text-center p-3 rounded-xl" style={{ background: m.bg }}>
                <div className="text-[10px] font-semibold mb-0.5 uppercase tracking-wider" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
                <div className="text-lg font-black" style={{ color: m.c }}>{m.v}</div>
              </div>
            ))}
          </div>

          {/* Top insight */}
          {intel.topBias && (
            <div className="rounded-xl p-4" style={{
              background: intel.topBias.trend === 'over' ? '#FEF0ED' : '#EDFAF3',
              border: `1px solid ${intel.topBias.trend === 'over' ? '#C0341D30' : '#1A7A4A30'}`,
            }}>
              <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: intel.topBias.trend === 'over' ? '#C0341D' : '#1A7A4A' }}>
                ⚠ Biggest Systematic Bias — {intel.topBias.label}
              </div>
              <div className="text-sm font-semibold mb-0.5" style={{ color: 'var(--sgc-black)' }}>
                {intel.topBias.insight}
              </div>
              <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
                Based on {intel.topBias.dataPoints} deal{intel.topBias.dataPoints !== 1 ? 's' : ''} ·{' '}
                avg {fmt$(intel.topBias.avgVariance$)} per deal · {intel.topBias.confidence} confidence
              </div>
            </div>
          )}

          {/* Category patterns */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)' }}>
              Pattern by Category
            </div>
            <div className="space-y-2">
              {intel.patterns.map(p => (
                <div key={p.category} className="flex items-center gap-3 p-2.5 rounded-xl"
                  style={{ background: 'var(--sgc-gray-light)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold" style={{ color: 'var(--sgc-black)' }}>{p.label}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
                      {p.dataPoints} deal{p.dataPoints !== 1 ? 's' : ''} · {p.confidence} confidence
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-black" style={{
                      color: p.trend === 'over' ? '#C0341D' : p.trend === 'under' ? '#1A7A4A' : '#1B3A8C'
                    }}>
                      {p.avgVariancePct > 0 ? '+' : ''}{p.avgVariancePct}%
                    </div>
                    <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>
                      {p.trend === 'over' ? 'underestimate' : p.trend === 'under' ? 'overestimate' : 'accurate'}
                    </div>
                  </div>
                  {/* Mini bar */}
                  <div className="w-20 h-2 rounded-full overflow-hidden flex-shrink-0"
                    style={{ background: 'var(--sgc-gray-border)' }}>
                    <div className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.abs(p.avgVariancePct) * 2)}%`,
                        background: p.trend === 'over' ? '#C0341D' : p.trend === 'under' ? '#1A7A4A' : '#1B3A8C',
                        marginLeft: p.trend === 'under' ? 'auto' : 0,
                      }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Smart adjustments for this deal */}
          {adjustments.length > 0 && (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#FBBF2440' }}>
              <div className="px-4 py-3 flex items-center justify-between"
                style={{ background: '#FFFBEB' }}>
                <div>
                  <div className="text-xs font-bold" style={{ color: '#8A5700' }}>
                    💡 Smart Adjustments for This Deal
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: '#8A5700' }}>
                    Based on your patterns — apply to update estimates
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black" style={{ color: totalAdjustment > 0 ? '#C0341D' : '#1A7A4A' }}>
                    {fmt$(totalAdjustment)}
                  </div>
                  <div className="text-[9px]" style={{ color: '#8A5700' }}>total adjustment</div>
                </div>
              </div>

              <div className="divide-y" style={{ borderColor: 'var(--sgc-gray-border)' }}>
                {adjustments.map(adj => (
                  <div key={adj.itemId} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold" style={{ color: 'var(--sgc-black)' }}>
                        {items.find(i => i.id === adj.itemId)?.label}
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>
                        {fmt$abs(adj.original)} → {fmt$abs(adj.adjusted)}
                        {' '}({adj.biasDirection === 'over' ? '+' : '-'}{adj.biasPct}% based on your history)
                      </div>
                    </div>
                    <div className="text-sm font-black flex-shrink-0"
                      style={{ color: adj.adjusted > adj.original ? '#C0341D' : '#1A7A4A' }}>
                      {adj.adjusted > adj.original ? '+' : ''}{fmt$abs(adj.adjusted - adj.original)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3" style={{ background: '#FFFBEB' }}>
                {applied ? (
                  <div className="text-center text-sm font-bold" style={{ color: '#1A7A4A' }}>
                    ✓ Adjustments applied to this deal's estimates
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setPreview(p => !p)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold border-none cursor-pointer"
                      style={{ background: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                      {preview ? 'Hide' : 'Preview'} Changes
                    </button>
                    <button onClick={handleApply}
                      className="flex-1 py-2 rounded-xl text-xs font-bold text-white border-none cursor-pointer"
                      style={{ background: '#8A5700' }}>
                      Apply Smart Adjustments
                    </button>
                  </div>
                )}
              </div>

              {/* Preview */}
              {preview && !applied && (
                <div className="px-4 pb-3 pt-1 space-y-1.5">
                  {adjustments.map(adj => {
                    const item = items.find(i => i.id === adj.itemId)
                    return (
                      <div key={adj.itemId} className="flex items-center gap-2 text-xs p-2 rounded-lg"
                        style={{ background: 'var(--sgc-gray-light)' }}>
                        <span className="flex-1" style={{ color: 'var(--sgc-gray-mid)' }}>{item?.label}</span>
                        <span style={{ color: 'var(--sgc-gray-mid)', textDecoration: 'line-through' }}>${Math.round(adj.original).toLocaleString()}</span>
                        <span className="font-bold" style={{ color: '#8A5700' }}>→</span>
                        <span className="font-bold" style={{ color: 'var(--sgc-black)' }}>${Math.round(adj.adjusted).toLocaleString()}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {adjustments.length === 0 && (
            <div className="text-center py-3 text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
              No adjustments needed for this deal's estimates based on your patterns
            </div>
          )}

          {/* Line-item rules */}
          {intel.smartAdjustments.filter(a => a.confidence !== 'low').length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)' }}>
                Your Estimation Rules (Learned)
              </div>
              <div className="space-y-1.5">
                {intel.smartAdjustments
                  .filter(a => a.confidence !== 'low')
                  .slice(0, 6)
                  .map(a => (
                    <div key={a.lineItemLabel} className="flex items-center gap-3 p-2.5 rounded-xl"
                      style={{ background: 'var(--sgc-gray-light)' }}>
                      <div className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: a.biasDirection === 'over' ? '#C0341D' : '#1A7A4A' }}/>
                      <div className="flex-1 text-xs" style={{ color: 'var(--sgc-black)' }}>{a.rule}</div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{
                          background: a.confidence === 'high' ? '#EDFAF3' : '#FEF7EA',
                          color: a.confidence === 'high' ? '#1A7A4A' : '#8A5700',
                        }}>
                        {a.confidence}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="text-[10px] text-center" style={{ color: 'var(--sgc-gray-mid)' }}>
            Intelligence updates as you close more deals and enter actuals · {new Date(intel.generatedAt).toLocaleDateString()}
          </div>
        </div>
      )}
    </div>
  )
}
