import { useState } from 'react'
import { AnalyzedProperty } from '../types'
import { fmt$, fmtPct, tagColors } from '../lib/utils'
import { fetchComparables } from '../lib/rentcast'
import { getAIAnalysis, generateQuickInsight } from '../lib/aiAnalysis'

interface Props {
  property: AnalyzedProperty | null
  onClose: () => void
}

const AnalysisBlock = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white border border-slate-200 rounded-lg p-4 mb-3">
    <div className="text-[10px] tracking-[2px] uppercase text-blue-900 mb-3">{title}</div>
    {children}
  </div>
)

const Row = ({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) => (
  <div className="flex justify-between items-center py-1.5 border-b border-white/[0.03] text-xs last:border-0">
    <span className="text-slate-500">{label}</span>
    <span className={`font-semibold ${valueClass || 'text-slate-900'}`}>{value}</span>
  </div>
)

const GaugeCard = ({ value, label, cls = '' }: { value: string; label: string; cls?: string }) => (
  <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
    <div className={`text-xl font-semibold leading-tight ${cls}`}>{value}</div>
    <div className="text-[9px] tracking-widest uppercase text-slate-500 mt-1">{label}</div>
  </div>
)

export default function DetailPanel({ property: p, onClose }: Props) {
  const [comps, setComps] = useState<any[]>([])
  const [compsLoading, setCompsLoading] = useState(false)
  const [compsError, setCompsError] = useState('')
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  if (!p) return null

  const profitPct = p.arv > 0 ? Math.min(100, Math.max(0, (p.profit / p.arv) * 100)) : 0

  const handleComps = async () => {
    setCompsLoading(true); setCompsError('')
    try {
      const data = await fetchComparables(p.addr, p.beds, p.baths, p.propType)
      setComps(data)
    } catch (e: any) { setCompsError(e.message) }
    finally { setCompsLoading(false) }
  }

  const handleAI = async () => {
    setAiLoading(true); setAiError(''); setAiText('')
    try {
      const text = await getAIAnalysis(p)
      setAiText(text)
    } catch (e: any) { setAiError(e.message) }
    finally { setAiLoading(false) }
  }

  return (
    <div className="fixed top-[65px] right-0 bottom-0 w-[560px] bg-slate-50 border-l border-slate-200 z-50 flex flex-col slide-in shadow-2xl">
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-slate-200 sticky top-0 bg-slate-50 z-10">
        <div>
          <div className="text-sm font-semibold text-slate-900">{p.addr}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{p.city}, {p.state} {p.zip} · {p.propType}</div>
        </div>
        <button onClick={onClose} className="text-[11px] text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 rounded px-3 py-1.5 transition-colors cursor-pointer bg-transparent">✕ Close</button>
      </div>

      {/* Body */}
      <div className="overflow-y-auto flex-1 p-5">
        {/* Gauges */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <GaugeCard value={String(p.flipScore)} label="Flip Score" cls={p.scoreClass} />
          <GaugeCard value={fmtPct(p.roi)} label="ROI" cls={p.roi >= 0 ? 'text-green-400' : 'text-red-400'} />
          <GaugeCard value={fmt$(p.profit)} label="Net Profit" cls={p.profit >= 0 ? 'text-green-400' : 'text-red-400'} />
          <GaugeCard value={fmtPct(p.annualizedROI)} label="Annualized ROI" cls="text-blue-400" />
        </div>

        {/* Quick Insight */}
        <div className="bg-blue-900/5 border border-blue-900/30 rounded-lg p-4 mb-3">
          <div className="flex items-center gap-2 text-[10px] tracking-[2px] uppercase text-blue-900 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-800 pulse-dot" />
            Deal Intelligence
          </div>
          <p className="text-xs text-slate-700 leading-relaxed">{generateQuickInsight(p)}</p>
        </div>

        {/* P&L */}
        <AnalysisBlock title="P&L Breakdown">
          <Row label="Purchase Price" value={fmt$(p.price)} />
          <Row label="Est. Rehab Cost" value={`-${fmt$(p.rehabCost)}`} valueClass="text-red-400" />
          <Row label="Closing Costs (buy 3%)" value={`-${fmt$(p.closingBuyNum)}`} valueClass="text-red-400" />
          <Row label={`Holding Costs (${p.holdMonths}mo)`} value={`-${fmt$(p.holdingCost)}`} valueClass="text-red-400" />
          <div className="border-t border-slate-300 my-1" />
          <Row label="Total Investment" value={fmt$(p.totalInvested)} />
          <Row label="Est. ARV" value={fmt$(p.arv)} valueClass="text-blue-900" />
          <Row label="Selling Commission (6%)" value={`-${fmt$(p.sellingComm)}`} valueClass="text-red-400" />
          <Row label="Closing Costs (sell 2%)" value={`-${fmt$(p.closingSell)}`} valueClass="text-red-400" />
          <div className="border-t border-blue-900/30 mt-2 pt-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-700">NET PROFIT</span>
              <span className={`text-lg font-semibold ${p.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt$(p.profit)}</span>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-slate-500 mb-1">
              <span>Cost basis</span><span>Profit margin {profitPct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${p.profit >= 0 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${profitPct}%` }} />
            </div>
          </div>
        </AnalysisBlock>

        {/* 70% Rule */}
        <AnalysisBlock title="70% Rule Analysis">
          <Row label="Max Offer (70% Rule)" value={fmt$(p.momsRule)} valueClass="text-blue-900" />
          <Row label="List Price" value={fmt$(p.price)} />
          <Row label="Spread vs Max Offer" value={`${fmt$(p.momsRule - p.price)} ${p.underMoms ? '✓' : '✗'}`} valueClass={p.underMoms ? 'text-green-400' : 'text-red-400'} />
          <Row label="Equity Position" value={fmtPct(p.equityPct)} />
        </AnalysisBlock>

        {/* Property Details */}
        <AnalysisBlock title="Property Details">
          <Row label="Type" value={p.propType} />
          {p.sqft ? <Row label="Sq Ft" value={p.sqft.toLocaleString()} /> : null}
          {p.yearBuilt ? <Row label="Year Built" value={String(p.yearBuilt)} /> : null}
          {p.lot ? <Row label="Lot Size" value={`${p.lot.toLocaleString()} sqft`} /> : null}
          <Row label="Days on Market" value={p.dom ? String(p.dom) : 'N/A'} />
          {p.price && p.sqft ? <Row label="Price / SqFt" value={fmt$(p.price / p.sqft)} /> : null}
        </AnalysisBlock>

        {/* Action Buttons */}
        <div className="flex gap-2 mt-1 mb-3">
          <button onClick={handleAI} disabled={aiLoading} className="flex-1 bg-blue-900 hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-500 text-white text-xs font-semibold tracking-widest uppercase py-2.5 rounded transition-colors cursor-pointer">
            {aiLoading ? '⏳ Analyzing...' : '⬡ Deep AI Analysis'}
          </button>
          <button onClick={handleComps} disabled={compsLoading} className="bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 text-xs py-2.5 px-4 rounded border border-slate-300 transition-colors cursor-pointer">
            {compsLoading ? '...' : 'Fetch Comps'}
          </button>
        </div>

        {/* AI Result */}
        {(aiText || aiError) && (
          <div className={`rounded-lg p-4 mb-3 ${aiError ? 'bg-red-500/10 border border-red-500/30' : 'bg-blue-900/5 border border-blue-900/30'}`}>
            <div className="flex items-center gap-2 text-[10px] tracking-[2px] uppercase text-blue-900 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-800" />
              Deep AI Analysis
            </div>
            <p className={`text-xs leading-relaxed whitespace-pre-wrap ${aiError ? 'text-red-400' : 'text-slate-700'}`}>{aiError || aiText}</p>
          </div>
        )}

        {/* Comps */}
        {compsError && <div className="text-red-400 text-xs mb-3">Comps error: {compsError}</div>}
        {comps.length > 0 && (
          <AnalysisBlock title={`Comparable Sales (${comps.length} comps · avg ${fmt$(comps.reduce((s, c) => s + (c.price || 0), 0) / comps.length)})`}>
            <table className="w-full text-[11px]">
              <thead>
                <tr>
                  {['Address', 'Price', 'Bd/Ba', 'SqFt', '$/SqFt'].map(h => (
                    <th key={h} className="text-left text-slate-500 text-[10px] tracking-wide uppercase pb-2 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comps.map((c, i) => {
                  const psf = c.squareFootage ? (c.price / c.squareFootage) : 0
                  return (
                    <tr key={i} className="border-t border-white/[0.03]">
                      <td className="py-1.5 text-slate-600 max-w-[120px] truncate">{c.formattedAddress || c.addressLine1 || '—'}</td>
                      <td className="py-1.5 text-blue-900">{fmt$(c.price)}</td>
                      <td className="py-1.5">{c.bedrooms || '?'}/{c.bathrooms || '?'}</td>
                      <td className="py-1.5">{c.squareFootage ? c.squareFootage.toLocaleString() : '—'}</td>
                      <td className="py-1.5">{psf ? fmt$(psf) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </AnalysisBlock>
        )}
      </div>
    </div>
  )
}
