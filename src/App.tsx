import { useState } from 'react'
import Sidebar from './components/Sidebar'
import PropertyCard from './components/PropertyCard'
import DetailPanel from './components/DetailPanel'
import MarketIntel from './components/MarketIntel'
import DealCalculator from './components/DealCalculator'
import { SearchParams, AnalyzedProperty, MarketStats, SortKey, TabId } from './types'
import { fetchListings, fetchMarketStats } from './lib/rentcast'
import { analyzeProperty, sortResults } from './lib/scoring'
import { fmt$ } from './lib/utils'

const DEFAULT_PARAMS: SearchParams = {
  city: 'Norfolk, VA',
  propertyType: '',
  minPrice: 50000,
  maxPrice: 500000,
  bedrooms: 3,
  bathrooms: 1,
  daysOnMarketMax: 90,
  minFlipScore: 50,
  minEquity: 15000,
  rehabLevel: 'medium',
  holdMonths: 6,
  financingRate: 10,
}

type State = 'idle' | 'loading' | 'results' | 'error'

export default function App() {
  const [params, setParams] = useState<SearchParams>(DEFAULT_PARAMS)
  const [results, setResults] = useState<AnalyzedProperty[]>([])
  const [marketStats, setMarketStats] = useState<MarketStats | null>(null)
  const [selected, setSelected] = useState<AnalyzedProperty | null>(null)
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState('')
  const [loadingMsg, setLoadingMsg] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [tab, setTab] = useState<TabId>('list')
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)

  const showToast = (msg: string, err = false) => {
    setToast({ msg, err })
    setTimeout(() => setToast(null), 3500)
  }

  const handleSearch = async () => {
    if (!params.city.trim()) { showToast('Enter a city or zip', true); return }
    setState('loading'); setError('')

    const isZip = /^\d{5}$/.test(params.city.trim())
    const apiParams: Record<string, string> = {}

    if (isZip) {
      apiParams.zipCode = params.city.trim()
    } else {
      const parts = params.city.split(',').map(s => s.trim())
      apiParams.city = parts[0]
      if (parts[1]) apiParams.state = parts[1]
    }

    if (params.minPrice) apiParams.minPrice = String(params.minPrice)
    if (params.maxPrice) apiParams.maxPrice = String(params.maxPrice)
    if (params.bedrooms) apiParams.bedrooms = String(params.bedrooms)
    if (params.bathrooms) apiParams.bathrooms = String(params.bathrooms)
    if (params.propertyType) apiParams.propertyType = params.propertyType
    if (params.daysOnMarketMax) apiParams.daysOldMax = String(params.daysOnMarketMax)

    try {
      setLoadingMsg('Connecting to RentCast...')
      const [listings, mStats] = await Promise.allSettled([
        fetchListings(apiParams),
        fetchMarketStats(isZip ? { zipCode: params.city.trim() } : (() => {
          const parts = params.city.split(',').map(s => s.trim())
          const p: Record<string, string> = { city: parts[0] }
          if (parts[1]) p.state = parts[1]
          if (params.propertyType) p.propertyType = params.propertyType
          return p
        })())
      ])

      setLoadingMsg('Analyzing deals...')

      const listArr = listings.status === 'fulfilled' ? listings.value : []
      const ms = mStats.status === 'fulfilled' ? mStats.value : null
      setMarketStats(ms)

      if (!listArr.length) {
        setState('idle')
        showToast('No listings found. Try adjusting parameters.')
        return
      }

      const avgPsf = ms?.averagePricePerSquareFoot || ms?.saleData?.averagePricePerSquareFoot || null

      const analyzed = listArr
        .map((p: any) => analyzeProperty(p, params.rehabLevel, params.holdMonths, params.financingRate, avgPsf))
        .filter((p: any): p is AnalyzedProperty => p !== null)
        .filter((p: AnalyzedProperty) => p.flipScore >= params.minFlipScore && p.profit >= params.minEquity)

      const sorted = sortResults(analyzed, sortKey)
      setResults(sorted)
      setState('results')
      showToast(`✓ ${sorted.length} deals found`)
    } catch (e: any) {
      setError(e.message)
      setState('error')
      showToast('Search failed', true)
    }
  }

  const handleSort = (key: SortKey) => {
    setSortKey(key)
    setResults(prev => sortResults(prev, key))
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0

  const statsData = results.length ? [
    { label: 'Avg Score', value: String(Math.round(avg(results.map(r => r.flipScore)))) },
    { label: 'Avg Profit', value: fmt$(avg(results.map(r => r.profit))) },
    { label: 'Hot Deals', value: String(results.filter(r => r.flipScore >= 70).length) },
    { label: 'Avg Price', value: fmt$(avg(results.map(r => r.price))) },
  ] : []

  const SORT_KEYS: SortKey[] = ['score', 'profit', 'price', 'dom']
  const TABS: { id: TabId; label: string }[] = [
    { id: 'list', label: 'Properties' },
    { id: 'market', label: 'Market Intel' },
    { id: 'calc', label: 'Deal Calculator' },
  ]

  return (
    <div className="flex flex-col h-screen bg-zinc-950 font-mono overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950 z-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500 rounded-md flex items-center justify-center text-zinc-950 font-semibold text-base">⬡</div>
          <div>
            <div className="text-amber-400 font-semibold tracking-[2px] uppercase text-sm">FlipScan Pro</div>
            <div className="text-[10px] text-zinc-600 tracking-wide">Real Estate Flip Intelligence</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <div className="w-2 h-2 rounded-full bg-green-400 pulse-dot" />
          RentCast Live · AI Analysis Active
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar params={params} onChange={setParams} onSearch={handleSearch} loading={state === 'loading'} />

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-zinc-800 bg-zinc-950 flex-shrink-0">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-5 py-3.5 text-[11px] tracking-[1.5px] uppercase border-b-2 transition-colors cursor-pointer bg-transparent
                  ${tab === t.id ? 'text-amber-400 border-amber-500' : 'text-zinc-600 border-transparent hover:text-zinc-400'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto">
            {/* LIST TAB */}
            {tab === 'list' && (
              <>
                {state === 'idle' && (
                  <div className="flex flex-col items-center justify-center h-64 text-center px-8">
                    <div className="text-5xl mb-4 opacity-20">⬡</div>
                    <div className="text-sm text-zinc-300 mb-1">Ready to Find Flips</div>
                    <div className="text-xs text-zinc-600">Set your criteria and hit Search. We'll pull live RentCast data and score every deal.</div>
                  </div>
                )}

                {state === 'loading' && (
                  <div className="flex flex-col items-center justify-center h-64">
                    <div className="w-10 h-10 border-2 border-zinc-700 border-t-amber-400 rounded-full spin mb-4" />
                    <div className="text-xs text-zinc-500 tracking-wide">{loadingMsg}</div>
                  </div>
                )}

                {state === 'error' && (
                  <div className="m-5 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                    ⚠ {error}<br /><br />
                    Check your search parameters. Use "City, ST" format (e.g. "Norfolk, VA").
                  </div>
                )}

                {state === 'results' && (
                  <>
                    {/* Stats Strip */}
                    <div className="grid grid-cols-4 border-b border-zinc-800">
                      {statsData.map(s => (
                        <div key={s.label} className="p-3 border-r border-zinc-800 last:border-0">
                          <div className="text-[10px] tracking-widest uppercase text-zinc-600 mb-0.5">{s.label}</div>
                          <div className="text-lg font-semibold text-amber-400">{s.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Sort + Count */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/50">
                      <div className="text-xs text-zinc-500">
                        <span className="text-amber-400 font-semibold">{results.length}</span> deal{results.length !== 1 ? 's' : ''} found
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-zinc-600">Sort:</span>
                        {SORT_KEYS.map(k => (
                          <button key={k} onClick={() => handleSort(k)}
                            className={`px-2.5 py-1 rounded border text-[10px] tracking-wide uppercase cursor-pointer transition-colors
                              ${sortKey === k ? 'border-amber-500/50 text-amber-400 bg-amber-500/10' : 'border-zinc-800 text-zinc-600 hover:text-zinc-400 bg-transparent'}`}>
                            {k}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Cards */}
                    <div className="p-5 flex flex-col gap-3">
                      {results.map(p => (
                        <PropertyCard key={p.id} property={p} onClick={() => setSelected(p)} />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {tab === 'market' && <MarketIntel results={results} marketStats={marketStats} />}
            {tab === 'calc' && <DealCalculator />}
          </div>
        </div>
      </div>

      {/* Detail Panel */}
      <DetailPanel property={selected} onClose={() => setSelected(null)} />

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-[999] px-4 py-3 rounded-lg border text-xs font-mono transition-all
          ${toast.err
            ? 'bg-zinc-900 border-red-500/40 text-red-400'
            : 'bg-zinc-900 border-amber-500/40 text-zinc-300'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
