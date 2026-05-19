import { useState } from 'react'
import Sidebar from './components/Sidebar'
import PropertyCard from './components/PropertyCard'
import DetailPanel from './components/DetailPanel'
import MarketIntel from './components/MarketIntel'
import DealCalculator from './components/DealCalculator'
import Opportunities from './components/Opportunities'
import { SearchParams, AnalyzedProperty, MarketStats, SortKey, TabId, ViewMode } from './types'
import { fetchListings, fetchMarketStats } from './lib/rentcast'
import { analyzeProperty, sortResults } from './lib/scoring'
import { fmt$ } from './lib/utils'

const DEFAULT_PARAMS: SearchParams = {
  city: 'Norfolk, VA',
  radius: 10,
  propertyType: '',
  minPrice: 50000,
  maxPrice: 600000,
  bedrooms: 0,
  bathrooms: 0,
  minSqft: 0,
  maxSqft: 0,
  maxYearBuilt: 0,
  minYearBuilt: 0,
  daysOnMarketMax: 180,
  daysOnMarketMin: 0,
  priceReduced: false,
  minFlipScore: 40,
  minProfit: 10000,
  minROI: 8,
  strategy: 'all',
  rehabLevel: 'medium',
  customRehabCost: 50000,
  holdMonths: 6,
  financingRate: 10,
  downPaymentPct: 20,
  closingCostBuyPct: 3,
  closingCostSellPct: 2,
  agentCommissionPct: 6,
  arvMethod: 'auto',
}

type AppState = 'idle' | 'loading' | 'results' | 'error'

export default function App() {
  const [params, setParams] = useState<SearchParams>(DEFAULT_PARAMS)
  const [results, setResults] = useState<AnalyzedProperty[]>([])
  const [allAnalyzed, setAllAnalyzed] = useState<AnalyzedProperty[]>([])
  const [marketStats, setMarketStats] = useState<MarketStats | null>(null)
  const [selected, setSelected] = useState<AnalyzedProperty | null>(null)
  const [appState, setAppState] = useState<AppState>('idle')
  const [error, setError] = useState('')
  const [loadingMsg, setLoadingMsg] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [tab, setTab] = useState<TabId>('opportunities')
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const [searchTime, setSearchTime] = useState<number | null>(null)

  const showToast = (msg: string, err = false) => {
    setToast({ msg, err })
    setTimeout(() => setToast(null), 4000)
  }

  const handleSearch = async () => {
    if (!params.city.trim()) { showToast('Enter a city or zip code', true); return }
    setAppState('loading'); setError('')
    const t0 = Date.now()

    const isZip = /^\d{5}$/.test(params.city.trim())
    const apiParams: Record<string, string> = {}

    if (isZip) {
      apiParams.zipCode = params.city.trim()
    } else {
      const parts = params.city.split(',').map(s => s.trim())
      apiParams.city = parts[0]
      if (parts[1]) apiParams.state = parts[1]
    }

    if (params.minPrice)      apiParams.minPrice    = String(params.minPrice)
    if (params.maxPrice)      apiParams.maxPrice    = String(params.maxPrice)
    if (params.bedrooms)      apiParams.bedrooms    = String(params.bedrooms)
    if (params.bathrooms)     apiParams.bathrooms   = String(params.bathrooms)
    if (params.propertyType)  apiParams.propertyType = params.propertyType
    if (params.daysOnMarketMax) apiParams.daysOldMax = String(params.daysOnMarketMax)
    if (params.minSqft)       apiParams.squareFootageMin = String(params.minSqft)
    if (params.maxSqft)       apiParams.squareFootageMax = String(params.maxSqft)

    try {
      setLoadingMsg('Connecting to RentCast...')

      const marketApiParams: Record<string, string> = {}
      if (isZip) {
        marketApiParams.zipCode = params.city.trim()
      } else {
        const parts = params.city.split(',').map(s => s.trim())
        marketApiParams.city = parts[0]
        if (parts[1]) marketApiParams.state = parts[1]
        if (params.propertyType) marketApiParams.propertyType = params.propertyType
      }

      const [listingsResult, mStatsResult] = await Promise.allSettled([
        fetchListings(apiParams),
        fetchMarketStats(marketApiParams)
      ])

      setLoadingMsg('Analyzing deals...')

      const listArr = listingsResult.status === 'fulfilled' ? listingsResult.value : []
      const ms = mStatsResult.status === 'fulfilled' ? mStatsResult.value : null
      setMarketStats(ms)

      if (!listArr.length) {
        setAppState('results')
        setResults([])
        setAllAnalyzed([])
        showToast('No listings found. Try loosening your filters.')
        return
      }

      const avgPsf = ms?.averagePricePerSquareFoot || ms?.saleData?.averagePricePerSquareFoot || null

      setLoadingMsg(`Scoring ${listArr.length} properties...`)

      // Analyze ALL properties first
      const analyzed = listArr
        .map((p: any) => analyzeProperty(p, params, avgPsf))
        .filter((p: any): p is AnalyzedProperty => p !== null)

      setAllAnalyzed(analyzed)

      // Then filter by user criteria
      const filtered = analyzed.filter(p =>
        p.flipScore >= params.minFlipScore &&
        p.profit >= params.minProfit &&
        p.roi >= params.minROI &&
        (params.daysOnMarketMin === 0 || p.dom >= params.daysOnMarketMin) &&
        (!params.priceReduced || p.priceReduced) &&
        (params.maxYearBuilt === 0 || !p.yearBuilt || p.yearBuilt <= params.maxYearBuilt) &&
        (params.minYearBuilt === 0 || !p.yearBuilt || p.yearBuilt >= params.minYearBuilt)
      )

      const sorted = sortResults(filtered, sortKey)
      setResults(sorted)
      setSearchTime(Date.now() - t0)
      setAppState('results')
      showToast(`✓ ${sorted.length} deals found from ${listArr.length} listings`)
    } catch (e: any) {
      setError(e.message)
      setAppState('error')
      showToast('Search failed — check parameters', true)
    }
  }

  const handleSort = (key: SortKey) => {
    setSortKey(key)
    setResults(prev => sortResults(prev, key))
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0

  const SORT_KEYS: { key: SortKey; label: string }[] = [
    { key: 'score', label: 'Score' },
    { key: 'profit', label: 'Profit' },
    { key: 'roi', label: 'ROI' },
    { key: 'equity', label: 'Equity' },
    { key: 'price', label: 'Price' },
    { key: 'dom', label: 'DOM' },
  ]

  const TABS: { id: TabId; label: string; count?: number }[] = [
    { id: 'opportunities', label: '🎯 Opportunities', count: results.filter(r => r.flipScore >= 55).length },
    { id: 'list', label: '📋 All Results', count: results.length },
    { id: 'market', label: '📊 Market Intel' },
    { id: 'calc', label: '🔢 Calculator' },
  ]

  const statsData = results.length ? [
    { label: 'Deals Found', value: String(results.length), sub: allAnalyzed.length ? `of ${allAnalyzed.length} analyzed` : '' },
    { label: 'Hot Deals', value: String(results.filter(r => r.flipScore >= 70).length), color: 'text-green-400' },
    { label: 'Avg Score', value: String(Math.round(avg(results.map(r => r.flipScore)))), color: 'text-amber-400' },
    { label: 'Avg Profit', value: fmt$(avg(results.map(r => r.profit))), color: avg(results.map(r => r.profit)) >= 0 ? 'text-green-400' : 'text-red-400' },
    { label: 'Best ROI', value: results.length ? results.reduce((b, r) => r.roi > b.roi ? r : b).roi.toFixed(1) + '%' : '—', color: 'text-green-400' },
    { label: 'Avg Price', value: fmt$(avg(results.map(r => r.price))) },
  ] : []

  return (
    <div className="flex flex-col h-screen bg-zinc-950 font-mono overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-950 z-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500 rounded-md flex items-center justify-center text-zinc-950 font-bold text-base leading-none">⬡</div>
          <div>
            <div className="text-amber-400 font-bold tracking-[2px] uppercase text-sm">FlipScan Pro</div>
            <div className="text-[10px] text-zinc-600 tracking-wide">Real Estate Flip Intelligence · SGC General Contractors</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {searchTime && appState === 'results' && (
            <div className="text-[10px] text-zinc-600">{(searchTime / 1000).toFixed(1)}s scan</div>
          )}
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <div className="w-2 h-2 rounded-full bg-green-400 pulse-dot" />
            RentCast Live · AI Active
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar params={params} onChange={setParams} onSearch={handleSearch} loading={appState === 'loading'} />

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center border-b border-zinc-800 bg-zinc-950 flex-shrink-0 px-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-[11px] tracking-wider border-b-2 transition-colors cursor-pointer bg-transparent flex items-center gap-1.5
                  ${tab === t.id ? 'text-amber-400 border-amber-500' : 'text-zinc-600 border-transparent hover:text-zinc-400'}`}>
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-600'}`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab body */}
          <div className="flex-1 overflow-y-auto">

            {/* OPPORTUNITIES TAB */}
            {tab === 'opportunities' && (
              <>
                {appState === 'idle' && (
                  <div className="flex flex-col items-center justify-center h-72 text-center px-8">
                    <div className="text-6xl mb-5 opacity-20">🎯</div>
                    <div className="text-base font-semibold text-zinc-200 mb-2">Ready to Scan</div>
                    <div className="text-xs text-zinc-600 max-w-sm leading-relaxed">Configure your search on the left and hit <span className="text-amber-400">Scan for Deals</span>. We'll pull live listings, score every property, and surface the best flip opportunities.</div>
                  </div>
                )}
                {appState === 'loading' && (
                  <div className="flex flex-col items-center justify-center h-72">
                    <div className="w-12 h-12 border-2 border-zinc-700 border-t-amber-400 rounded-full spin mb-4" />
                    <div className="text-sm text-zinc-400 mb-1">{loadingMsg}</div>
                    <div className="text-xs text-zinc-600">Connecting to RentCast & running deal analysis...</div>
                  </div>
                )}
                {appState === 'error' && (
                  <div className="m-6 p-4 bg-red-950/30 border border-red-800/50 rounded-lg">
                    <div className="text-sm text-red-400 font-semibold mb-1">⚠️ Search Failed</div>
                    <div className="text-xs text-red-400/70">{error}</div>
                    <div className="text-xs text-zinc-600 mt-2">Try "City, ST" format (e.g. "Norfolk, VA") or a 5-digit zip.</div>
                  </div>
                )}
                {appState === 'results' && (
                  <>
                    {/* Stats strip */}
                    {statsData.length > 0 && (
                      <div className="grid grid-cols-6 border-b border-zinc-800">
                        {statsData.map(s => (
                          <div key={s.label} className="p-3 border-r border-zinc-800 last:border-0">
                            <div className="text-[9px] tracking-widest uppercase text-zinc-600 mb-0.5">{s.label}</div>
                            <div className={`text-base font-bold ${s.color || 'text-amber-400'}`}>{s.value}</div>
                            {s.sub && <div className="text-[9px] text-zinc-700">{s.sub}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                    <Opportunities results={results} onSelect={setSelected} />
                  </>
                )}
              </>
            )}

            {/* LIST TAB */}
            {tab === 'list' && (
              <>
                {appState === 'idle' && (
                  <div className="flex flex-col items-center justify-center h-64 text-center px-8">
                    <div className="text-4xl mb-4 opacity-20">📋</div>
                    <div className="text-sm text-zinc-300">Run a search to see results</div>
                  </div>
                )}
                {appState === 'loading' && (
                  <div className="flex flex-col items-center justify-center h-64">
                    <div className="w-10 h-10 border-2 border-zinc-700 border-t-amber-400 rounded-full spin mb-4" />
                    <div className="text-xs text-zinc-500">{loadingMsg}</div>
                  </div>
                )}
                {appState === 'error' && (
                  <div className="m-5 p-4 bg-red-950/30 border border-red-800/40 rounded-lg text-xs text-red-400">⚠ {error}</div>
                )}
                {appState === 'results' && (
                  <>
                    {/* Sort + view toggle */}
                    <div className="flex items-center justify-between px-5 py-2.5 border-b border-zinc-800/60 sticky top-0 bg-zinc-950 z-10">
                      <div className="text-xs text-zinc-500">
                        <span className="text-amber-400 font-semibold">{results.length}</span> deal{results.length !== 1 ? 's' : ''}
                        {allAnalyzed.length > results.length && <span className="text-zinc-700"> (filtered from {allAnalyzed.length})</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          {SORT_KEYS.map(({ key, label }) => (
                            <button key={key} onClick={() => handleSort(key)}
                              className={`px-2 py-1 rounded border text-[9px] tracking-wide uppercase cursor-pointer transition-colors
                                ${sortKey === key ? 'border-amber-500/50 text-amber-400 bg-amber-500/10' : 'border-zinc-800 text-zinc-600 hover:text-zinc-400 bg-transparent'}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="flex border border-zinc-800 rounded overflow-hidden">
                          <button onClick={() => setViewMode('cards')} className={`px-2.5 py-1 text-xs cursor-pointer transition-colors ${viewMode === 'cards' ? 'bg-zinc-700 text-zinc-200' : 'bg-transparent text-zinc-600 hover:text-zinc-400'}`}>▦</button>
                          <button onClick={() => setViewMode('table')} className={`px-2.5 py-1 text-xs cursor-pointer transition-colors ${viewMode === 'table' ? 'bg-zinc-700 text-zinc-200' : 'bg-transparent text-zinc-600 hover:text-zinc-400'}`}>≡</button>
                        </div>
                      </div>
                    </div>

                    {results.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-48 text-center px-8">
                        <div className="text-3xl mb-3 opacity-30">🔍</div>
                        <div className="text-sm text-zinc-400 mb-1">No deals match your filters</div>
                        <div className="text-xs text-zinc-600">Try lowering Min Score, Min Profit, or Min ROI thresholds</div>
                      </div>
                    ) : viewMode === 'table' ? (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-zinc-800 bg-zinc-900/50">
                              {['Property', 'Price', 'ARV', 'Profit', 'ROI', 'DOM', 'Score', 'Tags'].map(h => (
                                <th key={h} className="text-left text-[10px] uppercase tracking-widest text-zinc-600 py-2.5 px-2 font-normal first:pl-4 last:pr-4">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {results.map(p => (
                              <PropertyCard key={p.id} property={p} onClick={() => setSelected(p)} view="row" />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-5 flex flex-col gap-3">
                        {results.map(p => (
                          <PropertyCard key={p.id} property={p} onClick={() => setSelected(p)} view="card" />
                        ))}
                      </div>
                    )}
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
        <div className={`fixed bottom-5 right-5 z-[999] px-4 py-3 rounded-lg border text-xs font-mono shadow-xl
          ${toast.err ? 'bg-zinc-900 border-red-500/50 text-red-400' : 'bg-zinc-900 border-amber-500/40 text-zinc-300'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
