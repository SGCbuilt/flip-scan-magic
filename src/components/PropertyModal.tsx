import { useState, useEffect } from 'react'
import { AnalyzedProperty, SearchParams } from '../types'
import { fmt$ } from '../lib/utils'
import { fetchComparables } from '../lib/rentcast'
import { getAIAnalysis, generateQuickInsight } from '../lib/aiAnalysis'

interface Props {
  property: AnalyzedProperty
  params: SearchParams
  onClose: () => void
}

type ModalTab = 'overview' | 'deal' | 'calculator' | 'comps' | 'ai'

const Row = ({ label, value, cls = '' }: { label: string; value: string; cls?: string }) => (
  <div className="flex justify-between items-center py-2 border-b border-slate-200 last:border-0 text-sm">
    <span className="text-slate-500 text-xs">{label}</span>
    <span className={`font-semibold text-xs ${cls || 'text-slate-800'}`}>{value}</span>
  </div>
)

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-5">
    <div className="text-[10px] tracking-[2px] uppercase text-[#4a6fd8] font-semibold mb-2">{title}</div>
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">{children}</div>
  </div>
)

// ── CALCULATOR TAB ────────────────────────────────────────────────────────
function CalcTab({ p }: { p: AnalyzedProperty }) {
  const [purchase, setPurchase] = useState(p.price)
  const [rehab, setRehab] = useState(p.rehabCost)
  const [arv, setArv] = useState(p.arv)
  const [hold, setHold] = useState(p.holdMonths)
  const [rate, setRate] = useState(10)
  const [downPct, setDownPct] = useState(20)
  const [comm, setComm] = useState(6)
  const [closeBuy, setCloseBuy] = useState(3)
  const [closeSell, setCloseSell] = useState(2)

  const loan = purchase * (1 - downPct / 100)
  const holdCost = loan * (rate / 100) * (hold / 12)
  const closingBuy = purchase * (closeBuy / 100)
  const totalIn = purchase + rehab + closingBuy + holdCost
  const totalCash = purchase * (downPct / 100) + rehab + closingBuy + holdCost * 0.5
  const sellComm = arv * (comm / 100)
  const closingS = arv * (closeSell / 100)
  const netProc = arv - sellComm - closingS
  const profit = netProc - totalIn
  const roi = totalIn > 0 ? (profit / totalIn) * 100 : 0
  const annRoi = hold > 0 ? roi / (hold / 12) : roi
  const momsMax = arv * 0.70 - rehab
  const profitPct = arv > 0 ? Math.max(0, (profit / arv) * 100) : 0

  const ic = "w-full bg-blue-900 border border-slate-300 rounded-lg text-slate-900 font-mono text-xs px-3 py-2 outline-none focus:border-[#1a3a8f]/60 transition-colors"

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-[10px] tracking-[2px] uppercase text-[#4a6fd8] mb-3">Acquisition</div>
          <div className="space-y-2">
            {[
              { label: 'Purchase Price', val: purchase, set: setPurchase },
              { label: 'Rehab Cost', val: rehab, set: setRehab },
              { label: 'Down Payment %', val: downPct, set: setDownPct },
              { label: 'Closing Costs Buy %', val: closeBuy, set: setCloseBuy },
            ].map(f => (
              <div key={f.label}>
                <div className="text-[10px] text-slate-400 mb-1">{f.label}</div>
                <input className={ic} type="number" value={f.val} onChange={e => f.set(parseFloat(e.target.value) || 0)} />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-[10px] tracking-[2px] uppercase text-[#4a6fd8] mb-3">Exit & Hold</div>
          <div className="space-y-2">
            {[
              { label: 'After Repair Value', val: arv, set: setArv },
              { label: 'Hold Months', val: hold, set: setHold },
              { label: 'Hard Money Rate % / yr', val: rate, set: setRate },
              { label: 'Agent Commission %', val: comm, set: setComm },
              { label: 'Closing Costs Sell %', val: closeSell, set: setCloseSell },
            ].map(f => (
              <div key={f.label}>
                <div className="text-[10px] text-slate-400 mb-1">{f.label}</div>
                <input className={ic} type="number" step="0.5" value={f.val} onChange={e => f.set(parseFloat(e.target.value) || 0)} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="text-[10px] tracking-[2px] uppercase text-[#4a6fd8] mb-3">Deal Results</div>
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { l: 'Net Profit',     v: fmt$(profit),         c: profit >= 0 ? 'text-emerald-700' : 'text-red-600' },
            { l: 'Total ROI',      v: roi.toFixed(2) + '%', c: roi >= 0 ? 'text-emerald-700' : 'text-red-600' },
            { l: 'Annualized ROI', v: annRoi.toFixed(2)+'%', c: 'text-[#7a9fe8]' },
            { l: 'Cash Required',  v: fmt$(totalCash),       c: 'text-slate-700' },
          ].map(m => (
            <div key={m.l} className="bg-slate-100 rounded-lg p-3 text-center">
              <div className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">{m.l}</div>
              <div className={`text-base font-bold ${m.c}`}>{m.v}</div>
            </div>
          ))}
        </div>
        <Row label="Holding Costs" value={`-${fmt$(holdCost)}`} cls="text-red-600" />
        <Row label="Closing Costs (buy)" value={`-${fmt$(closingBuy)}`} cls="text-red-600" />
        <Row label="Total Investment" value={fmt$(totalIn)} />
        <Row label="Commission + Closing (sell)" value={`-${fmt$(sellComm + closingS)}`} cls="text-red-600" />
        <Row label="70% Rule Max Offer" value={fmt$(momsMax)} cls="text-gold-600" />
        <Row
          label="vs 70% Rule"
          value={purchase <= momsMax ? `✓ Under by ${fmt$(momsMax - purchase)}` : `✗ Over by ${fmt$(purchase - momsMax)}`}
          cls={purchase <= momsMax ? 'text-emerald-700' : 'text-red-600'}
        />
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-slate-400 mb-1.5">
            <span>Profit margin</span><span>{profitPct.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-blue-900 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${profit >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, profitPct)}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── COMPS TAB ─────────────────────────────────────────────────────────────
function CompsTab({ p }: { p: AnalyzedProperty }) {
  const [comps, setComps] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    fetchComparables(p.addr, p.beds, p.baths, p.propType)
      .then(setComps)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [p.addr])

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-48">
      <div className="w-8 h-8 border-2 border-slate-300 border-t-[#1a3a8f] rounded-full spin mb-3" />
      <div className="text-xs text-slate-500">Fetching comparables...</div>
    </div>
  )

  if (error) return <div className="p-4 text-xs text-red-600">Error: {error}</div>

  if (!comps.length) return (
    <div className="flex flex-col items-center justify-center h-48 text-slate-400">
      <div className="text-3xl mb-2 opacity-30">🔍</div>
      <div className="text-sm">No comparables found in radius</div>
    </div>
  )

  const avgSale = comps.reduce((s, c) => s + (c.price || 0), 0) / comps.length

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
          <div className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">Avg Sale</div>
          <div className="text-base font-bold text-gold-600">{fmt$(avgSale)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
          <div className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">Subject Price</div>
          <div className="text-base font-bold text-slate-800">{fmt$(p.price)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
          <div className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">vs Comps</div>
          <div className={`text-base font-bold ${p.price <= avgSale ? 'text-emerald-700' : 'text-red-600'}`}>
            {p.price <= avgSale ? '↓ Below' : '↑ Above'} avg
          </div>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100/70">
              {['Address','Price','Bd/Ba','SqFt','$/SqFt'].map(h => (
                <th key={h} className="text-left text-[10px] uppercase tracking-widest text-slate-400 py-2.5 px-3 font-normal first:pl-4">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comps.map((c, i) => {
              const psf = c.squareFootage ? c.price / c.squareFootage : 0
              return (
                <tr key={i} className="border-b border-slate-200/70 last:border-0 hover:bg-slate-50">
                  <td className="py-2 px-3 pl-4 text-slate-500 max-w-[200px] truncate">{c.formattedAddress || c.addressLine1}</td>
                  <td className="py-2 px-3 text-gold-600 font-semibold">{fmt$(c.price)}</td>
                  <td className="py-2 px-3 text-slate-500">{c.bedrooms || '?'}/{c.bathrooms || '?'}</td>
                  <td className="py-2 px-3 text-slate-500">{c.squareFootage?.toLocaleString() || '—'}</td>
                  <td className="py-2 px-3 text-slate-500">{psf ? fmt$(psf) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── AI TAB ────────────────────────────────────────────────────────────────
function AITab({ p }: { p: AnalyzedProperty }) {
  const [aiText, setAiText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const quickInsight = generateQuickInsight(p)

  const run = async () => {
    setLoading(true); setError(''); setAiText('')
    try {
      const text = await getAIAnalysis(p)
      setAiText(text)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="bg-[#1a3a8f]/10 border border-[#1a3a8f]/30 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 text-[10px] tracking-[2px] uppercase text-[#7a9fe8] mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#7a9fe8] pulse-dot" />
          Quick Intelligence
        </div>
        <p className="text-xs text-slate-700 leading-relaxed">{quickInsight}</p>
      </div>

      {!aiText && !loading && (
        <button onClick={run}
          className="w-full bg-[#1a3a8f] hover:bg-[#2a4aaf] text-white text-xs font-bold tracking-widest uppercase py-3 rounded-xl transition-colors cursor-pointer mb-4">
          ⬡ Run Deep AI Analysis
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl mb-4">
          <div className="w-5 h-5 border-2 border-slate-300 border-t-[#7a9fe8] rounded-full spin flex-shrink-0" />
          <div className="text-xs text-slate-500">Claude is analyzing this deal...</div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 mb-4">
          {error.includes('VITE_ANTHROPIC_API_KEY')
            ? '⚠️ Add your Anthropic API key to .env as VITE_ANTHROPIC_API_KEY'
            : `Error: ${error}`}
        </div>
      )}

      {aiText && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-[10px] tracking-[2px] uppercase text-[#7a9fe8] mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[#7a9fe8]" />
            Deep AI Analysis
          </div>
          <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{aiText}</div>
          <button onClick={run} className="mt-3 text-[10px] text-slate-400 hover:text-slate-500 cursor-pointer bg-transparent border-none">
            ↻ Re-analyze
          </button>
        </div>
      )}
    </div>
  )
}

// ── MAIN MODAL ────────────────────────────────────────────────────────────
export default function PropertyModal({ property: p, params, onClose }: Props) {
  const [tab, setTab] = useState<ModalTab>('overview')

  const TABS: { id: ModalTab; label: string }[] = [
    { id: 'overview',    label: '📋 Overview'    },
    { id: 'deal',        label: '💰 Deal Analysis' },
    { id: 'calculator',  label: '🔢 Calculator'   },
    { id: 'comps',       label: '📊 Comps'        },
    { id: 'ai',          label: '🤖 AI Advisor'   },
  ]

  const isHot = p.flipScore >= 70

  return (
    <div className="fixed inset-0 z-[100] flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-blue-950/40 backdrop-blur-sm backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-2xl h-full bg-white border-l border-slate-200 flex flex-col shadow-2xl slide-in">

        {/* Header */}
        <div className={`flex-shrink-0 border-b border-slate-200 ${isHot ? 'bg-emerald-50' : 'bg-slate-50'}`}>
          {/* Accent line */}
          <div className={`h-0.5 w-full ${isHot ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-[#1a3a8f] to-[#1a3a8f]/30'}`} />

          <div className="px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  {isHot && <span className="text-[9px] bg-emerald-500 text-blue-950 font-bold px-2 py-0.5 rounded-full">🔥 HOT DEAL</span>}
                  {p.underMoms && <span className="text-[9px] border border-emerald-500/40 text-emerald-700 px-2 py-0.5 rounded-full">70% Rule ✓</span>}
                  <span className="text-[9px] text-slate-500 border border-slate-300 px-2 py-0.5 rounded-full">{p.sourceLabel}</span>
                </div>
                <h2 className="text-base font-bold text-white leading-tight">{p.addr}</h2>
                <div className="text-xs text-slate-500 mt-0.5">
                  {p.city}{p.state ? `, ${p.state}` : ''} {p.zip}
                  {p.beds ? ` · ${p.beds}bd/${p.baths}ba` : ''}
                  {p.sqft ? ` · ${p.sqft.toLocaleString()} sqft` : ''}
                  {p.yearBuilt ? ` · Built ${p.yearBuilt}` : ''}
                  {p.propType ? ` · ${p.propType}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className={`w-14 h-14 rounded-full border-2 flex flex-col items-center justify-center
                  ${p.flipScore >= 80 ? 'border-emerald-500' : p.flipScore >= 65 ? 'border-gold-500' : 'border-slate-300'}`}>
                  <span className={`text-lg font-bold leading-none ${p.scoreClass}`}>{p.flipScore}</span>
                  <span className={`text-[9px] font-bold ${p.scoreClass}`}>{p.scoreGrade}</span>
                </div>
                <button onClick={onClose} className="text-slate-500 hover:text-slate-700 hover:bg-blue-900 w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer bg-transparent border-none text-lg">✕</button>
              </div>
            </div>

            {/* Quick numbers */}
            <div className="grid grid-cols-5 gap-2 mt-3">
              {[
                { l: 'List Price', v: fmt$(p.price), c: 'text-slate-800' },
                { l: 'Est ARV', v: fmt$(p.arv), c: 'text-gold-600' },
                { l: 'Net Profit', v: fmt$(p.profit), c: p.profit >= 0 ? 'text-emerald-700' : 'text-red-600' },
                { l: 'ROI', v: p.roi.toFixed(1)+'%', c: p.roi >= 0 ? 'text-emerald-700' : 'text-red-600' },
                { l: 'Rehab Est', v: fmt$(p.rehabCost), c: 'text-orange-600' },
              ].map(m => (
                <div key={m.l} className="bg-slate-100 rounded-lg p-2.5 text-center">
                  <div className="text-[9px] text-slate-400 uppercase tracking-wider mb-0.5">{m.l}</div>
                  <div className={`text-sm font-bold ${m.c}`}>{m.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-t border-slate-200 px-2">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-[11px] border-b-2 transition-colors cursor-pointer bg-transparent tracking-wide
                  ${tab === t.id ? 'text-white border-[#1a3a8f]' : 'text-slate-400 border-transparent hover:text-slate-500'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div>
              <Section title="Opportunity Signals">
                <div className="p-4">
                  {p.signals.length === 0 ? (
                    <div className="text-xs text-slate-400">No specific signals detected</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {p.signals.map((s, i) => (
                        <span key={i} className="text-xs text-slate-700 bg-blue-900 border border-slate-300 px-3 py-1.5 rounded-lg">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              </Section>

              <Section title="Score Breakdown">
                <div className="p-4 space-y-3">
                  {[
                    { label: 'ROI Score',       score: p.scoreBreakdown.roi,    color: 'bg-emerald-500', weight: '30%' },
                    { label: '70% Rule Score',  score: p.scoreBreakdown.rule70, color: 'bg-[#1a3a8f]',  weight: '28%' },
                    { label: 'Profit Score',    score: p.scoreBreakdown.profit, color: 'bg-teal-500',    weight: '15%' },
                    { label: 'DOM Score',       score: p.scoreBreakdown.dom,    color: 'bg-violet-500',  weight: '15%' },
                    { label: 'Equity Score',    score: p.scoreBreakdown.equity, color: 'bg-gold-500',   weight: '12%' },
                  ].map(b => (
                    <div key={b.label} className="flex items-center gap-3">
                      <div className="text-xs text-slate-500 w-36 flex-shrink-0">{b.label}</div>
                      <div className="flex-1 h-2 bg-blue-900 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${b.color}`} style={{ width: `${b.score}%` }} />
                      </div>
                      <div className="text-xs text-slate-500 w-8 text-right">{b.score}</div>
                      <div className="text-[10px] text-slate-400 w-8">{b.weight}</div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Property Details">
                <div className="px-4 py-2">
                  <Row label="Property Type" value={p.propType} />
                  {p.sqft > 0 && <Row label="Living Area" value={`${p.sqft.toLocaleString()} sqft`} />}
                  {p.yearBuilt && <Row label="Year Built" value={String(p.yearBuilt)} />}
                  {p.lot && <Row label="Lot Size" value={`${p.lot.toLocaleString()} sqft`} />}
                  <Row label="Days on Market" value={p.dom > 0 ? `${p.dom} days` : 'N/A'} />
                  {p.sqft > 0 && p.price > 0 && <Row label="Price per SqFt" value={fmt$(p.price / p.sqft)} />}
                  {p.mlsNumber && <Row label="MLS #" value={p.mlsNumber} />}
                  {p.ownerType && <Row label="Owner Type" value={p.ownerType} />}
                </div>
              </Section>

              <Section title="Market Scenarios">
                <div className="px-4 py-2">
                  <Row label="Conservative ARV (−10%)" value={fmt$(p.arvConservative)} cls="text-orange-600" />
                  <Row label="Base ARV (market rate)" value={fmt$(p.arv)} cls="text-gold-600" />
                  <Row label="Aggressive ARV (+12%)" value={fmt$(p.arvAggressive)} cls="text-emerald-700" />
                </div>
              </Section>
            </div>
          )}

          {/* DEAL ANALYSIS */}
          {tab === 'deal' && (
            <div>
              <Section title="P&L Breakdown">
                <div className="px-4 py-2">
                  <Row label="Purchase Price" value={fmt$(p.price)} />
                  <Row label="Est. Rehab Cost" value={`− ${fmt$(p.rehabCost)}`} cls="text-red-600" />
                  <Row label="Closing Costs (buy)" value={`− ${fmt$(p.closingBuyNum)}`} cls="text-red-600" />
                  <Row label={`Holding Costs (${p.holdMonths}mo)`} value={`− ${fmt$(p.holdingCost)}`} cls="text-red-600" />
                  <div className="border-t border-slate-300 my-1.5" />
                  <Row label="Total Invested" value={fmt$(p.totalInvested)} />
                  <Row label="Est ARV" value={fmt$(p.arv)} cls="text-gold-600" />
                  <Row label="Agent Commission (6%)" value={`− ${fmt$(p.sellingComm)}`} cls="text-red-600" />
                  <Row label="Closing Costs (sell)" value={`− ${fmt$(p.closingSell)}`} cls="text-red-600" />
                  <div className="border-t border-slate-300 my-1.5" />
                  <Row label="NET PROFIT" value={fmt$(p.profit)} cls={`text-base font-bold ${p.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`} />
                </div>
                <div className="px-4 pb-3">
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1.5">
                    <span>Profit margin</span>
                    <span>{p.arv > 0 ? Math.max(0, (p.profit / p.arv) * 100).toFixed(1) : 0}%</span>
                  </div>
                  <div className="h-2 bg-blue-900 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${p.profit >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(100, p.arv > 0 ? Math.max(0, (p.profit / p.arv) * 100) : 0)}%` }} />
                  </div>
                </div>
              </Section>

              <Section title="70% Rule">
                <div className="px-4 py-2">
                  <Row label="Max Offer (70% Rule)" value={fmt$(p.momsRule)} cls="text-gold-600" />
                  <Row label="List Price" value={fmt$(p.price)} />
                  <Row label="Spread vs Max" value={`${fmt$(Math.abs(p.momsRule - p.price))} ${p.underMoms ? '✓ under' : '✗ over'}`} cls={p.underMoms ? 'text-emerald-700' : 'text-red-600'} />
                  <Row label="Equity Gap" value={`${p.equityPct.toFixed(1)}%`} />
                  <Row label="ARV Spread" value={fmt$(p.spread)} cls="text-gold-600" />
                </div>
              </Section>

              <Section title="Returns Summary">
                <div className="px-4 py-2">
                  <Row label="Total ROI" value={p.roi.toFixed(2) + '%'} cls={p.roi >= 0 ? 'text-emerald-700' : 'text-red-600'} />
                  <Row label="Annualized ROI" value={p.annualizedROI.toFixed(2) + '%'} cls="text-[#7a9fe8]" />
                  <Row label="Cash-on-Cash" value={p.cashOnCash.toFixed(2) + '%'} />
                  <Row label="Cash Required" value={fmt$(p.totalCash)} />
                  <Row label="Strategy" value={p.strategy} cls="text-[#7a9fe8]" />
                </div>
              </Section>
            </div>
          )}

          {tab === 'calculator' && <CalcTab p={p} />}
          {tab === 'comps'      && <CompsTab p={p} />}
          {tab === 'ai'         && <AITab p={p} />}
        </div>
      </div>
    </div>
  )
}
