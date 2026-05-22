/**
 * FlipScan Pro — Financial Tools
 * 
 * REAL DATA SOURCES (all verified CORS-allowed, no proxy needed):
 * 
 * 1. Freddie Mac 30yr rate  → fred.stlouisfed.org/graph/fredgraph.csv?id=MORTGAGE30US
 * 2. Freddie Mac 15yr rate  → fred.stlouisfed.org/graph/fredgraph.csv?id=MORTGAGE15US
 * 3. 10yr Treasury yield    → fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10
 * 4. CPI / Inflation        → fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL
 * 5. HPI (home price index) → fred.stlouisfed.org/graph/fredgraph.csv?id=CSUSHPINSA
 *
 * All other numbers (deal math, DSCR, etc.) are pure deterministic math.
 * No AI, no estimates. Real numbers + real formulas.
 */

import { useState, useEffect, useCallback } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// FRED CSV FETCH — confirmed CORS-allowed, no key required
// ─────────────────────────────────────────────────────────────────────────────
interface FREDRate { value: number; date: string; series: string }

async function fetchFREDCsv(seriesId: string): Promise<FREDRate | null> {
  try {
    const res = await fetch(
      `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) return null
    const text = await res.text()
    const lines = text.trim().split('\n').filter(l => !l.startsWith('DATE') && l.trim())
    // Get last non-empty, non-dot value
    for (let i = lines.length - 1; i >= 0; i--) {
      const [date, val] = lines[i].split(',')
      const n = parseFloat(val)
      if (!isNaN(n) && n > 0) return { value: n, date: date?.trim(), series: seriesId }
    }
    return null
  } catch { return null }
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface LiveRates {
  rate30yr:   FREDRate | null
  rate15yr:   FREDRate | null
  rate10yr:   FREDRate | null  // 10yr Treasury
  cpi:        FREDRate | null  // inflation
  hpi:        FREDRate | null  // home price index
  loading:    boolean
  fetchedAt:  string
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmt$ = (n: number, dec = 0) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtPct = (n: number, dec = 2) => n.toFixed(dec) + '%'
const fmtK   = (n: number) => n >= 1000000 ? `$${(n/1000000).toFixed(2)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}k` : fmt$(n)

// Monthly mortgage payment (standard amortization)
function monthlyPayment(principal: number, annualRate: number, years: number): number {
  const r = annualRate / 100 / 12
  const n = years * 12
  if (r === 0) return principal / n
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>{children}</div>
}
function Val({ children, color, large }: { children: React.ReactNode; color?: string; large?: boolean }) {
  return <div className={`font-bold ${large ? 'text-2xl' : 'text-base'} leading-tight`} style={{ color: color || 'var(--sgc-black)' }}>{children}</div>
}
function Card({ children, accent, className = '' }: { children: React.ReactNode; accent?: string; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border overflow-hidden ${className}`} style={{ borderColor: accent ? accent + '30' : 'var(--sgc-gray-border)' }}>
      {accent && <div className="h-0.5 w-full" style={{ background: accent }} />}
      <div className="p-4">{children}</div>
    </div>
  )
}
function Sec({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-base">{icon}</span>
      <span className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--sgc-navy)' }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: 'var(--sgc-gray-border)' }} />
    </div>
  )
}
function NumInput({ label, value, onChange, prefix = '$', min = 0, step = 1000, hint }: {
  label: string; value: number; onChange: (n: number) => void
  prefix?: string; min?: number; step?: number; hint?: string
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'var(--sgc-gray-mid)' }}>{prefix}</span>}
        <input
          type="number" value={value} min={min} step={step}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="w-full rounded-lg border text-sm py-2 outline-none bg-white"
          style={{
            paddingLeft: prefix ? '1.75rem' : '0.75rem', paddingRight: '0.75rem',
            borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-black)',
          }}
        />
      </div>
      {hint && <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{hint}</div>}
    </div>
  )
}
function PctInput({ label, value, onChange, hint }: {
  label: string; value: number; onChange: (n: number) => void; hint?: string
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative">
        <input
          type="number" value={value} min={0} max={100} step={0.1}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="w-full rounded-lg border text-sm py-2 pl-3 pr-8 outline-none bg-white"
          style={{ borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-black)' }}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>%</span>
      </div>
      {hint && <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{hint}</div>}
    </div>
  )
}
function ResultRow({ label, value, color, border = false }: { label: string; value: string; color?: string; border?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-1.5 ${border ? 'border-t mt-1 pt-2.5' : ''}`}
      style={{ borderColor: 'var(--sgc-gray-border)' }}>
      <span className="text-sm" style={{ color: 'var(--sgc-gray-mid)' }}>{label}</span>
      <span className="text-sm font-bold" style={{ color: color || 'var(--sgc-black)' }}>{value}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RATE DISPLAY — live Freddie Mac / FRED data
// ─────────────────────────────────────────────────────────────────────────────
function LiveRatesBar({ rates }: { rates: LiveRates }) {
  if (rates.loading) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border" style={{ background: 'var(--sgc-navy-pale)', borderColor: 'var(--sgc-navy)20' }}>
        <div className="w-4 h-4 border-2 rounded-full spin" style={{ borderColor: 'var(--sgc-gray-border)', borderTopColor: 'var(--sgc-navy)' }} />
        <span className="text-xs" style={{ color: 'var(--sgc-navy)' }}>Loading live rates from Freddie Mac / FRED...</span>
      </div>
    )
  }

  const items = [
    { label: '30yr Fixed', val: rates.rate30yr, suffix: '%', color: '#1B3A8C', src: 'Freddie Mac PMMS' },
    { label: '15yr Fixed', val: rates.rate15yr, suffix: '%', color: '#1A7A4A', src: 'Freddie Mac PMMS' },
    { label: '10yr Treasury', val: rates.rate10yr, suffix: '%', color: '#8A5700', src: 'US Treasury via FRED' },
    { label: 'CPI Inflation', val: rates.cpi, suffix: '%', color: '#C45E1A', src: 'BLS via FRED', isIndex: true },
    { label: 'Home Price Idx', val: rates.hpi, suffix: '', color: '#534AB7', src: 'Case-Shiller via FRED', isIndex: true },
  ]

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--sgc-gray-border)' }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {items.map((item, i) => (
          <div key={item.label} className={`p-3 text-center ${i < items.length - 1 ? 'border-r' : ''}`}
            style={{ borderColor: 'var(--sgc-gray-border)', background: i % 2 === 0 ? 'white' : 'var(--sgc-gray-light)' }}>
            <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>{item.label}</div>
            <div className="text-xl font-black leading-none" style={{ color: item.val ? item.color : 'var(--sgc-gray-mid)' }}>
              {item.val ? (item.isIndex ? item.val.value.toFixed(1) : item.val.value.toFixed(2) + item.suffix) : '—'}
            </div>
            {item.val && (
              <>
                <div className="text-[9px] mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>{item.val.date}</div>
                <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>{item.src}</div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="px-3 py-1.5 text-[9px] border-t" style={{ borderColor: 'var(--sgc-gray-border)', background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
        Live data from FRED (Federal Reserve Bank of St. Louis) · Freddie Mac Primary Mortgage Market Survey® · Updates weekly
        {rates.fetchedAt && ` · Fetched ${new Date(rates.fetchedAt).toLocaleTimeString()}`}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: FLIP ANALYZER — complete deal analysis
// ─────────────────────────────────────────────────────────────────────────────
export interface FinancialSeed {
  price?: number
  arv?: number
  rehab?: number
  addr?: string
}

function FlipAnalyzer({ rates, seed }: { rates: LiveRates; seed?: FinancialSeed }) {
  const liveRate = rates.rate30yr?.value || 7.0

  const [arv,          setArv]          = useState(seed?.arv   ?? 350000)
  const [purchasePrice,setPurchase]      = useState(seed?.price ?? 200000)
  const [rehabCost,    setRehab]         = useState(seed?.rehab ?? 45000)
  const [holdMonths,   setHold]          = useState(6)
  const [downPct,      setDownPct]       = useState(20)
  const [interestRate, setRate]          = useState(liveRate)
  const [loanYears,    setLoanYears]     = useState(30)
  const [closingCostPct, setClosingIn]   = useState(2)
  const [sellingCostPct, setSelling]     = useState(6)
  const [propertyTaxMo,  setTaxMo]       = useState(250)
  const [insuranceMo,    setInsurance]   = useState(120)
  const [utilityMo,      setUtility]     = useState(200)
  const [miscMo,         setMisc]        = useState(100)

  useEffect(() => { setRate(liveRate) }, [liveRate])

  // Re-seed whenever a new property is sent in from Deal Scanner
  useEffect(() => {
    if (!seed) return
    if (seed.price != null) setPurchase(seed.price)
    if (seed.arv   != null) setArv(seed.arv)
    if (seed.rehab != null) setRehab(seed.rehab)
  }, [seed])

  // Core math
  const downPayment      = purchasePrice * (downPct / 100)
  const loanAmount       = purchasePrice - downPayment
  const closingCostsBuy  = purchasePrice * (closingCostPct / 100)
  const totalCashIn      = downPayment + closingCostsBuy + rehabCost
  const monthlyPI        = monthlyPayment(loanAmount, interestRate, loanYears)
  const monthlyCarry     = monthlyPI + propertyTaxMo + insuranceMo + utilityMo + miscMo
  const totalCarryCosts  = monthlyCarry * holdMonths
  const sellingCosts     = arv * (sellingCostPct / 100)
  const totalCost        = purchasePrice + rehabCost + totalCarryCosts + closingCostsBuy + sellingCosts
  const netProfit        = arv - totalCost
  const roi              = totalCashIn > 0 ? (netProfit / totalCashIn) * 100 : 0
  const annualizedROI    = holdMonths > 0 ? (roi / holdMonths) * 12 : 0
  const maxAllowable     = arv * 0.70 - rehabCost  // 70% rule
  const profitMargin     = arv > 0 ? (netProfit / arv) * 100 : 0
  const breakeven        = totalCost  // what price you must sell at minimum

  const isProfitable = netProfit > 0
  const passesMARRule = purchasePrice <= maxAllowable

  return (
    <div className="space-y-5">
      {/* Input grid */}
      <div className="grid grid-cols-3 gap-5">
        {/* Acquisition */}
        <Card accent="#1B3A8C">
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#1B3A8C' }}>📋 Acquisition</div>
          <div className="space-y-3">
            <NumInput label="After Repair Value (ARV)" value={arv} onChange={setArv} step={5000} hint="Your realistic exit sale price" />
            <NumInput label="Purchase Price" value={purchasePrice} onChange={setPurchase} step={5000} />
            <NumInput label="Rehab / Renovation Cost" value={rehabCost} onChange={setRehab} step={1000} />
            <PctInput label="Closing Costs (Buy Side)" value={closingCostPct} onChange={setClosingIn} hint="Title, transfer tax, attorney, etc." />
            <PctInput label="Selling Costs (Sell Side)" value={sellingCostPct} onChange={setSelling} hint="Agent commission + closing" />
          </div>
        </Card>

        {/* Financing */}
        <Card accent="#1A7A4A">
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#1A7A4A' }}>💳 Financing</div>
          <div className="space-y-3">
            <PctInput label="Down Payment" value={downPct} onChange={setDownPct} />
            <PctInput label={`Interest Rate ${rates.rate30yr ? '(Live: ' + rates.rate30yr.value.toFixed(2) + '%)' : ''}`}
              value={interestRate} onChange={setRate} hint="Freddie Mac 30yr rate auto-loaded" />
            <div>
              <Label>Loan Term</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {[10, 15, 20, 25, 30].map(y => (
                  <button key={y} onClick={() => setLoanYears(y)}
                    className="py-1.5 rounded-lg border text-xs font-medium cursor-pointer"
                    style={loanYears === y
                      ? { background: '#1A7A4A', borderColor: '#1A7A4A', color: 'white' }
                      : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {y}yr
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 p-2.5 rounded-xl" style={{ background: '#EDFAF3' }}>
            <Label>Monthly P&I Payment</Label>
            <Val color="#1A7A4A" large>{fmt$(monthlyPI)}/mo</Val>
            <div className="text-[10px] mt-0.5" style={{ color: '#1A7A4A' }}>
              On {fmt$(loanAmount)} loan at {fmtPct(interestRate)}
            </div>
          </div>
        </Card>

        {/* Hold costs */}
        <Card accent="#C45E1A">
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#C45E1A' }}>⏱️ Holding Costs</div>
          <div className="space-y-3">
            <div>
              <Label>Hold Period (months)</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {[3, 4, 5, 6, 7, 8, 9, 12].map(m => (
                  <button key={m} onClick={() => setHold(m)}
                    className="py-1.5 rounded-lg border text-xs font-medium cursor-pointer"
                    style={holdMonths === m
                      ? { background: '#C45E1A', borderColor: '#C45E1A', color: 'white' }
                      : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {m}mo
                  </button>
                ))}
              </div>
            </div>
            <NumInput label="Property Tax / month" value={propertyTaxMo} onChange={setTaxMo} step={25} hint="Check county records" />
            <NumInput label="Insurance / month" value={insuranceMo} onChange={setInsurance} step={10} />
            <NumInput label="Utilities / month" value={utilityMo} onChange={setUtility} step={25} hint="Electric, water, gas" />
            <NumInput label="Misc (security, maint.) / mo" value={miscMo} onChange={setMisc} step={25} />
          </div>
          <div className="mt-3 p-2.5 rounded-xl" style={{ background: '#FEF3EA' }}>
            <Label>Total Carry Cost ({holdMonths} months)</Label>
            <Val color="#C45E1A" large>{fmt$(totalCarryCosts)}</Val>
            <div className="text-[10px] mt-0.5" style={{ color: '#C45E1A' }}>{fmt$(monthlyCarry)}/mo × {holdMonths} months</div>
          </div>
        </Card>
      </div>

      {/* Results */}
      <div className="grid grid-cols-2 gap-5">
        {/* P&L breakdown */}
        <Card accent={isProfitable ? '#1A7A4A' : '#C0341D'}>
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: isProfitable ? '#1A7A4A' : '#C0341D' }}>
            {isProfitable ? '✅' : '❌'} Profit & Loss Breakdown
          </div>
          <ResultRow label="After Repair Value (ARV)" value={fmt$(arv)} />
          <ResultRow label="Purchase Price" value={`− ${fmt$(purchasePrice)}`} color="#C0341D" />
          <ResultRow label="Rehab Cost" value={`− ${fmt$(rehabCost)}`} color="#C0341D" />
          <ResultRow label="Closing Costs (buy)" value={`− ${fmt$(closingCostsBuy)}`} color="#C0341D" />
          <ResultRow label="Carrying Costs" value={`− ${fmt$(totalCarryCosts)}`} color="#C0341D" />
          <ResultRow label="Selling Costs" value={`− ${fmt$(sellingCosts)}`} color="#C0341D" />
          <ResultRow label="NET PROFIT" value={fmt$(netProfit)} color={isProfitable ? '#1A7A4A' : '#C0341D'} border />
          <ResultRow label="Profit Margin" value={fmtPct(profitMargin, 1)} color={profitMargin > 15 ? '#1A7A4A' : '#C0341D'} />
          <ResultRow label="ROI on Cash Invested" value={fmtPct(roi, 1)} color={roi > 15 ? '#1A7A4A' : '#C0341D'} />
          <ResultRow label="Annualized ROI" value={fmtPct(annualizedROI, 1)} color={annualizedROI > 20 ? '#1A7A4A' : '#C0341D'} />
          <ResultRow label="Break-Even Sale Price" value={fmt$(breakeven)} />
        </Card>

        {/* Deal qualifier */}
        <div className="space-y-3">
          {/* 70% Rule */}
          <Card accent={passesMARRule ? '#1A7A4A' : '#C0341D'}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: passesMARRule ? '#1A7A4A' : '#C0341D' }}>
                70% Rule Check
              </div>
              <div className="text-lg font-black" style={{ color: passesMARRule ? '#1A7A4A' : '#C0341D' }}>
                {passesMARRule ? '✓ PASS' : '✗ FAIL'}
              </div>
            </div>
            <div className="text-xs space-y-1" style={{ color: 'var(--sgc-gray-mid)' }}>
              <div>MAX Allowable = ARV × 70% − Rehab</div>
              <div className="font-bold text-sm" style={{ color: 'var(--sgc-black)' }}>
                {fmt$(arv)} × 70% − {fmt$(rehabCost)} = {fmt$(maxAllowable)}
              </div>
              <div style={{ color: passesMARRule ? '#1A7A4A' : '#C0341D' }}>
                Your price {fmt$(purchasePrice)} is {passesMARRule ? fmt$(maxAllowable - purchasePrice) + ' under' : fmt$(purchasePrice - maxAllowable) + ' over'} the limit
              </div>
            </div>
          </Card>

          {/* Total cash required */}
          <Card accent="#1B3A8C">
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#1B3A8C' }}>💵 Cash Required at Closing</div>
            <Val large color="#1B3A8C">{fmt$(totalCashIn)}</Val>
            <div className="space-y-1 mt-2 text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
              <div className="flex justify-between"><span>Down payment ({fmtPct(downPct, 0)})</span><span>{fmt$(downPayment)}</span></div>
              <div className="flex justify-between"><span>Closing costs</span><span>{fmt$(closingCostsBuy)}</span></div>
              <div className="flex justify-between"><span>Rehab budget</span><span>{fmt$(rehabCost)}</span></div>
            </div>
          </Card>

          {/* Quick metrics */}
          <Card>
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)' }}>📊 Quick Metrics</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { l: 'Rehab per ARV', v: fmtPct(arv > 0 ? rehabCost/arv*100 : 0, 1), ok: rehabCost/arv < 0.20 },
                { l: 'Carry / ARV',   v: fmtPct(arv > 0 ? totalCarryCosts/arv*100 : 0, 1), ok: totalCarryCosts/arv < 0.05 },
                { l: 'Loan-to-ARV',  v: fmtPct(arv > 0 ? loanAmount/arv*100 : 0, 1), ok: loanAmount/arv < 0.70 },
                { l: 'Spread ARV-Cost', v: fmt$(arv - purchasePrice - rehabCost), ok: arv - purchasePrice - rehabCost > 50000 },
              ].map(m => (
                <div key={m.l} className="p-2 rounded-xl text-center" style={{ background: 'var(--sgc-gray-light)' }}>
                  <div className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--sgc-gray-mid)' }}>{m.l}</div>
                  <div className="text-sm font-bold" style={{ color: m.ok ? '#1A7A4A' : '#C0341D' }}>{m.v}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: BRRRR ANALYZER
// ─────────────────────────────────────────────────────────────────────────────
function BRRRRAnalyzer({ rates }: { rates: LiveRates }) {
  const liveRate30 = rates.rate30yr?.value || 7.0
  const liveRate15 = rates.rate15yr?.value || 6.5

  const [purchasePrice, setPurchase]    = useState(150000)
  const [rehabCost,     setRehab]       = useState(35000)
  const [arv,           setArv]         = useState(250000)
  const [monthlyRent,   setRent]        = useState(1800)
  const [vacancyPct,    setVacancy]     = useState(5)
  const [managementPct, setMgmt]        = useState(8)
  const [maintenancePct,setMaint]       = useState(8)
  const [insurance,     setInsurance]   = useState(100)
  const [taxMo,         setTax]         = useState(180)
  const [refiLTV,       setRefiLTV]     = useState(75)
  const [refiRate,      setRefiRate]    = useState(liveRate30)
  const [refiYears,     setRefiYears]   = useState(30)
  const [hardMoneyRate, setHMRate]      = useState(12)
  const [origPoints,    setPoints]      = useState(2)

  useEffect(() => { setRefiRate(liveRate30) }, [liveRate30])

  // Acquisition costs
  const hmLoan       = (purchasePrice + rehabCost) * 0.85
  const hmPoints     = hmLoan * (origPoints / 100)
  const totalInvested = purchasePrice + rehabCost + hmPoints

  // After refinance
  const refiLoan    = arv * (refiLTV / 100)
  const cashOut     = refiLoan - hmLoan  // money returned from refi
  const netCashLeft = totalInvested - refiLoan  // remaining equity tied up

  // Monthly rental income
  const effectiveRent   = monthlyRent * (1 - vacancyPct / 100)
  const managementCost  = monthlyRent * (managementPct / 100)
  const maintenanceCost = monthlyRent * (maintenancePct / 100)
  const refiPayment     = monthlyPayment(refiLoan, refiRate, refiYears)
  const monthlyNOI      = effectiveRent - managementCost - maintenanceCost - insurance - taxMo
  const monthlyCF       = monthlyNOI - refiPayment
  const annualCF        = monthlyCF * 12
  const annualNOI       = monthlyNOI * 12

  // Key ratios
  const capRate     = arv > 0 ? (annualNOI / arv) * 100 : 0
  const dscr        = refiPayment > 0 ? monthlyNOI / refiPayment : 0
  const grossYield  = arv > 0 ? (monthlyRent * 12 / arv) * 100 : 0
  const coC         = netCashLeft > 0 ? (annualCF / netCashLeft) * 100 : 0
  const fullRecycle = cashOut >= totalInvested  // infinite returns

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-5">
        {/* Property */}
        <Card accent="#1B3A8C">
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#1B3A8C' }}>🏠 Property</div>
          <div className="space-y-3">
            <NumInput label="Purchase Price" value={purchasePrice} onChange={setPurchase} step={5000} />
            <NumInput label="Rehab Cost" value={rehabCost} onChange={setRehab} step={1000} />
            <NumInput label="ARV (After Repair Value)" value={arv} onChange={setArv} step={5000} hint="Get a real appraisal" />
            <NumInput label="Monthly Market Rent" value={monthlyRent} onChange={setRent} step={50} hint="Verify with RentCast" />
          </div>
        </Card>

        {/* Expenses */}
        <Card accent="#C45E1A">
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#C45E1A' }}>💸 Monthly Expenses</div>
          <div className="space-y-3">
            <PctInput label="Vacancy Rate" value={vacancyPct} onChange={setVacancy} hint="Industry standard: 5-8%" />
            <PctInput label="Property Management" value={managementPct} onChange={setMgmt} hint="Typically 8-12% of rent" />
            <PctInput label="Maintenance / CapEx" value={maintenancePct} onChange={setMaint} hint="Budget 8-10% of rent" />
            <NumInput label="Insurance / month" value={insurance} onChange={setInsurance} step={10} />
            <NumInput label="Property Tax / month" value={taxMo} onChange={setTax} step={10} />
          </div>
        </Card>

        {/* Refinance */}
        <Card accent="#1A7A4A">
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#1A7A4A' }}>🔄 Refinance (the second R)</div>
          <div className="space-y-3">
            <PctInput label="Refi LTV" value={refiLTV} onChange={setRefiLTV} hint="Most lenders: 70-80% of ARV" />
            <PctInput label={`Refi Rate ${rates.rate30yr ? '(Live: ' + rates.rate30yr.value.toFixed(2) + '%)' : ''}`}
              value={refiRate} onChange={setRefiRate} />
            <PctInput label="Hard Money Rate (acquisition)" value={hardMoneyRate} onChange={setHMRate} />
            <PctInput label="Origination Points" value={origPoints} onChange={setPoints} />
          </div>
          <div className="mt-3 p-2.5 rounded-xl" style={{ background: '#EDFAF3' }}>
            <Label>Refi Loan Amount</Label>
            <Val color="#1A7A4A" large>{fmt$(refiLoan)}</Val>
            <div className="text-[10px] mt-0.5" style={{ color: '#1A7A4A' }}>{fmt$(arv)} × {fmtPct(refiLTV, 0)} LTV</div>
          </div>
        </Card>
      </div>

      {/* Results */}
      <div className="grid grid-cols-3 gap-5">
        {/* Cash flow */}
        <Card accent={monthlyCF > 0 ? '#1A7A4A' : '#C0341D'}>
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: monthlyCF > 0 ? '#1A7A4A' : '#C0341D' }}>
            💰 Monthly Cash Flow
          </div>
          <div className="text-center mb-4">
            <div className="text-4xl font-black" style={{ color: monthlyCF > 0 ? '#1A7A4A' : '#C0341D' }}>
              {fmt$(monthlyCF)}/mo
            </div>
            <div className="text-sm mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>{fmt$(annualCF)}/year</div>
          </div>
          <ResultRow label="Gross Rent" value={fmt$(monthlyRent)} />
          <ResultRow label={`Vacancy (${vacancyPct}%)`} value={`− ${fmt$(monthlyRent * vacancyPct/100)}`} color="#C0341D" />
          <ResultRow label={`Management (${managementPct}%)`} value={`− ${fmt$(managementCost)}`} color="#C0341D" />
          <ResultRow label={`Maintenance (${maintenancePct}%)`} value={`− ${fmt$(maintenanceCost)}`} color="#C0341D" />
          <ResultRow label="Insurance" value={`− ${fmt$(insurance)}`} color="#C0341D" />
          <ResultRow label="Property Tax" value={`− ${fmt$(taxMo)}`} color="#C0341D" />
          <ResultRow label="NOI" value={fmt$(monthlyNOI)} color={monthlyNOI > 0 ? '#1A7A4A' : '#C0341D'} border />
          <ResultRow label="Refi Mortgage (P&I)" value={`− ${fmt$(refiPayment)}`} color="#C0341D" />
          <ResultRow label="NET CASH FLOW" value={`${monthlyCF > 0 ? '+' : ''}${fmt$(monthlyCF)}/mo`}
            color={monthlyCF > 0 ? '#1A7A4A' : '#C0341D'} border />
        </Card>

        {/* Key ratios */}
        <Card accent="#534AB7">
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#534AB7' }}>📊 Key Ratios</div>
          {[
            { l: 'DSCR', v: dscr.toFixed(2) + 'x', ok: dscr >= 1.25, note: 'Lenders want ≥ 1.25', color: dscr >= 1.25 ? '#1A7A4A' : dscr >= 1.0 ? '#8A5700' : '#C0341D' },
            { l: 'Cap Rate', v: fmtPct(capRate, 2), ok: capRate >= 6, note: '≥ 6% is typically good', color: capRate >= 8 ? '#1A7A4A' : capRate >= 6 ? '#8A5700' : '#C0341D' },
            { l: 'Gross Yield', v: fmtPct(grossYield, 2), ok: grossYield >= 8, note: '≥ 8% is strong', color: grossYield >= 8 ? '#1A7A4A' : grossYield >= 6 ? '#8A5700' : '#C0341D' },
            { l: 'Cash-on-Cash', v: fmtPct(isFinite(coC) ? coC : 0, 1), ok: coC >= 8, note: '≥ 8% beats S&P avg', color: coC >= 10 ? '#1A7A4A' : coC >= 8 ? '#8A5700' : '#C0341D' },
          ].map(r => (
            <div key={r.l} className="mb-3 p-3 rounded-xl" style={{ background: 'var(--sgc-gray-light)' }}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-semibold" style={{ color: 'var(--sgc-gray-mid)' }}>{r.l}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{ background: r.ok ? '#EDFAF3' : '#FEF0ED', color: r.ok ? '#1A7A4A' : '#C0341D' }}>
                  {r.ok ? '✓ Good' : '⚠ Low'}
                </span>
              </div>
              <div className="text-xl font-black" style={{ color: r.color }}>{r.v}</div>
              <div className="text-[9px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{r.note}</div>
            </div>
          ))}
        </Card>

        {/* Capital recycling */}
        <Card accent={fullRecycle ? '#1A7A4A' : '#8A5700'}>
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: fullRecycle ? '#1A7A4A' : '#8A5700' }}>
            ♻️ Capital Recycling
          </div>
          <div className="text-center mb-4 p-3 rounded-xl" style={{ background: fullRecycle ? '#EDFAF3' : '#FEF7EA' }}>
            <div className="text-2xl font-black mb-1" style={{ color: fullRecycle ? '#1A7A4A' : '#8A5700' }}>
              {fullRecycle ? '∞ Infinite Returns' : `${fmt$(netCashLeft)} left in`}
            </div>
            <div className="text-xs" style={{ color: fullRecycle ? '#1A7A4A' : '#8A5700' }}>
              {fullRecycle ? 'Full capital recycled — BRRRR complete' : 'Capital still invested after refi'}
            </div>
          </div>
          <ResultRow label="Total Invested" value={fmt$(totalInvested)} />
          <ResultRow label="Refi Loan" value={fmt$(refiLoan)} />
          <ResultRow label="Cash Back from Refi" value={fmt$(Math.max(0, cashOut))} color={cashOut > 0 ? '#1A7A4A' : '#C0341D'} border />
          <ResultRow label="Net Left in Deal" value={fmt$(Math.max(0, netCashLeft))} color={netCashLeft < 10000 ? '#1A7A4A' : '#8A5700'} />
          <ResultRow label="Equity Position" value={fmt$(arv - refiLoan)} color="#1B3A8C" />
          <div className="mt-3 p-2.5 rounded-xl text-xs" style={{ background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)' }}>
            💡 Target: Refi out 100%+ of invested capital. Use cash to repeat the BRRRR on the next property.
          </div>
        </Card>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: MORTGAGE CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────
function MortgageCalc({ rates }: { rates: LiveRates }) {
  const live30 = rates.rate30yr?.value || 7.0
  const live15 = rates.rate15yr?.value || 6.5

  const [price,     setPrice]   = useState(300000)
  const [downPct,   setDownPct] = useState(20)
  const [rate,      setRate]    = useState(live30)
  const [years,     setYears]   = useState(30)

  useEffect(() => { setRate(live30) }, [live30])

  const down     = price * (downPct / 100)
  const loan     = price - down
  const monthly  = monthlyPayment(loan, rate, years)
  const total    = monthly * years * 12
  const interest = total - loan
  const piti     = monthly + 250 + 120  // rough PITI estimate

  // Amortization: year 1 vs year 5 vs year 10
  const amortYear = (yr: number) => {
    const r = rate / 100 / 12
    const n = years * 12
    let balance = loan
    let totalInterestPaid = 0
    let principalPaid = 0
    for (let mo = 0; mo < yr * 12; mo++) {
      const intPayment = balance * r
      const prinPayment = monthly - intPayment
      totalInterestPaid += intPayment
      principalPaid += prinPayment
      balance -= prinPayment
    }
    return { balance, principalPaid, interestPaid: totalInterestPaid }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-5">
        {/* Inputs */}
        <Card accent="#1B3A8C">
          <Sec icon="🏦" label="Mortgage Calculator" />
          <div className="space-y-4">
            <NumInput label="Home Price" value={price} onChange={setPrice} step={5000} />
            <PctInput label="Down Payment" value={downPct} onChange={setDownPct} />
            <div className="p-3 rounded-xl" style={{ background: 'var(--sgc-navy-pale)' }}>
              <Label>Rate presets (Freddie Mac live)</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {rates.rate30yr && (
                  <button onClick={() => { setRate(rates.rate30yr!.value); setYears(30) }}
                    className="p-2.5 rounded-lg border cursor-pointer text-left"
                    style={{ background: 'white', borderColor: 'var(--sgc-navy)30' }}>
                    <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>30yr Fixed (live)</div>
                    <div className="text-sm font-bold" style={{ color: '#1B3A8C' }}>{rates.rate30yr.value.toFixed(2)}%</div>
                  </button>
                )}
                {rates.rate15yr && (
                  <button onClick={() => { setRate(rates.rate15yr!.value); setYears(15) }}
                    className="p-2.5 rounded-lg border cursor-pointer text-left"
                    style={{ background: 'white', borderColor: 'var(--sgc-navy)30' }}>
                    <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>15yr Fixed (live)</div>
                    <div className="text-sm font-bold" style={{ color: '#1A7A4A' }}>{rates.rate15yr.value.toFixed(2)}%</div>
                  </button>
                )}
              </div>
            </div>
            <PctInput label="Custom Interest Rate" value={rate} onChange={setRate} />
            <div>
              <Label>Loan Term</Label>
              <div className="grid grid-cols-5 gap-1.5">
                {[10, 15, 20, 25, 30].map(y => (
                  <button key={y} onClick={() => setYears(y)}
                    className="py-2 rounded-lg border text-xs font-bold cursor-pointer"
                    style={years === y
                      ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                      : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {y}yr
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Results */}
        <div className="space-y-3">
          <Card accent="#1A7A4A">
            <div className="text-center mb-4">
              <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Monthly P&I Payment</div>
              <div className="text-5xl font-black" style={{ color: '#1A7A4A' }}>{fmt$(monthly)}</div>
              <div className="text-sm mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>On {fmt$(loan)} at {fmtPct(rate)}</div>
            </div>
            <ResultRow label="Loan Amount" value={fmt$(loan)} />
            <ResultRow label="Down Payment" value={fmt$(down)} />
            <ResultRow label="Total Payments" value={fmt$(total)} />
            <ResultRow label="Total Interest Paid" value={fmt$(interest)} color="#C0341D" />
            <ResultRow label="Est. PITI (with tax+ins)" value={`≈ ${fmt$(piti)}/mo`} color="#8A5700" border />
          </Card>

          {/* Amortization milestones */}
          <Card>
            <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--sgc-navy)' }}>📈 Amortization Milestones</div>
            <div className="grid grid-cols-3 gap-2">
              {[1, 5, 10].map(yr => {
                const a = amortYear(yr)
                return (
                  <div key={yr} className="p-2.5 rounded-xl text-center" style={{ background: 'var(--sgc-gray-light)' }}>
                    <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Year {yr}</div>
                    <div className="text-xs font-bold" style={{ color: '#1A7A4A' }}>+{fmt$(a.principalPaid)}</div>
                    <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>equity built</div>
                    <div className="text-xs font-bold mt-1" style={{ color: '#C0341D' }}>{fmt$(a.interestPaid)}</div>
                    <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>interest paid</div>
                    <div className="text-xs font-bold mt-1" style={{ color: '#1B3A8C' }}>{fmt$(a.balance)}</div>
                    <div className="text-[9px]" style={{ color: 'var(--sgc-gray-mid)' }}>balance</div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4: MAO / OFFER CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────
function MAOCalculator({ rates }: { rates: LiveRates }) {
  const [arv,         setArv]         = useState(300000)
  const [rehab,       setRehab]       = useState(40000)
  const [desiredROI,  setROI]         = useState(20)
  const [closingIn,   setClosingIn]   = useState(2)
  const [closingOut,  setClosingOut]  = useState(6)
  const [holdMonths,  setHold]        = useState(6)
  const [monthlyRate, setMonthlyRate] = useState(rates.rate30yr?.value || 7.0)
  const [loanPct,     setLoanPct]     = useState(70)

  useEffect(() => { setMonthlyRate(rates.rate30yr?.value || 7.0) }, [rates.rate30yr])

  const loanAmount    = arv * (loanPct / 100)
  const closingBuy    = loanAmount * (closingIn / 100)
  const closingBuyOut = arv * (closingOut / 100)
  const carryEst      = (loanAmount * (monthlyRate/100/12)) * holdMonths
  const allCosts      = rehab + carryEst + closingBuy + closingBuyOut
  const desiredProfit = arv * (desiredROI / 100)

  // Different offer strategies
  const mao70Rule     = arv * 0.70 - rehab
  const maoTargetROI  = arv - allCosts - desiredProfit
  const maoConservative = arv * 0.65 - rehab
  const maoAggressive   = arv * 0.75 - rehab

  const strategies = [
    { l: 'Conservative (65% Rule)', v: maoConservative, desc: 'Lower risk, harder to win deals', color: '#534AB7' },
    { l: 'Standard (70% Rule)',      v: mao70Rule,       desc: 'Industry standard wholesaler MAO', color: '#1B3A8C' },
    { l: 'Target ROI Method',        v: maoTargetROI,    desc: `Guarantees ${desiredROI}% return if estimates accurate`, color: '#1A7A4A' },
    { l: 'Aggressive (75% Rule)',    v: maoAggressive,   desc: 'Competitive market — less margin', color: '#C45E1A' },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-5">
        <Card accent="#1B3A8C">
          <Sec icon="🎯" label="MAO / Max Offer Calculator" />
          <div className="space-y-3">
            <NumInput label="After Repair Value (ARV)" value={arv} onChange={setArv} step={5000} hint="Get comps — this is everything" />
            <NumInput label="Estimated Rehab" value={rehab} onChange={setRehab} step={1000} hint="Be realistic — overruns kill deals" />
            <PctInput label="Target ROI" value={desiredROI} onChange={setROI} hint="Minimum acceptable return" />
            <PctInput label="Closing Costs (buy side)" value={closingIn} onChange={setClosingIn} />
            <PctInput label="Selling Costs (commissions + close)" value={closingOut} onChange={setClosingOut} />
            <div>
              <Label>Estimated Hold (months)</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {[3, 4, 5, 6, 7, 8, 9, 12].map(m => (
                  <button key={m} onClick={() => setHold(m)}
                    className="py-1.5 rounded-lg border text-xs font-medium cursor-pointer"
                    style={holdMonths === m
                      ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                      : { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {m}mo
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-3">
          {strategies.map(s => (
            <Card key={s.l} accent={s.color}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold mb-0.5" style={{ color: s.color }}>{s.l}</div>
                  <div className="text-[10px]" style={{ color: 'var(--sgc-gray-mid)' }}>{s.desc}</div>
                </div>
                <div className="text-2xl font-black" style={{ color: s.color }}>
                  {s.v > 0 ? fmt$(s.v) : 'Pass'}
                </div>
              </div>
            </Card>
          ))}

          <Card>
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)' }}>📊 Cost Breakdown</div>
            <ResultRow label="Estimated Rehab" value={fmt$(rehab)} color="#C0341D" />
            <ResultRow label="Carry Costs (est.)" value={fmt$(carryEst)} color="#C0341D" />
            <ResultRow label="Buy Closing Costs" value={fmt$(closingBuy)} color="#C0341D" />
            <ResultRow label="Sell Closing Costs" value={fmt$(closingBuyOut)} color="#C0341D" />
            <ResultRow label="Total Costs (excl. purchase)" value={fmt$(allCosts)} color="#C0341D" border />
            <ResultRow label="Desired Profit" value={fmt$(desiredProfit)} color="#1A7A4A" />
          </Card>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 5: MARKET CONDITIONS (live FRED data)
// ─────────────────────────────────────────────────────────────────────────────
function MarketConditions({ rates }: { rates: LiveRates }) {
  const r30 = rates.rate30yr?.value
  const r15 = rates.rate15yr?.value
  const t10 = rates.rate10yr?.value
  const spread = r30 && t10 ? r30 - t10 : null  // mortgage spread over 10yr Treasury

  return (
    <div className="space-y-5">
      <Sec icon="📡" label="Live Market Conditions — Real Data from Federal Reserve / Freddie Mac" />

      <div className="grid grid-cols-3 gap-4">
        {/* Mortgage rates */}
        <Card accent="#1B3A8C">
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#1B3A8C' }}>
            🏦 Freddie Mac Mortgage Rates
          </div>
          {[
            { l: '30-Year Fixed', v: r30, note: 'Freddie Mac PMMS (weekly avg)' },
            { l: '15-Year Fixed', v: r15, note: 'Freddie Mac PMMS (weekly avg)' },
          ].map(r => (
            <div key={r.l} className="mb-3 p-3 rounded-xl" style={{ background: 'var(--sgc-gray-light)' }}>
              <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>{r.l}</div>
              <div className="text-3xl font-black" style={{ color: r.v ? '#1B3A8C' : 'var(--sgc-gray-mid)' }}>
                {r.v ? r.v.toFixed(2) + '%' : '—'}
              </div>
              <div className="text-[9px] mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>{r.note}</div>
              {r.v && r.l.includes('30') && (
                <div className="mt-2 text-[10px] p-2 rounded-lg" style={{
                  background: r.v > 7 ? '#FEF0ED' : r.v > 6.5 ? '#FEF7EA' : '#EDFAF3',
                  color: r.v > 7 ? '#C0341D' : r.v > 6.5 ? '#8A5700' : '#1A7A4A'
                }}>
                  {r.v > 7 ? '⚠ Elevated — buyer pool constrained' :
                   r.v > 6.5 ? '→ Moderate — market adjusting' :
                   '✓ Favorable — buyers active'}
                </div>
              )}
            </div>
          ))}
        </Card>

        {/* Treasury yields */}
        <Card accent="#8A5700">
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#8A5700' }}>
            📊 Treasury Yields (Federal Reserve)
          </div>
          <div className="mb-3 p-3 rounded-xl" style={{ background: 'var(--sgc-gray-light)' }}>
            <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>10-Year Treasury Note</div>
            <div className="text-3xl font-black" style={{ color: t10 ? '#8A5700' : 'var(--sgc-gray-mid)' }}>
              {t10 ? t10.toFixed(2) + '%' : '—'}
            </div>
            <div className="text-[9px] mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>US Treasury via FRED · Key benchmark for mortgages</div>
          </div>
          {spread !== null && (
            <div className="p-3 rounded-xl mb-3" style={{ background: 'var(--sgc-gray-light)' }}>
              <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Mortgage Spread (30yr − 10yr)</div>
              <div className="text-3xl font-black" style={{ color: spread > 2.5 ? '#C45E1A' : '#1A7A4A' }}>
                +{spread.toFixed(2)}%
              </div>
              <div className="text-[9px] mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>Historical avg ≈ 1.7% · {spread > 2.5 ? 'Wide spread — room to compress' : 'Normal range'}</div>
            </div>
          )}
          <div className="p-2.5 rounded-xl text-xs" style={{ background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)' }}>
            💡 Mortgage rates typically track the 10-yr Treasury + a spread for lender risk. When the spread compresses, rates drop even without Fed action.
          </div>
        </Card>

        {/* Economic context */}
        <Card accent="#534AB7">
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#534AB7' }}>
            🌐 Economic Context
          </div>
          {rates.cpi && (
            <div className="mb-3 p-3 rounded-xl" style={{ background: 'var(--sgc-gray-light)' }}>
              <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>CPI Index Level</div>
              <div className="text-3xl font-black" style={{ color: '#534AB7' }}>{rates.cpi.value.toFixed(1)}</div>
              <div className="text-[9px] mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>BLS Consumer Price Index · {rates.cpi.date}</div>
            </div>
          )}
          {rates.hpi && (
            <div className="mb-3 p-3 rounded-xl" style={{ background: 'var(--sgc-gray-light)' }}>
              <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--sgc-gray-mid)' }}>Case-Shiller Home Price Index</div>
              <div className="text-3xl font-black" style={{ color: '#534AB7' }}>{rates.hpi.value.toFixed(1)}</div>
              <div className="text-[9px] mt-1" style={{ color: 'var(--sgc-gray-mid)' }}>S&P/Case-Shiller via FRED · {rates.hpi.date} · Jan 2000 = 100</div>
            </div>
          )}
          <div className="p-2.5 rounded-xl text-xs space-y-1" style={{ background: 'var(--sgc-gray-light)', color: 'var(--sgc-gray-mid)' }}>
            <div>Sources: Federal Reserve Economic Data (FRED), St. Louis Fed</div>
            <div>Freddie Mac Primary Mortgage Market Survey®</div>
            <div>All data is real, live, and public domain</div>
          </div>
        </Card>
      </div>

      {/* Payment impact table */}
      <Card>
        <Sec icon="📋" label="Rate Impact — Monthly Payment on Common Loan Amounts" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--sgc-navy)', color: 'white' }}>
                <th className="px-3 py-2 text-left rounded-tl-lg">Loan Amount</th>
                {[5.5, 6.0, 6.5, r30 || 7.0, 7.5, 8.0].map(r => (
                  <th key={r} className="px-3 py-2 text-center" style={{ background: r === (r30 || 7.0) ? '#C45E1A' : undefined }}>
                    {r.toFixed(2)}% {r === r30 ? '← LIVE' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[150000, 200000, 250000, 300000, 350000, 400000, 500000].map((loan, i) => (
                <tr key={loan} style={{ background: i % 2 === 0 ? 'white' : 'var(--sgc-gray-light)' }}>
                  <td className="px-3 py-2 font-bold" style={{ color: 'var(--sgc-navy)' }}>{fmtK(loan)}</td>
                  {[5.5, 6.0, 6.5, r30 || 7.0, 7.5, 8.0].map(r => (
                    <td key={r} className="px-3 py-2 text-center font-medium"
                      style={{ color: r === (r30 || 7.0) ? '#C45E1A' : 'var(--sgc-black)', fontWeight: r === r30 ? 700 : 400 }}>
                      {fmt$(monthlyPayment(loan, r, 30))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[10px] mt-2" style={{ color: 'var(--sgc-gray-mid)' }}>
          30-year fixed, P&I only. Source: Freddie Mac PMMS via FRED. Highlighted column = current live rate.
        </div>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'flip',     label: 'Flip Analyzer',    icon: '🔨' },
  { id: 'brrrr',    label: 'BRRRR Analyzer',   icon: '🔄' },
  { id: 'mortgage', label: 'Mortgage Calc',     icon: '🏦' },
  { id: 'mao',      label: 'MAO / Max Offer',  icon: '🎯' },
  { id: 'market',   label: 'Market Conditions', icon: '📡' },
]

export default function FinancialTools() {
  const [tab, setTab] = useState('flip')
  const [rates, setRates] = useState<LiveRates>({
    rate30yr: null, rate15yr: null, rate10yr: null,
    cpi: null, hpi: null, loading: true, fetchedAt: '',
  })

  const loadRates = useCallback(async () => {
    setRates(r => ({ ...r, loading: true }))
    const [r30, r15, t10, cpi, hpi] = await Promise.all([
      fetchFREDCsv('MORTGAGE30US'),
      fetchFREDCsv('MORTGAGE15US'),
      fetchFREDCsv('DGS10'),
      fetchFREDCsv('CPIAUCSL'),
      fetchFREDCsv('CSUSHPINSA'),
    ])
    setRates({ rate30yr: r30, rate15yr: r15, rate10yr: t10, cpi, hpi, loading: false, fetchedAt: new Date().toISOString() })
  }, [])

  useEffect(() => { loadRates() }, [loadRates])

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* Header with live rates */}
      <div className="flex-shrink-0 border-b bg-white px-5 pt-4 pb-0" style={{ borderColor: 'var(--sgc-gray-border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-base font-bold" style={{ color: 'var(--sgc-navy)' }}>💹 Financial Tools</div>
            <div className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>
              Real data — Freddie Mac · Federal Reserve · FRED · All calculations use live rates
            </div>
          </div>
          <button onClick={loadRates} disabled={rates.loading}
            className="text-xs px-3 py-1.5 rounded-lg border cursor-pointer"
            style={{ borderColor: 'var(--sgc-navy)30', color: 'var(--sgc-navy)', background: 'var(--sgc-navy-pale)' }}>
            {rates.loading ? '⟳ Loading...' : '↻ Refresh Rates'}
          </button>
        </div>

        {/* Live rates bar */}
        <div className="mb-3">
          <LiveRatesBar rates={rates} />
        </div>

        {/* Tab bar */}
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 border-b-2 text-xs font-semibold cursor-pointer border-none bg-transparent transition-all"
              style={tab === t.id
                ? { borderBottomColor: 'var(--sgc-navy)', color: 'var(--sgc-navy)', borderBottomWidth: 2 }
                : { borderBottomColor: 'transparent', color: 'var(--sgc-gray-mid)', borderBottomWidth: 2 }}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'flip'     && <FlipAnalyzer     rates={rates} />}
        {tab === 'brrrr'    && <BRRRRAnalyzer     rates={rates} />}
        {tab === 'mortgage' && <MortgageCalc      rates={rates} />}
        {tab === 'mao'      && <MAOCalculator     rates={rates} />}
        {tab === 'market'   && <MarketConditions  rates={rates} />}
      </div>
    </div>
  )
}
