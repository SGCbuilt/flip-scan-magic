import { useEscapeKey } from '../lib/useEscapeKey'
import { useState, useEffect } from 'react'
import { AnalyzedProperty, SearchParams } from '../types'
import { fmt$ } from '../lib/utils'
import { fetchComparables } from '../lib/rentcast'
import { getAIAnalysis, generateQuickInsight, getDealVariants, getPropertyPhotos, runDeepScan, fetchDeepScanPermits, fetchDeepScanDistress, fetchDeepScanSummary, type DealVariants, type DeepScanResult } from '../lib/aiAnalysis'

// ── DEEP SCAN TAB ─────────────────────────────────────────────────────────
type StepKey = 'photos' | 'permits' | 'distress' | 'variants' | 'summary'
type StepStatus = 'pending' | 'running' | 'done' | 'error'
interface StepState { key: StepKey; label: string; etaSec: number; status: StepStatus; elapsedMs?: number; note?: string; error?: string }

const INITIAL_STEPS: StepState[] = [
  { key: 'photos',   label: 'Pull property photos',        etaSec: 5,  status: 'pending' },
  { key: 'permits',  label: 'Search permits & violations', etaSec: 6,  status: 'pending' },
  { key: 'distress', label: 'Scan distress signals',       etaSec: 6,  status: 'pending' },
  { key: 'variants', label: 'AI strategy variants',        etaSec: 10, status: 'pending' },
  { key: 'summary',  label: 'Executive summary',           etaSec: 8,  status: 'pending' },
]

function DeepScanTab({ p }: { p: AnalyzedProperty }) {
  const [data, setData] = useState<DeepScanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [steps, setSteps] = useState<StepState[]>(INITIAL_STEPS)
  const [tick, setTick] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)

  // 1Hz tick while running so ETAs update live
  useEffect(() => {
    if (!loading) return
    const iv = setInterval(() => setTick(t => t + 1), 500)
    return () => clearInterval(iv)
  }, [loading])

  const run = async () => {
    setLoading(true); setError(''); setData(null); setStartedAt(Date.now())
    setSteps(INITIAL_STEPS.map(s => ({ ...s })))

    const mark = (key: StepKey, patch: Partial<StepState>) =>
      setSteps(prev => prev.map(s => s.key === key ? { ...s, ...patch } : s))

    const runStep = async <T,>(key: StepKey, fn: () => Promise<T>, noteFor: (r: T) => string): Promise<T | null> => {
      const t0 = Date.now()
      mark(key, { status: 'running' })
      try {
        const r = await fn()
        mark(key, { status: 'done', elapsedMs: Date.now() - t0, note: noteFor(r) })
        return r
      } catch (e: any) {
        mark(key, { status: 'error', elapsedMs: Date.now() - t0, error: e?.message || 'Failed' })
        return null
      }
    }

    try {
      const photos = await runStep('photos', () => getPropertyPhotos(p),
        r => `${r.count} photos · ${r.source}`)
      const permits = await runStep('permits', () => fetchDeepScanPermits(p),
        r => `${r.permits.length} permits · ${r.violations.length} violations`)
      const distress = await runStep('distress', () => fetchDeepScanDistress(p),
        r => `${r.signals.length} signals`)
      const variants = await runStep('variants', () => getDealVariants(p),
        r => `Pick: ${r.recommendedStrategy.toUpperCase()}`)
      const summary = await runStep('summary', () => fetchDeepScanSummary(p, {
        deal: {
          listPrice: p.price, arv: p.arv, rehab: p.rehabCost,
          profit: p.profit, roi: p.roi, seventyPctMax: p.momsRule,
        },
        permitsFound: permits?.permits.length ?? 0,
        violationsFound: permits?.violations.length ?? 0,
        distressSignals: (distress?.signals || []).map(s => s.flags).flat(),
        photosFound: photos?.count ?? 0,
        recommendedStrategy: variants?.recommendedStrategy ?? null,
        topRisk: variants?.topRisk ?? null,
      }), r => r ? 'Ready' : 'Empty')

      setData({
        address: `${p.addr}, ${p.city}, ${p.state} ${p.zip}`,
        generatedAt: new Date().toISOString(),
        photos: { list: photos?.photos || [], source: photos?.source || 'none', count: photos?.count || 0 },
        permits: {
          permits: permits?.permits || [],
          violations: permits?.violations || [],
          source: permits?.source || 'none',
        },
        distress: { signals: distress?.signals || [], source: distress?.source || 'none' },
        variants: variants || null,
        summary: summary || '',
      })
    } catch (e: any) {
      setError(e?.message || 'Deep scan failed')
    } finally {
      setLoading(false)
    }
  }

  if (!data && !loading && !error) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-3">🎯</div>
        <h3 className="text-lg font-bold text-[var(--sgc-black)] mb-2">Full Deep Scan</h3>
        <p className="text-xs text-[var(--sgc-gray-mid)] mb-5 max-w-md mx-auto leading-relaxed">
          One click runs everything: photos, permits, code violations, distress signals,
          all 3 exit strategies, and an AI-written executive summary you can hand to a lender or partner.
        </p>
        <button onClick={run}
          className="bg-[var(--sgc-navy)] hover:bg-[#1a3a8f] text-white text-xs font-bold tracking-widest uppercase px-6 py-3 rounded-xl cursor-pointer border-none shadow-lg">
          ⚡ Run Deep Scan
        </button>
        <div className="text-[10px] text-[var(--sgc-gray-mid)] mt-3">
          Takes ~{INITIAL_STEPS.reduce((s, x) => s + x.etaSec, 0)}s · uses AI credits
        </div>
      </div>
    )
  }

  // Progress panel (also shown alongside results after complete)
  const totalEta = steps.reduce((s, x) => s + x.etaSec, 0)
  const doneCount = steps.filter(s => s.status === 'done' || s.status === 'error').length
  const runningIdx = steps.findIndex(s => s.status === 'running')
  const elapsedSec = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0
  const remainingEta = steps
    .filter(s => s.status === 'pending' || s.status === 'running')
    .reduce((sum, s, i) => {
      if (s.status === 'running') {
        const usedSec = Math.floor(((Date.now() - (startedAt || Date.now())) / 1000)) - steps.slice(0, i).reduce((a, b) => a + Math.max(0, Math.round((b.elapsedMs || 0) / 1000)), 0)
        return sum + Math.max(1, s.etaSec - Math.max(0, usedSec))
      }
      return sum + s.etaSec
    }, 0)
  void tick // reference so 500ms rerender uses it

  const ProgressPanel = (
    <div className="bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[2px] text-[var(--sgc-navy)] font-bold">
          {loading ? 'Deep Scan in progress' : 'Deep Scan complete'}
        </div>
        <div className="text-[10px] text-[var(--sgc-gray-mid)] font-mono">
          {loading
            ? `${elapsedSec}s elapsed · ~${remainingEta}s left`
            : `${doneCount}/${steps.length} done · ${elapsedSec}s total`}
        </div>
      </div>
      <div className="h-1.5 bg-[var(--sgc-gray-border)] rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-[var(--sgc-navy)] transition-all duration-500"
          style={{ width: `${Math.min(100, (doneCount / steps.length) * 100 + (runningIdx >= 0 ? (1 / steps.length) * 50 : 0))}%` }}
        />
      </div>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-3 text-[11px]">
            <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              s.status === 'done' ? 'bg-[var(--sgc-success)] text-white'
              : s.status === 'error' ? 'bg-[var(--sgc-danger)] text-white'
              : s.status === 'running' ? 'bg-[var(--sgc-navy)] text-white' : 'bg-[var(--sgc-gray-border)] text-[var(--sgc-gray-mid)]'
            }`}>
              {s.status === 'done' ? '✓' : s.status === 'error' ? '!' : s.status === 'running'
                ? <span className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full spin" />
                : i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`font-semibold ${s.status === 'pending' ? 'text-[var(--sgc-gray-mid)]' : 'text-[var(--sgc-black)]'}`}>
                {s.label}
              </div>
              {(s.note || s.error) && (
                <div className={`text-[10px] ${s.error ? 'text-[var(--sgc-danger)]' : 'text-[var(--sgc-gray-mid)]'}`}>
                  {s.error || s.note}
                </div>
              )}
            </div>
            <div className="text-[10px] text-[var(--sgc-gray-mid)] font-mono flex-shrink-0">
              {s.status === 'done' || s.status === 'error'
                ? `${((s.elapsedMs || 0) / 1000).toFixed(1)}s`
                : s.status === 'running' ? `~${s.etaSec}s` : `~${s.etaSec}s`}
            </div>
          </li>
        ))}
      </ol>
      {loading && (
        <div className="text-[10px] text-[var(--sgc-gray-mid)] text-center mt-3">
          Total estimate: ~{totalEta}s
        </div>
      )}
    </div>
  )

  if (loading) return ProgressPanel

  if (error) return (
    <div>
      {ProgressPanel}
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
        <div className="text-xs text-[var(--sgc-danger)] mb-2">{error}</div>
        <button onClick={run} className="text-[11px] px-3 py-1.5 bg-[var(--sgc-navy)] text-white rounded-lg cursor-pointer border-none">Retry</button>
      </div>
    </div>
  )

  if (!data) return null
  const v = data.variants

  return (
    <div className="space-y-4">
      {ProgressPanel}
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[2px] text-[var(--sgc-navy)] font-bold">Deep Scan Report</div>
          <div className="text-[10px] text-[var(--sgc-gray-mid)]">Generated {new Date(data.generatedAt).toLocaleString()}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="text-[10px] px-3 py-1.5 border border-[var(--sgc-gray-border)] rounded-lg text-[var(--sgc-black)] cursor-pointer bg-white hover:bg-[var(--sgc-gray-light)]">🖨 Print</button>
          <button onClick={run} className="text-[10px] px-3 py-1.5 border border-[var(--sgc-gray-border)] rounded-lg text-[var(--sgc-gray-mid)] cursor-pointer bg-white hover:bg-[var(--sgc-gray-light)]">↻ Re-run</button>
        </div>
      </div>

      {/* SUMMARY QUICK STATS */}
      <div className="grid grid-cols-4 gap-2">
        <StatBox label="Photos" value={String(data.photos.count)} tone="navy" />
        <StatBox label="Permits" value={String(data.permits.permits.length)} tone={data.permits.permits.length > 0 ? 'navy' : 'muted'} />
        <StatBox label="Violations" value={String(data.permits.violations.length)} tone={data.permits.violations.length > 0 ? 'danger' : 'muted'} />
        <StatBox label="Distress Signals" value={String(data.distress.signals.length)} tone={data.distress.signals.length > 0 ? 'danger' : 'muted'} />
      </div>

      {/* EXECUTIVE SUMMARY */}
      {data.summary && (
        <div className="bg-[var(--sgc-navy)]/5 border border-[var(--sgc-navy)]/30 rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-[2px] text-[var(--sgc-navy)] font-bold mb-2">Executive Summary</div>
          <div className="text-xs text-[var(--sgc-black)] leading-relaxed whitespace-pre-wrap">{data.summary}</div>
        </div>
      )}

      {/* AI RECOMMENDED */}
      {v && (
        <div className="bg-white border border-[var(--sgc-gray-border)] rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-[2px] text-[var(--sgc-navy)] font-bold mb-2">Recommended Play</div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-lg font-bold text-[var(--sgc-black)] uppercase">{v.recommendedStrategy}</span>
            <span className="text-[10px] bg-[var(--sgc-navy)] text-white px-2 py-0.5 rounded-full">AI PICK</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div className="bg-[var(--sgc-gray-light)] rounded p-2">
              <div className="text-[9px] uppercase text-[var(--sgc-gray-mid)]">Flip Max Offer</div>
              <div className="font-bold text-[var(--sgc-black)]">{fmt$(v.flip.maxOffer)}</div>
            </div>
            <div className="bg-[var(--sgc-gray-light)] rounded p-2">
              <div className="text-[9px] uppercase text-[var(--sgc-gray-mid)]">Wholesale Fee</div>
              <div className="font-bold text-[var(--sgc-black)]">{fmt$(v.wholesale.assignmentFeeLow)}–{fmt$(v.wholesale.assignmentFeeHigh)}</div>
            </div>
            <div className="bg-[var(--sgc-gray-light)] rounded p-2">
              <div className="text-[9px] uppercase text-[var(--sgc-gray-mid)]">Rental Cashflow</div>
              <div className="font-bold text-[var(--sgc-black)]">{fmt$(v.rental.monthlyCashflow)}/mo</div>
            </div>
          </div>
          <div className="text-[10px] text-[var(--sgc-gray-mid)] mt-2 italic">Top risk: {v.topRisk}</div>
        </div>
      )}

      {/* PERMITS */}
      <div className="bg-white border border-[var(--sgc-gray-border)] rounded-xl p-4">
        <div className="text-[10px] uppercase tracking-[2px] text-[var(--sgc-navy)] font-bold mb-2">Permits & Inspections</div>
        {data.permits.permits.length === 0
          ? <div className="text-[11px] text-[var(--sgc-gray-mid)]">No permit records surfaced in public search.</div>
          : <ul className="space-y-1.5">
              {data.permits.permits.map((r, i) => (
                <li key={i} className="text-[11px]">
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-[var(--sgc-navy)] font-semibold hover:underline">{r.title}</a>
                  {r.description && <div className="text-[10px] text-[var(--sgc-gray-mid)]">{r.description}</div>}
                </li>
              ))}
            </ul>}
      </div>

      {/* VIOLATIONS */}
      <div className={`border rounded-xl p-4 ${data.permits.violations.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-[var(--sgc-gray-border)]'}`}>
        <div className="text-[10px] uppercase tracking-[2px] text-[var(--sgc-danger)] font-bold mb-2">Code Violations</div>
        {data.permits.violations.length === 0
          ? <div className="text-[11px] text-[var(--sgc-gray-mid)]">No violation records surfaced.</div>
          : <ul className="space-y-1.5">
              {data.permits.violations.map((r, i) => (
                <li key={i} className="text-[11px]">
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-[var(--sgc-danger)] font-semibold hover:underline">{r.title}</a>
                  {r.description && <div className="text-[10px] text-[var(--sgc-gray-mid)]">{r.description}</div>}
                </li>
              ))}
            </ul>}
      </div>

      {/* DISTRESS */}
      <div className={`border rounded-xl p-4 ${data.distress.signals.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-[var(--sgc-gray-border)]'}`}>
        <div className="text-[10px] uppercase tracking-[2px] text-amber-700 font-bold mb-2">Distress Signals</div>
        {data.distress.signals.length === 0
          ? <div className="text-[11px] text-[var(--sgc-gray-mid)]">No foreclosure / tax / probate / eviction signals detected in public search.</div>
          : <ul className="space-y-1.5">
              {data.distress.signals.map((s, i) => (
                <li key={i} className="text-[11px]">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {s.flags.map(f => <span key={f} className="text-[9px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-full uppercase font-bold">{f}</span>)}
                  </div>
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-[var(--sgc-navy)] font-semibold hover:underline">{s.title}</a>
                  {s.description && <div className="text-[10px] text-[var(--sgc-gray-mid)]">{s.description}</div>}
                </li>
              ))}
            </ul>}
      </div>

      {/* PHOTO STRIP */}
      {data.photos.list.length > 0 && (
        <div className="bg-white border border-[var(--sgc-gray-border)] rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-[2px] text-[var(--sgc-navy)] font-bold mb-2">Photos ({data.photos.count} · {data.photos.source})</div>
          <div className="grid grid-cols-4 gap-2">
            {data.photos.list.slice(0, 8).map((url, i) => (
              <img key={i} src={url} alt="" loading="lazy" className="aspect-square object-cover rounded-lg border border-[var(--sgc-gray-border)]" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, tone }: { label: string; value: string; tone: 'navy' | 'danger' | 'muted' }) {
  const cls = tone === 'danger' ? 'text-[var(--sgc-danger)]' : tone === 'navy' ? 'text-[var(--sgc-navy)]' : 'text-[var(--sgc-gray-mid)]'
  return (
    <div className="bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-lg p-2 text-center">
      <div className="text-[9px] uppercase tracking-wider text-[var(--sgc-gray-mid)] mb-0.5">{label}</div>
      <div className={`text-lg font-bold ${cls}`}>{value}</div>
    </div>
  )
}
import { fetchRentEstimate } from '../lib/market'

interface Props {
  property: AnalyzedProperty
  params: SearchParams
  onClose: () => void
}

type ModalTab = 'overview' | 'deepscan' | 'photos' | 'deal' | 'calculator' | 'comps' | 'ai' | 'strategies'

const Row = ({ label, value, cls = '' }: { label: string; value: string; cls?: string }) => (
  <div className="flex justify-between items-center py-2 border-b border-[var(--sgc-gray-border)]/60 last:border-0 text-sm">
    <span className="text-[var(--sgc-gray-mid)] text-xs">{label}</span>
    <span className={`font-semibold text-xs ${cls || 'text-[var(--sgc-black)]'}`}>{value}</span>
  </div>
)

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-5">
    <div className="text-[10px] tracking-[2px] uppercase text-[var(--sgc-navy)] font-semibold mb-2">{title}</div>
    <div className="bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl overflow-hidden">{children}</div>
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

  const ic = "w-full bg-[var(--sgc-gray-border)] border border-[var(--sgc-gray-border)] rounded-lg text-[var(--sgc-black)] font-mono text-xs px-3 py-2 outline-none focus:border-[var(--sgc-navy)]/60 transition-colors"

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl p-4">
          <div className="text-[10px] tracking-[2px] uppercase text-[var(--sgc-navy)] mb-3">Acquisition</div>
          <div className="space-y-2">
            {[
              { label: 'Purchase Price', val: purchase, set: setPurchase },
              { label: 'Rehab Cost', val: rehab, set: setRehab },
              { label: 'Down Payment %', val: downPct, set: setDownPct },
              { label: 'Closing Costs Buy %', val: closeBuy, set: setCloseBuy },
            ].map(f => (
              <div key={f.label}>
                <div className="text-[10px] text-[var(--sgc-gray-mid)] mb-1">{f.label}</div>
                <input className={ic} type="number" value={f.val} onChange={e => f.set(parseFloat(e.target.value) || 0)} />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl p-4">
          <div className="text-[10px] tracking-[2px] uppercase text-[var(--sgc-navy)] mb-3">Exit & Hold</div>
          <div className="space-y-2">
            {[
              { label: 'After Repair Value', val: arv, set: setArv },
              { label: 'Hold Months', val: hold, set: setHold },
              { label: 'Hard Money Rate % / yr', val: rate, set: setRate },
              { label: 'Agent Commission %', val: comm, set: setComm },
              { label: 'Closing Costs Sell %', val: closeSell, set: setCloseSell },
            ].map(f => (
              <div key={f.label}>
                <div className="text-[10px] text-[var(--sgc-gray-mid)] mb-1">{f.label}</div>
                <input className={ic} type="number" step="0.5" value={f.val} onChange={e => f.set(parseFloat(e.target.value) || 0)} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl p-4 mb-4">
        <div className="text-[10px] tracking-[2px] uppercase text-[var(--sgc-navy)] mb-3">Deal Results</div>
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { l: 'Net Profit',     v: fmt$(profit),         c: profit >= 0 ? 'text-[var(--sgc-success)]' : 'text-[var(--sgc-danger)]' },
            { l: 'Total ROI',      v: roi.toFixed(2) + '%', c: roi >= 0 ? 'text-[var(--sgc-success)]' : 'text-[var(--sgc-danger)]' },
            { l: 'Annualized ROI', v: annRoi.toFixed(2)+'%', c: 'text-[var(--sgc-navy)]' },
            { l: 'Cash Required',  v: fmt$(totalCash),       c: 'text-[var(--sgc-black)]' },
          ].map(m => (
            <div key={m.l} className="bg-[var(--sgc-gray-border)]/60 rounded-lg p-3 text-center">
              <div className="text-[9px] text-[var(--sgc-gray-mid)] uppercase tracking-wider mb-1">{m.l}</div>
              <div className={`text-base font-bold ${m.c}`}>{m.v}</div>
            </div>
          ))}
        </div>
        <Row label="Holding Costs" value={`-${fmt$(holdCost)}`} cls="text-[var(--sgc-danger)]" />
        <Row label="Closing Costs (buy)" value={`-${fmt$(closingBuy)}`} cls="text-[var(--sgc-danger)]" />
        <Row label="Total Investment" value={fmt$(totalIn)} />
        <Row label="Commission + Closing (sell)" value={`-${fmt$(sellComm + closingS)}`} cls="text-[var(--sgc-danger)]" />
        <Row label="70% Rule Max Offer" value={fmt$(momsMax)} cls="text-[var(--sgc-navy)]" />
        <Row
          label="vs 70% Rule"
          value={purchase <= momsMax ? `✓ Under by ${fmt$(momsMax - purchase)}` : `✗ Over by ${fmt$(purchase - momsMax)}`}
          cls={purchase <= momsMax ? 'text-[var(--sgc-success)]' : 'text-[var(--sgc-danger)]'}
        />
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-[var(--sgc-gray-mid)] mb-1.5">
            <span>Profit margin</span><span>{profitPct.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-[var(--sgc-gray-border)] rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${profit >= 0 ? 'bg-[var(--sgc-success)]' : 'bg-[var(--sgc-danger)]'}`} style={{ width: `${Math.min(100, profitPct)}%` }} />
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
      <div className="w-8 h-8 border-2 border-[var(--sgc-gray-border)] border-t-[#1a3a8f] rounded-full spin mb-3" />
      <div className="text-xs text-[var(--sgc-gray-mid)]">Fetching comparables...</div>
    </div>
  )

  if (error) return <div className="p-4 text-xs text-[var(--sgc-danger)]">Error: {error}</div>

  if (!comps.length) return (
    <div className="flex flex-col items-center justify-center h-48 text-[var(--sgc-gray-mid)]">
      <div className="text-3xl mb-2 opacity-30">🔍</div>
      <div className="text-sm">No comparables found in radius</div>
    </div>
  )

  const avgSale = comps.reduce((s, c) => s + (c.price || 0), 0) / comps.length

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl p-3 text-center">
          <div className="text-[9px] text-[var(--sgc-gray-mid)] uppercase tracking-wider mb-1">Avg Sale</div>
          <div className="text-base font-bold text-[var(--sgc-navy)]">{fmt$(avgSale)}</div>
        </div>
        <div className="bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl p-3 text-center">
          <div className="text-[9px] text-[var(--sgc-gray-mid)] uppercase tracking-wider mb-1">Subject Price</div>
          <div className="text-base font-bold text-[var(--sgc-black)]">{fmt$(p.price)}</div>
        </div>
        <div className="bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl p-3 text-center">
          <div className="text-[9px] text-[var(--sgc-gray-mid)] uppercase tracking-wider mb-1">vs Comps</div>
          <div className={`text-base font-bold ${p.price <= avgSale ? 'text-[var(--sgc-success)]' : 'text-[var(--sgc-danger)]'}`}>
            {p.price <= avgSale ? '↓ Below' : '↑ Above'} avg
          </div>
        </div>
      </div>
      <div className="bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--sgc-gray-border)] bg-[var(--sgc-gray-border)]/50">
              {['Address','Price','Bd/Ba','SqFt','$/SqFt'].map(h => (
                <th key={h} className="text-left text-[10px] uppercase tracking-widest text-[var(--sgc-gray-mid)] py-2.5 px-3 font-normal first:pl-4">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comps.map((c, i) => {
              const psf = c.squareFootage ? c.price / c.squareFootage : 0
              return (
                <tr key={i} className="border-b border-[var(--sgc-gray-border)]/40 last:border-0 hover:bg-[var(--sgc-gray-border)]/30">
                  <td className="py-2 px-3 pl-4 text-[var(--sgc-gray-mid)] max-w-[200px] truncate">{c.formattedAddress || c.addressLine1}</td>
                  <td className="py-2 px-3 text-[var(--sgc-navy)] font-semibold">{fmt$(c.price)}</td>
                  <td className="py-2 px-3 text-[var(--sgc-gray-mid)]">{c.bedrooms || '?'}/{c.bathrooms || '?'}</td>
                  <td className="py-2 px-3 text-[var(--sgc-gray-mid)]">{c.squareFootage?.toLocaleString() || '—'}</td>
                  <td className="py-2 px-3 text-[var(--sgc-gray-mid)]">{psf ? fmt$(psf) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── PHOTOS TAB ────────────────────────────────────────────────────────────
function PhotosTab({ p }: { p: AnalyzedProperty }) {
  const [photos, setPhotos] = useState<string[]>([])
  const [source, setSource] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setError('')
    getPropertyPhotos(p)
      .then(r => { setPhotos(r.photos); setSource(r.source) })
      .catch(e => setError(e.message || 'Failed to load photos'))
      .finally(() => setLoading(false))
  }, [p.addr])

  if (loading) return (
    <div className="flex items-center gap-3 p-6 bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl">
      <div className="w-5 h-5 border-2 border-[var(--sgc-gray-border)] border-t-[var(--sgc-navy)] rounded-full spin" />
      <div className="text-xs text-[var(--sgc-gray-mid)]">Pulling property photos (RentCast → Firecrawl)…</div>
    </div>
  )
  if (error) return <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-[var(--sgc-danger)]">{error}</div>
  if (!photos.length) return (
    <div className="p-6 bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl text-center">
      <div className="text-xs text-[var(--sgc-gray-mid)] mb-2">No photos found from any source.</div>
      <div className="text-[10px] text-[var(--sgc-gray-mid)]">Try the Zillow / Realtor links in the header.</div>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] tracking-[2px] uppercase text-[var(--sgc-navy)] font-semibold">
          {photos.length} Photos
        </div>
        <div className="text-[10px] text-[var(--sgc-gray-mid)]">Source: {source}</div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((url, i) => (
          <button key={i} onClick={() => setActive(url)}
            className="relative aspect-square rounded-lg overflow-hidden border border-[var(--sgc-gray-border)] bg-[var(--sgc-gray-light)] hover:border-[var(--sgc-navy)] transition-colors cursor-pointer p-0">
            <img src={url} alt={`Property photo ${i+1}`} loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2' }} />
          </button>
        ))}
      </div>

      {active && (
        <div className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-6" onClick={() => setActive(null)}>
          <img src={active} alt="Enlarged" className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setActive(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/90 rounded-full text-[var(--sgc-black)] font-bold cursor-pointer border-none">✕</button>
        </div>
      )}
    </div>
  )
}

// ── STRATEGIES TAB (variants) ─────────────────────────────────────────────
function StrategiesTab({ p }: { p: AnalyzedProperty }) {
  const [v, setV] = useState<DealVariants | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = async () => {
    setLoading(true); setError(''); setV(null)
    try { setV(await getDealVariants(p)) }
    catch (e: any) { setError(e.message || 'Failed to generate strategies') }
    finally { setLoading(false) }
  }

  useEffect(() => { run() }, [p.id])

  const verdictCls = (verd: string) =>
    verd === 'Pursue' ? 'bg-[var(--sgc-success)] text-white'
    : verd === 'Negotiate' ? 'bg-amber-500 text-white'
    : 'bg-[var(--sgc-danger)] text-white'

  if (loading) return (
    <div className="flex items-center gap-3 p-4 bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl">
      <div className="w-5 h-5 border-2 border-[var(--sgc-gray-border)] border-t-[var(--sgc-navy)] rounded-full spin" />
      <div className="text-xs text-[var(--sgc-gray-mid)]">AI is comparing all exit strategies…</div>
    </div>
  )
  if (error) return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
      <div className="text-xs text-[var(--sgc-danger)] mb-2">{error}</div>
      <button onClick={run} className="text-[11px] px-3 py-1.5 bg-[var(--sgc-navy)] text-white rounded-lg cursor-pointer border-none">Retry</button>
    </div>
  )
  if (!v) return null

  const StratCard = ({ title, verdict, rows, reasoning, recommended }: {
    title: string; verdict: string; rows: [string, string][]; reasoning: string; recommended: boolean
  }) => (
    <div className={`rounded-xl border p-4 mb-3 ${recommended ? 'border-[var(--sgc-navy)] bg-[var(--sgc-navy)]/5' : 'border-[var(--sgc-gray-border)] bg-white'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="text-xs font-bold tracking-wide uppercase text-[var(--sgc-black)]">{title}</div>
          {recommended && <span className="text-[9px] bg-[var(--sgc-navy)] text-white px-2 py-0.5 rounded-full">AI PICK</span>}
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${verdictCls(verdict)}`}>{verdict}</span>
      </div>
      <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 mb-2">
        {rows.map(([k, val]) => (
          <div key={k} className="flex justify-between text-[11px]">
            <span className="text-[var(--sgc-gray-mid)]">{k}</span>
            <span className="font-semibold text-[var(--sgc-black)]">{val}</span>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-[var(--sgc-gray-mid)] italic leading-relaxed border-t border-[var(--sgc-gray-border)] pt-2 mt-2">{reasoning}</div>
    </div>
  )

  return (
    <div>
      <div className="bg-[var(--sgc-navy)]/10 border border-[var(--sgc-navy)]/30 rounded-xl p-3 mb-3">
        <div className="text-[10px] uppercase tracking-[2px] text-[var(--sgc-navy)] font-bold mb-1">Top Risk</div>
        <div className="text-xs text-[var(--sgc-black)]">{v.topRisk}</div>
      </div>

      <StratCard title="🔨 Fix & Flip" verdict={v.flip.verdict} recommended={v.recommendedStrategy === 'flip'}
        rows={[['Max Offer', fmt$(v.flip.maxOffer)], ['Projected Profit', fmt$(v.flip.projectedProfit)], ['ROI', v.flip.roiPct.toFixed(1)+'%'], ['vs List', fmt$(p.price - v.flip.maxOffer)+' off']]}
        reasoning={v.flip.reasoning} />

      <StratCard title="📄 Wholesale / Assign" verdict={v.wholesale.verdict} recommended={v.recommendedStrategy === 'wholesale'}
        rows={[['Fee Low', fmt$(v.wholesale.assignmentFeeLow)], ['Fee High', fmt$(v.wholesale.assignmentFeeHigh)], ['Buyer', v.wholesale.buyerProfile], ['', '']]}
        reasoning={v.wholesale.reasoning} />

      <StratCard title="🏠 Rental / BRRRR" verdict={v.rental.verdict} recommended={v.recommendedStrategy === 'rental'}
        rows={[['Monthly Rent', fmt$(v.rental.monthlyRent)], ['Cashflow', fmt$(v.rental.monthlyCashflow)+'/mo'], ['Cap Rate', v.rental.capRatePct.toFixed(2)+'%'], ['Refi Potential', v.rental.refiPotential]]}
        reasoning={v.rental.reasoning} />

      <div className="mt-4">
        <div className="text-[10px] tracking-[2px] uppercase text-[var(--sgc-navy)] font-bold mb-2">Rehab Strategy Tiers</div>
        <div className="grid grid-cols-3 gap-2">
          {(['light','medium','heavy'] as const).map(k => {
            const t = v.rehabTiers[k]
            return (
              <div key={k} className="border border-[var(--sgc-gray-border)] rounded-lg p-3 bg-[var(--sgc-gray-light)]">
                <div className="text-[10px] uppercase font-bold text-[var(--sgc-navy)] mb-1">{k}</div>
                <div className="text-sm font-bold text-[var(--sgc-black)]">{fmt$(t.cost)}</div>
                <div className="text-[10px] text-[var(--sgc-success)] mb-1.5">+{fmt$(t.arvImpact)} ARV</div>
                <div className="text-[10px] text-[var(--sgc-gray-mid)] leading-snug">{t.scope}</div>
              </div>
            )
          })}
        </div>
      </div>

      <button onClick={run} className="mt-4 text-[10px] text-[var(--sgc-gray-mid)] hover:text-[var(--sgc-black)] cursor-pointer bg-transparent border-none">
        ↻ Regenerate strategies
      </button>
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
      <div className="bg-[var(--sgc-navy)]/10 border border-[var(--sgc-navy)]/30 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 text-[10px] tracking-[2px] uppercase text-[var(--sgc-navy)] mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#7a9fe8] pulse-dot" />
          Quick Intelligence
        </div>
        <p className="text-xs text-[var(--sgc-black)] leading-relaxed">{quickInsight}</p>
      </div>

      {!aiText && !loading && (
        <button onClick={run}
          className="w-full bg-[var(--sgc-navy)] hover:bg-[#2a4aaf] text-[var(--sgc-black)] text-xs font-bold tracking-widest uppercase py-3 rounded-xl transition-colors cursor-pointer mb-4">
          ⬡ Run Deep AI Analysis
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-3 p-4 bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl mb-4">
          <div className="w-5 h-5 border-2 border-[var(--sgc-gray-border)] border-t-[#7a9fe8] rounded-full spin flex-shrink-0" />
          <div className="text-xs text-[var(--sgc-gray-mid)]">Claude is analyzing this deal...</div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-950/30 border border-red-800/40 rounded-xl text-xs text-[var(--sgc-danger)] mb-4">
          {error.includes('VITE_ANTHROPIC_API_KEY')
            ? '⚠️ Add your Anthropic API key to .env as VITE_ANTHROPIC_API_KEY'
            : `Error: ${error}`}
        </div>
      )}

      {aiText && (
        <div className="bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-xl p-4">
          <div className="flex items-center gap-2 text-[10px] tracking-[2px] uppercase text-[var(--sgc-navy)] mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[#7a9fe8]" />
            Deep AI Analysis
          </div>
          <div className="text-xs text-[var(--sgc-black)] leading-relaxed whitespace-pre-wrap">{aiText}</div>
          <button onClick={run} className="mt-3 text-[10px] text-[var(--sgc-gray-mid)] hover:text-[var(--sgc-gray-mid)] cursor-pointer bg-transparent border-none">
            ↻ Re-analyze
          </button>
        </div>
      )}
    </div>
  )
}

// ── RENT ESTIMATE BLOCK ───────────────────────────────────────────────────
function RentEstimateBlock({ p }: { p: AnalyzedProperty }) {
  const [rent, setRent] = useState<{ rent: number; low: number; high: number } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!p.addr || p.sqft === 0) return
    setLoading(true)
    fetchRentEstimate(p.addr, p.propType, p.beds, p.baths, p.sqft)
      .then(r => { if (r && r.rent > 0) setRent(r) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [p.addr])

  if (loading) return (
    <div className="bg-amber-950/20 border border-amber-800/30 rounded-xl p-4 mb-5">
      <div className="flex items-center gap-2 text-[10px] text-[var(--sgc-navy)] uppercase tracking-wider">
        <div className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />
        Loading Rent Estimate...
      </div>
    </div>
  )

  if (!rent) return null

  const grossYield = p.price > 0 ? (rent.rent * 12 / p.price) * 100 : 0
  const monthlyCashFlow = rent.rent - (p.price * 0.008) - (p.price * 0.01 / 12)
  const priceToRent = p.price > 0 && rent.rent > 0 ? p.price / (rent.rent * 12) : 0
  const onePercentRule = p.price > 0 ? rent.rent / p.price * 100 : 0

  return (
    <div className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-4 mb-5">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[2px] text-[var(--sgc-navy)] mb-3">
        <span>🏠 Rental Market Analysis</span>
        <div className="text-[9px] text-amber-600">· RentCast AVM</div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-[var(--sgc-gray-light)]/60 rounded-lg p-3">
          <div className="text-[9px] text-[var(--sgc-gray-mid)] uppercase tracking-wider mb-1">Est Monthly Rent</div>
          <div className="text-xl font-bold text-[var(--sgc-navy)]">{fmt$(rent.rent)}<span className="text-xs text-[var(--sgc-gray-mid)]">/mo</span></div>
          <div className="text-[10px] text-[var(--sgc-gray-mid)]">{fmt$(rent.low)} – {fmt$(rent.high)} range</div>
        </div>
        <div className="bg-[var(--sgc-gray-light)]/60 rounded-lg p-3">
          <div className="text-[9px] text-[var(--sgc-gray-mid)] uppercase tracking-wider mb-1">Gross Annual Yield</div>
          <div className={`text-xl font-bold ${grossYield > 8 ? 'text-[var(--sgc-success)]' : grossYield > 5 ? 'text-[var(--sgc-navy)]' : 'text-[var(--sgc-danger)]'}`}>
            {grossYield.toFixed(1)}%
          </div>
          <div className="text-[10px] text-[var(--sgc-gray-mid)]">{grossYield > 8 ? 'Excellent' : grossYield > 5 ? 'Good' : 'Thin'} yield</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <div className="text-[9px] text-[var(--sgc-gray-mid)] uppercase tracking-wider mb-0.5">Est Cash Flow</div>
          <div className={`text-sm font-bold ${monthlyCashFlow >= 0 ? 'text-[var(--sgc-success)]' : 'text-[var(--sgc-danger)]'}`}>{fmt$(monthlyCashFlow)}/mo</div>
          <div className="text-[9px] text-[var(--sgc-gray-mid)]">After est. PITI</div>
        </div>
        <div className="text-center">
          <div className="text-[9px] text-[var(--sgc-gray-mid)] uppercase tracking-wider mb-0.5">Price-to-Rent</div>
          <div className={`text-sm font-bold ${priceToRent < 15 ? 'text-[var(--sgc-success)]' : priceToRent < 20 ? 'text-[var(--sgc-navy)]' : 'text-[var(--sgc-danger)]'}`}>
            {priceToRent.toFixed(1)}x
          </div>
          <div className="text-[9px] text-[var(--sgc-gray-mid)]">&lt;15 ideal</div>
        </div>
        <div className="text-center">
          <div className="text-[9px] text-[var(--sgc-gray-mid)] uppercase tracking-wider mb-0.5">1% Rule</div>
          <div className={`text-sm font-bold ${onePercentRule >= 1 ? 'text-[var(--sgc-success)]' : 'text-[var(--sgc-danger)]'}`}>
            {onePercentRule.toFixed(2)}% {onePercentRule >= 1 ? '✓' : '✗'}
          </div>
          <div className="text-[9px] text-[var(--sgc-gray-mid)]">Need ≥ 1%</div>
        </div>
      </div>
    </div>
  )
}

// ── MAIN MODAL ────────────────────────────────────────────────────────────
export default function PropertyModal({ property: p, params, onClose }: Props) {
  useEscapeKey(onClose)
  const [tab, setTab] = useState<ModalTab>('overview')
  useEscapeKey(onClose)

  const TABS: { id: ModalTab; label: string }[] = [
    { id: 'overview',    label: '📋 Overview'     },
    { id: 'deepscan',    label: '⚡ Deep Scan'     },
    { id: 'photos',      label: '📷 Photos'       },
    { id: 'strategies',  label: '⚡ Strategies'    },
    { id: 'deal',        label: '💰 Deal Analysis' },
    { id: 'calculator',  label: '🔢 Calculator'    },
    { id: 'comps',       label: '📊 Comps'         },
    { id: 'ai',          label: '🤖 AI Advisor'    },
  ]

  const fullAddr = `${p.addr}, ${p.city}, ${p.state} ${p.zip}`.replace(/,\s*,/g, ',').trim()
  const addrEncoded = encodeURIComponent(fullAddr)

  const isHot = p.flipScore >= 70
  const [mapMode, setMapMode] = useState<'map' | 'street'>('map')

  return (
    <div className="fixed inset-0 z-[100] flex">
      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative ml-auto w-full max-w-2xl h-full bg-white border-l border-[var(--sgc-gray-border)] flex flex-col shadow-2xl slide-in">

        {/* MAP PREVIEW */}
        <div className="flex-shrink-0 relative h-44 bg-[var(--sgc-gray-light)] overflow-hidden">
          <div className="absolute top-3 left-3 z-10 flex gap-1">
            {(['map','street'] as const).map(m => (
              <button key={m} onClick={() => setMapMode(m)}
                className={`text-[10px] uppercase tracking-wide px-2.5 py-1 rounded font-medium cursor-pointer border transition-colors
                  ${mapMode === m ? 'bg-white border-zinc-600 text-[var(--sgc-black)]' : 'bg-white/70 border-[var(--sgc-gray-border)] text-[var(--sgc-gray-mid)] hover:text-[var(--sgc-black)]'}`}>
                {m === 'map' ? '🗺 Map' : '🏠 Street'}
              </button>
            ))}
          </div>
          <iframe
            key={mapMode}
            src={mapMode === 'street'
              ? `https://maps.google.com/maps?q=${addrEncoded}&layer=c&output=embed&z=18`
              : `https://maps.google.com/maps?q=${addrEncoded}&output=embed&z=17`}
            className="w-full h-full border-0"
            loading="lazy"
            title="Property location"
          />
          <button onClick={onClose} aria-label="Close"
            className="absolute top-3 right-3 z-10 w-8 h-8 bg-white/80 hover:bg-[var(--sgc-gray-light)] border border-[var(--sgc-gray-border)] rounded-lg flex items-center justify-center text-[var(--sgc-gray-mid)] hover:text-[var(--sgc-black)] transition-colors cursor-pointer text-sm">
            ✕
          </button>
          <div className={`absolute bottom-3 right-3 z-10 w-12 h-12 rounded-full border-2 flex flex-col items-center justify-center bg-white/90
            ${p.flipScore >= 80 ? 'border-emerald-500' : p.flipScore >= 65 ? 'border-amber-500' : 'border-zinc-600'}`}>
            <span className={`text-base font-bold leading-none ${p.scoreClass}`}>{p.flipScore}</span>
            <span className={`text-[9px] font-bold ${p.scoreClass}`}>{p.scoreGrade}</span>
          </div>
        </div>

        {/* ADDRESS + LINKS */}
        <div className={`flex-shrink-0 px-6 pt-4 pb-3 border-b border-[var(--sgc-gray-border)] ${isHot ? 'bg-[var(--sgc-success-bg)]' : 'bg-[var(--sgc-gray-light)]/50'}`}>
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            {isHot && <span className="text-[9px] bg-[var(--sgc-success)] text-zinc-950 font-bold px-2 py-0.5 rounded-full">🔥 HOT DEAL</span>}
            {p.underMoms && <span className="text-[9px] border border-emerald-500/40 text-[var(--sgc-success)] px-2 py-0.5 rounded-full">70% ✓</span>}
            <span className="text-[9px] text-[var(--sgc-gray-mid)] border border-[var(--sgc-gray-border)] px-2 py-0.5 rounded-full">{p.sourceLabel}</span>
            {p.listingType && p.listingType !== 'Standard' && (
              <span className="text-[9px] text-[var(--sgc-danger)] border border-red-500/30 px-2 py-0.5 rounded-full">{p.listingType}</span>
            )}
          </div>

          {/* FULL ADDRESS — large and prominent */}
          <h2 className="text-xl font-bold text-[var(--sgc-black)] leading-tight">{p.addr}</h2>
          <p className="text-sm text-[var(--sgc-gray-mid)] mt-0.5 mb-1">
            {p.city}{p.state ? `, ${p.state}` : ''} {p.zip}
          </p>
          <div className="text-xs text-[var(--sgc-gray-mid)] flex flex-wrap gap-x-3 gap-y-0.5 mb-3">
            {p.beds > 0 && <span>{p.beds} bed · {p.baths} bath</span>}
            {p.sqft > 0 && <span>{p.sqft.toLocaleString()} sqft</span>}
            {p.yearBuilt && <span>Built {p.yearBuilt}</span>}
            {p.propType && <span>{p.propType}</span>}
            {p.dom > 0 && <span className={p.dom > 60 ? 'text-[var(--sgc-navy)]' : ''}>{p.dom}d on market</span>}
            {p.mlsNumber && <span>MLS# {p.mlsNumber}</span>}
          </div>

          {/* PHOTO LINKS */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-[var(--sgc-gray-mid)] mr-1">Photos:</span>
            {[
              { label: 'Zillow',      url: `https://www.zillow.com/homes/${addrEncoded}_rb/`,              cls: 'text-blue-400 border-blue-500/30 hover:bg-blue-500/10' },
              { label: 'Redfin',      url: `https://www.redfin.com/query/${addrEncoded}`,                  cls: 'text-[var(--sgc-danger)] border-red-500/30 hover:bg-[var(--sgc-danger)]/10' },
              { label: 'Realtor.com', url: `https://www.realtor.com/realestateandhomes-search/${addrEncoded}`, cls: 'text-orange-400 border-orange-500/30 hover:bg-orange-500/10' },
              { label: 'Google Maps', url: `https://www.google.com/maps/search/${addrEncoded}`,            cls: 'text-[var(--sgc-gray-mid)] border-[var(--sgc-gray-border)] hover:bg-zinc-700/30' },
            ].map(l => (
              <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${l.cls}`}>
                {l.label} ↗
              </a>
            ))}
            <button
              onClick={() => setTab('deepscan')}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-lg border-none cursor-pointer bg-[var(--sgc-navy)] text-white hover:bg-[#1a3a8f] shadow"
            >
              ⚡ Deep Scan
            </button>
          </div>

          {/* Quick numbers */}
          <div className="grid grid-cols-5 gap-2 mt-3">
            {[
              { l: 'List Price', v: fmt$(p.price),           c: 'text-[var(--sgc-black)]' },
              { l: 'Est ARV',    v: fmt$(p.arv),             c: 'text-[var(--sgc-navy)]' },
              { l: 'Net Profit', v: fmt$(p.profit),          c: p.profit >= 0 ? 'text-[var(--sgc-success)]' : 'text-[var(--sgc-danger)]' },
              { l: 'ROI',        v: p.roi.toFixed(1)+'%',    c: p.roi >= 0 ? 'text-[var(--sgc-success)]' : 'text-[var(--sgc-danger)]' },
              { l: 'Rehab Est',  v: fmt$(p.rehabCost),       c: 'text-orange-400' },
            ].map(m => (
              <div key={m.l} className="bg-[var(--sgc-gray-border)]/60 rounded-lg p-2.5 text-center">
                <div className="text-[9px] text-[var(--sgc-gray-mid)] uppercase tracking-wider mb-0.5">{m.l}</div>
                <div className={`text-sm font-bold ${m.c}`}>{m.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--sgc-gray-border)] bg-[var(--sgc-gray-light)]/40 flex-shrink-0 px-2">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-[11px] border-b-2 transition-colors cursor-pointer bg-transparent tracking-wide
                ${tab === t.id ? 'text-[var(--sgc-black)] border-[var(--sgc-navy)]' : 'text-[var(--sgc-gray-mid)] border-transparent hover:text-[var(--sgc-gray-mid)]'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div>
              <RentEstimateBlock p={p} />
              <Section title="Opportunity Signals">
                <div className="p-4">
                  {p.signals.length === 0 ? (
                    <div className="text-xs text-[var(--sgc-gray-mid)]">No specific signals detected</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {p.signals.map((s, i) => (
                        <span key={i} className="text-xs text-[var(--sgc-black)] bg-[var(--sgc-gray-border)] border border-[var(--sgc-gray-border)] px-3 py-1.5 rounded-lg">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              </Section>

              <Section title="Score Breakdown">
                <div className="p-4 space-y-3">
                  {[
                    { label: 'ROI Score',       score: p.scoreBreakdown.roi,    color: 'bg-[var(--sgc-success)]', weight: '30%' },
                    { label: '70% Rule Score',  score: p.scoreBreakdown.rule70, color: 'bg-[var(--sgc-navy)]',  weight: '28%' },
                    { label: 'Profit Score',    score: p.scoreBreakdown.profit, color: 'bg-teal-500',    weight: '15%' },
                    { label: 'DOM Score',       score: p.scoreBreakdown.dom,    color: 'bg-violet-500',  weight: '15%' },
                    { label: 'Equity Score',    score: p.scoreBreakdown.equity, color: 'bg-amber-500',   weight: '12%' },
                  ].map(b => (
                    <div key={b.label} className="flex items-center gap-3">
                      <div className="text-xs text-[var(--sgc-gray-mid)] w-36 flex-shrink-0">{b.label}</div>
                      <div className="flex-1 h-2 bg-[var(--sgc-gray-border)] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${b.color}`} style={{ width: `${b.score}%` }} />
                      </div>
                      <div className="text-xs text-[var(--sgc-gray-mid)] w-8 text-right">{b.score}</div>
                      <div className="text-[10px] text-[var(--sgc-gray-mid)] w-8">{b.weight}</div>
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
                  <Row label="Conservative ARV (−10%)" value={fmt$(p.arvConservative)} cls="text-orange-400" />
                  <Row label="Base ARV (market rate)" value={fmt$(p.arv)} cls="text-[var(--sgc-navy)]" />
                  <Row label="Aggressive ARV (+12%)" value={fmt$(p.arvAggressive)} cls="text-[var(--sgc-success)]" />
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
                  <Row label="Est. Rehab Cost" value={`− ${fmt$(p.rehabCost)}`} cls="text-[var(--sgc-danger)]" />
                  <Row label="Closing Costs (buy)" value={`− ${fmt$(p.closingBuyNum)}`} cls="text-[var(--sgc-danger)]" />
                  <Row label={`Holding Costs (${p.holdMonths}mo)`} value={`− ${fmt$(p.holdingCost)}`} cls="text-[var(--sgc-danger)]" />
                  <div className="border-t border-[var(--sgc-gray-border)] my-1.5" />
                  <Row label="Total Invested" value={fmt$(p.totalInvested)} />
                  <Row label="Est ARV" value={fmt$(p.arv)} cls="text-[var(--sgc-navy)]" />
                  <Row label="Agent Commission (6%)" value={`− ${fmt$(p.sellingComm)}`} cls="text-[var(--sgc-danger)]" />
                  <Row label="Closing Costs (sell)" value={`− ${fmt$(p.closingSell)}`} cls="text-[var(--sgc-danger)]" />
                  <div className="border-t border-[var(--sgc-gray-border)] my-1.5" />
                  <Row label="NET PROFIT" value={fmt$(p.profit)} cls={`text-base font-bold ${p.profit >= 0 ? 'text-[var(--sgc-success)]' : 'text-[var(--sgc-danger)]'}`} />
                </div>
                <div className="px-4 pb-3">
                  <div className="flex justify-between text-[10px] text-[var(--sgc-gray-mid)] mb-1.5">
                    <span>Profit margin</span>
                    <span>{p.arv > 0 ? Math.max(0, (p.profit / p.arv) * 100).toFixed(1) : 0}%</span>
                  </div>
                  <div className="h-2 bg-[var(--sgc-gray-border)] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${p.profit >= 0 ? 'bg-[var(--sgc-success)]' : 'bg-[var(--sgc-danger)]'}`}
                      style={{ width: `${Math.min(100, p.arv > 0 ? Math.max(0, (p.profit / p.arv) * 100) : 0)}%` }} />
                  </div>
                </div>
              </Section>

              <Section title="70% Rule">
                <div className="px-4 py-2">
                  <Row label="Max Offer (70% Rule)" value={fmt$(p.momsRule)} cls="text-[var(--sgc-navy)]" />
                  <Row label="List Price" value={fmt$(p.price)} />
                  <Row label="Spread vs Max" value={`${fmt$(Math.abs(p.momsRule - p.price))} ${p.underMoms ? '✓ under' : '✗ over'}`} cls={p.underMoms ? 'text-[var(--sgc-success)]' : 'text-[var(--sgc-danger)]'} />
                  <Row label="Equity Gap" value={`${p.equityPct.toFixed(1)}%`} />
                  <Row label="ARV Spread" value={fmt$(p.spread)} cls="text-[var(--sgc-navy)]" />
                </div>
              </Section>

              <Section title="Returns Summary">
                <div className="px-4 py-2">
                  <Row label="Total ROI" value={p.roi.toFixed(2) + '%'} cls={p.roi >= 0 ? 'text-[var(--sgc-success)]' : 'text-[var(--sgc-danger)]'} />
                  <Row label="Annualized ROI" value={p.annualizedROI.toFixed(2) + '%'} cls="text-[var(--sgc-navy)]" />
                  <Row label="Cash-on-Cash" value={p.cashOnCash.toFixed(2) + '%'} />
                  <Row label="Cash Required" value={fmt$(p.totalCash)} />
                  <Row label="Strategy" value={p.strategy} cls="text-[var(--sgc-navy)]" />
                </div>
              </Section>
            </div>
          )}

          {tab === 'calculator' && <CalcTab p={p} />}
          {tab === 'comps'      && <CompsTab p={p} />}
          {tab === 'ai'         && <AITab p={p} />}
          {tab === 'photos'     && <PhotosTab p={p} />}
          {tab === 'strategies' && <StrategiesTab p={p} />}
          {tab === 'deepscan'   && <DeepScanTab p={p} />}
        </div>
      </div>
    </div>
  )
}
