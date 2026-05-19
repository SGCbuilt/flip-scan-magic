import { useState, useEffect } from 'react'
import { fmt$ } from '../lib/utils'

interface CalcState {
  purchase: number
  rehab: number
  closeBuyPct: number
  hold: number
  rate: number
  arv: number
  commPct: number
  closeSellPct: number
}

const inputCls = "w-full bg-[#0a1f4d] border border-[#0a1f4d] rounded text-gold-400 font-mono text-xs px-2.5 py-2 outline-none focus:border-gold-500 transition-colors placeholder:text-gold-400/50"
const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] tracking-widest uppercase text-slate-500 mb-1.5">{children}</div>
)
const BlockTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] tracking-[2px] uppercase text-gold-600 mb-3">{children}</div>
)
const Row = ({ label, value, cls = '' }: { label: string; value: string; cls?: string }) => (
  <div className="flex justify-between items-center py-1.5 border-b border-white/[0.03] text-xs last:border-0">
    <span className="text-slate-500">{label}</span>
    <span className={`font-semibold ${cls || 'text-slate-900'}`}>{value}</span>
  </div>
)

export default function DealCalculator() {
  const [c, setC] = useState<CalcState>({ purchase: 200000, rehab: 40000, closeBuyPct: 3, hold: 6, rate: 10, arv: 310000, commPct: 6, closeSellPct: 2 })
  const [result, setResult] = useState<any>(null)

  const set = (key: keyof CalcState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setC(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))
  }

  useEffect(() => {
    const closingBuy = c.purchase * (c.closeBuyPct / 100)
    const holdingCost = c.purchase * (c.rate / 100) * (c.hold / 12)
    const totalIn = c.purchase + c.rehab + closingBuy + holdingCost
    const comm = c.arv * (c.commPct / 100)
    const closeSell = c.arv * (c.closeSellPct / 100)
    const netProc = c.arv - comm - closeSell
    const profit = netProc - totalIn
    const roi = totalIn > 0 ? (profit / totalIn) * 100 : 0
    const annRoi = c.hold > 0 ? roi / (c.hold / 12) : 0
    const momsMax = c.arv * 0.70 - c.rehab
    const profitPct = c.arv > 0 ? Math.min(100, Math.max(0, (profit / c.arv) * 100)) : 0
    setResult({ closingBuy, holdingCost, totalIn, comm, closeSell, profit, roi, annRoi, momsMax, profitPct })
  }, [c])

  return (
    <div className="p-6 max-w-xl">
      <div className="text-[10px] tracking-[2px] uppercase text-gold-600 mb-5 flex items-center gap-2">
        Deal Calculator
        <div className="flex-1 h-px bg-gold-500/20" />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-3">
        <BlockTitle>Purchase & Costs</BlockTitle>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Purchase Price', key: 'purchase' as const },
            { label: 'Rehab Cost', key: 'rehab' as const },
            { label: 'Closing Costs Buy %', key: 'closeBuyPct' as const },
            { label: 'Holding Months', key: 'hold' as const },
            { label: 'Financing Rate %/yr', key: 'rate' as const },
          ].map(f => (
            <div key={f.key}>
              <FieldLabel>{f.label}</FieldLabel>
              <input className={inputCls} type="number" step="any" value={c[f.key]} onChange={set(f.key)} />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-3">
        <BlockTitle>Exit / Revenue</BlockTitle>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'After Repair Value (ARV)', key: 'arv' as const },
            { label: 'Selling Commission %', key: 'commPct' as const },
            { label: 'Closing Costs Sell %', key: 'closeSellPct' as const },
          ].map(f => (
            <div key={f.key}>
              <FieldLabel>{f.label}</FieldLabel>
              <input className={inputCls} type="number" step="any" value={c[f.key]} onChange={set(f.key)} />
            </div>
          ))}
        </div>
      </div>

      {result && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <BlockTitle>Results</BlockTitle>
          <Row label="Closing Costs (buy)" value={`-${fmt$(result.closingBuy)}`} cls="text-red-600" />
          <Row label="Holding Costs" value={`-${fmt$(result.holdingCost)}`} cls="text-red-600" />
          <Row label="Total Investment" value={fmt$(result.totalIn)} />
          <Row label="Commission + Closing (sell)" value={`-${fmt$(result.comm + result.closeSell)}`} cls="text-red-600" />
          <div className="border-t border-gold-400/60 my-2 pt-2 flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-800">NET PROFIT</span>
            <span className={`text-xl font-semibold ${result.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt$(result.profit)}</span>
          </div>
          <Row label="ROI" value={result.roi.toFixed(2) + '%'} cls={result.roi >= 0 ? 'text-emerald-700' : 'text-red-600'} />
          <Row label="Annualized ROI" value={result.annRoi.toFixed(2) + '%'} />
          <Row label="70% Rule Max Offer" value={fmt$(result.momsMax)} cls="text-gold-600" />
          <Row label="Offer vs Max Offer" value={c.purchase <= result.momsMax ? `✓ Under by ${fmt$(result.momsMax - c.purchase)}` : `✗ Over by ${fmt$(c.purchase - result.momsMax)}`} cls={c.purchase <= result.momsMax ? 'text-emerald-700' : 'text-red-600'} />
          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-slate-400 mb-1">
              <span>Cost basis</span><span>Return {result.profitPct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${result.profit >= 0 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${result.profitPct}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
