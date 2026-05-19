import { useState } from 'react'
import Sidebar from './components/Sidebar'
import PropertyCard from './components/PropertyCard'
import DetailPanel from './components/DetailPanel'
import MarketIntel from './components/MarketIntel'
import DealCalculator from './components/DealCalculator'
import Opportunities from './components/Opportunities'
import { SearchParams, AnalyzedProperty, MarketStats, SortKey, TabId, ViewMode } from './types'
import { masterSearch, fetchMarketStats, buildLocationParams } from './lib/rentcast'
import { analyzeProperty, sortResults } from './lib/scoring'
import { fmt$ } from './lib/utils'

const DEFAULT_PARAMS: SearchParams = {
  searchMode: 'city',
  locationQuery: 'Norfolk, VA',
  radius: 25,
  sources: {
    activeMLS:          true,
    foreclosures:       true,
    shortSales:         true,
    recentlyOffMarket:  true,
    propertyRecords:    false,
    corporateOwned:     false,
  },
  propertyType: '',
  minPrice: 50000,
  maxPrice: 700000,
  bedrooms: 0,
  bathrooms: 0,
  minSqft: 0,
  maxSqft: 0,
  maxYearBuilt: 0,
  minYearBuilt: 0,
  daysOnMarketMax: 365,
  daysOnMarketMin: 0,
  priceReduced: false,
  minFlipScore: 20,
  minProfit: 0,
  minROI: 0,
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
  const [errors, setErrors] = useState<string[]>([])
  const [loadingMsg, setLoadingMsg] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [tab, setTab] = useState<TabId>('opportunities')
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const [searchMeta, setSearchMeta] = useState<{ time: number; raw: number; sources: number } | null>(null)

  const showToast = (msg: string, err = false) => {
    setToast({ msg, err })
    setTimeout(() => setToast(null), 5000)
  }

  const handleSearch = async () => {
    const q = params.locationQuery.trim()
    if (!q) { showToast('Enter a location to search', true); return }

    const activeSources = Object.values(params.sources).filter(Boolean).length
    if (activeSources === 0) { showToast('Enable at least one data source', true); return }

    setAppState('loading'); setErrors([]); setResults([]); setAllAnalyzed([])
    const t0 = Date.now()

    try {
      setLoadingMsg(`Scanning ${activeSources} data sources...`)

      // Run master search (parallel across all enabled sources)
      const { listings, errors: searchErrors } = await masterSearch({
        mode: params.searchMode,
        query: q,
        radius: params.radius,
        sources: params.sources,
        filters: {
          minPrice: params.minPrice || undefined,
          maxPrice: params.maxPrice || undefined,
          bedrooms: params.bedrooms || undefined,
          bathrooms: params.bathrooms || undefined,
          minSqft: params.minSqft || undefined,
          maxSqft: params.maxSqft || undefined,
          minYear: params.minYearBuilt || undefined,
          maxYear: params.maxYearBuilt || undefined,
          propertyType: params.propertyType || undefined,
          maxDom: params.daysOnMarketMax < 365 ? params.daysOnMarketMax : undefined,
          minDom: params.daysOnMarketMin > 0 ? params.daysOnMarketMin : undefined,
        },
      })

      // Get market stats in parallel
      const locParams = buildLocationParams(params.searchMode, q, params.radius)
      const ms = await fetchMarketStats(locParams).catch(() => null)
      setMarketStats(ms)

      setLoadingMsg(`Scoring ${listings.length} properties...`)
      const avgPsf = ms?.averagePricePerSquareFoot || ms?.saleData?.averagePricePerSquareFoot || null

      const analyzed = listings
        .map(raw => analyzeProperty(raw, params, avgPsf))
        .filter((p): p is AnalyzedProperty => p !== null)

      setAllAnalyzed(analyzed)
      setErrors(searchErrors)

      // Client-side filtering
      const filtered = analyzed.filter(p =>
        p.flipScore   >= params.minFlipScore &&
        p.profit      >= params.minProfit &&
        p.roi         >= params.minROI &&
        (params.daysOnMarketMin === 0 || p.dom >= params.daysOnMarketMin) &&
        (!params.priceReduced || p.priceReduced) &&
        (params.maxYearBuilt === 0 || !p.yearBuilt || p.yearBuilt <= params.maxYearBuilt) &&
        (params.minYearBuilt === 0 || !p.yearBuilt || p.yearBuilt >= params.minYearBuilt)
      )

      const sorted = sortResults(filtered, sortKey)
      setResults(sorted)
      setSearchMeta({ time: Date.now() - t0, raw: listings.length, sources: activeSources })
      setAppState('results')

      const hotCount = sorted.filter(r => r.flipScore >= 70).length
      if (sorted.length === 0) {
        showToast(`No deals match filters — ${listings.length} properties scanned. Try lowering score/profit thresholds.`)
      } else {
        showToast(`✓ ${sorted.length} deals found · ${hotCount > 0 ? `${hotCount} hot 🔥 · ` : ''}${listings.length} scanned`)
      }
    } catch (e: any) {
      setErrors([e.message])
      setAppState('error')
      showToast('Search failed — check error details', true)
    }
  }

  const handleSort = (key: SortKey) => {
    setSortKey(key)
    setResults(prev => sortResults(prev, key))
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0

  const SORT_KEYS: { key: SortKey; label: string }[] = [
    { key: 'score',  label: 'Score'  },
    { key: 'profit', label: 'Profit' },
    { key: 'roi',    label: 'ROI'    },
    { key: 'equity', label: 'Equity' },
    { key: 'price',  label: 'Price'  },
    { key: 'dom',    label: 'DOM'    },
  ]

  const TABS: { id: TabId; label: string; badge?: number }[] = [
    { id: 'opportunities', label: '🎯 Opportunities', badge: results.filter(r => r.flipScore >= 55).length },
    { id: 'list',          label: '📋 All Results',   badge: results.length },
    { id: 'market',        label: '📊 Market Intel' },
    { id: 'calc',          label: '🔢 Calculator'   },
  ]

  const statsData = results.length ? [
    { label: 'Deals Found',  value: String(results.length), sub: searchMeta ? `of ${searchMeta.raw} scanned` : '', color: '' },
    { label: 'Hot 🔥',       value: String(results.filter(r => r.flipScore >= 70).length), color: 'text-green-400' },
    { label: 'Avg Score',    value: String(Math.round(avg(results.map(r => r.flipScore)))), color: 'text-blue-900' },
    { label: 'Avg Profit',   value: fmt$(avg(results.map(r => r.profit))), color: avg(results.map(r => r.profit)) >= 0 ? 'text-green-400' : 'text-red-400' },
    { label: 'Best ROI',     value: results.reduce((b, r) => r.roi > b ? r.roi : b, 0).toFixed(1) + '%', color: 'text-green-400' },
    { label: 'Avg Price',    value: fmt$(avg(results.map(r => r.price))), color: '' },
  ] : []

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center h-full min-h-[360px] text-center px-8">
      <div className="text-7xl mb-6 opacity-15">🎯</div>
      <div className="text-base font-semibold text-slate-800 mb-2">Multi-Source Deal Scanner</div>
      <div className="text-xs text-slate-500 max-w-sm leading-relaxed mb-6">
        Enable your data sources on the left, set your location + radius up to <span className="text-blue-900">100 miles</span>, and hit Scan.
      </div>
      <div className="grid grid-cols-2 gap-2 text-left max-w-xs w-full">
        {[
          { icon: '🏠', t: 'Active MLS',        d: 'Listed properties on the MLS' },
          { icon: '🔨', t: 'Foreclosures',       d: 'Bank-owned & REO properties' },
          { icon: '📉', t: 'Short Sales',        d: 'Pre-foreclosure deals' },
          { icon: '🔒', t: 'Off-Market',         d: 'Recently delisted (90 days)' },
          { icon: '📋', t: 'Property Records',   d: '140M+ non-listed owners' },
          { icon: '🏢', t: 'Corporate Owned',    d: 'Org-owned motivated sellers' },
        ].map(({ icon, t, d }) => (
          <div key={t} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
            <div className="text-[11px] text-blue-900 mb-0.5">{icon} {t}</div>
            <div className="text-[9px] text-slate-500 leading-relaxed">{d}</div>
          </div>
        ))}
      </div>
    </div>
  )

  const LoadingState = () => (
    <div className="flex flex-col items-center justify-center h-72">
      <div className="w-14 h-14 border-2 border-slate-300 border-t-blue-900 rounded-full spin mb-5" />
      <div className="text-sm text-slate-700 mb-1">{loadingMsg}</div>
      <div className="text-xs text-slate-500">Pulling live data from {searchMeta?.sources || '?'} sources...</div>
    </div>
  )

  const ErrorState = () => (
    <div className="m-6 space-y-2">
      {errors.map((e, i) => (
        <div key={i} className="p-3 bg-red-950/30 border border-red-800/40 rounded-lg text-xs text-red-400 font-mono">
          ⚠ {e}
        </div>
      ))}
      <div className="text-[11px] text-slate-500 mt-2 space-y-1">
        <div>• City: "Norfolk, VA" or "Norfolk VA"</div>
        <div>• State: "Virginia" or "VA"</div>
        <div>• Zip: "23501"</div>
        <div>• Address: "123 Main St, Norfolk, VA"</div>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-screen bg-white font-mono overflow-hidden">
      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white z-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-900 rounded-md flex items-center justify-center text-white font-bold text-base">⬡</div>
          <div>
            <div className="text-blue-900 font-bold tracking-[2px] uppercase text-sm">FlipScan Pro</div>
            <div className="text-[10px] text-slate-500 tracking-wide">Multi-Source Deal Intelligence · SGC General Contractors</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {searchMeta && appState === 'results' && (
            <div className="text-[10px] text-slate-500 hidden md:flex items-center gap-3">
              <span>{params.locationQuery} · {params.searchMode === 'state' ? 'statewide' : `${params.radius}mi`}</span>
              <span>·</span>
              <span>{searchMeta.sources} sources · {(searchMeta.time / 1000).toFixed(1)}s</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <div className="w-2 h-2 rounded-full bg-green-400 pulse-dot" />
            RentCast Live
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar params={params} onChange={setParams} onSearch={handleSearch} loading={appState === 'loading'} />

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* TABS */}
          <div className="flex items-center border-b border-slate-200 bg-white flex-shrink-0 px-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-[11px] tracking-wider border-b-2 transition-colors cursor-pointer bg-transparent flex items-center gap-1.5 whitespace-nowrap
                  ${tab === t.id ? 'text-blue-900 border-blue-900' : 'text-slate-500 border-transparent hover:text-slate-600'}`}>
                {t.label}
                {t.badge !== undefined && t.badge > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-blue-900/10 text-blue-900' : 'bg-slate-100 text-slate-500'}`}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* OPPORTUNITIES TAB */}
            {tab === 'opportunities' && (
              <>
                {appState === 'idle'    && <EmptyState />}
                {appState === 'loading' && <LoadingState />}
                {appState === 'error'   && <ErrorState />}
                {appState === 'results' && (
                  <>
                    {/* Source breakdown strip */}
                    {searchMeta && allAnalyzed.length > 0 && (
                      <div className="flex gap-1 px-4 py-2 border-b border-slate-200/70 flex-wrap">
                        {(['active_mls','foreclosure','short_sale','off_market','property_record','corporate_owned'] as const).map(src => {
                          const count = allAnalyzed.filter(r => r.source === src).length
                          if (!count) return null
                          const labels: Record<string, string> = {
                            active_mls: '🏠 MLS', foreclosure: '🔨 Foreclosure',
                            short_sale: '📉 Short Sale', off_market: '🔒 Off-Market',
                            property_record: '📋 Records', corporate_owned: '🏢 Corporate'
                          }
                          return (
                            <span key={src} className="text-[10px] px-2 py-0.5 rounded border border-slate-300 text-slate-500">
                              {labels[src]} <span className="text-blue-900">{count}</span>
                            </span>
                          )
                        })}
                      </div>
                    )}
                    {statsData.length > 0 && (
                      <div className="grid grid-cols-6 border-b border-slate-200">
                        {statsData.map(s => (
                          <div key={s.label} className="p-3 border-r border-slate-200 last:border-0">
                            <div className="text-[9px] tracking-widest uppercase text-slate-500 mb-0.5">{s.label}</div>
                            <div className={`text-base font-bold ${s.color || 'text-blue-900'}`}>{s.value}</div>
                            {s.sub && <div className="text-[9px] text-slate-400">{s.sub}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* API errors as warnings (not fatal) */}
                    {errors.length > 0 && (
                      <div className="mx-4 mt-3 p-2 bg-blue-100/20 border border-blue-300 rounded text-[10px] text-blue-900">
                        ⚠️ Some sources had errors: {errors.join(' · ')}
                      </div>
                    )}
                    <Opportunities results={results} onSelect={setSelected} />
                  </>
                )}
              </>
            )}

            {/* ALL RESULTS TAB */}
            {tab === 'list' && (
              <>
                {(appState === 'idle' || appState === 'loading') && (
                  <div className="flex flex-col items-center justify-center h-64 text-center px-8">
                    {appState === 'loading'
                      ? <><div className="w-10 h-10 border-2 border-slate-300 border-t-blue-900 rounded-full spin mb-4" /><div className="text-xs text-slate-500">{loadingMsg}</div></>
                      : <><div className="text-4xl mb-4 opacity-20">📋</div><div className="text-sm text-slate-600">Run a search to see results</div></>
                    }
                  </div>
                )}
                {appState === 'error' && <ErrorState />}
                {appState === 'results' && (
                  <>
                    <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-200/70 sticky top-0 bg-white z-10">
                      <div className="text-xs text-slate-500">
                        <span className="text-blue-900 font-semibold">{results.length}</span> deals
                        {allAnalyzed.length > results.length && <span className="text-slate-400"> (from {allAnalyzed.length})</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          {SORT_KEYS.map(({ key, label }) => (
                            <button key={key} onClick={() => handleSort(key)}
                              className={`px-2 py-1 rounded border text-[9px] tracking-wide uppercase cursor-pointer transition-colors
                                ${sortKey === key ? 'border-blue-900/40 text-blue-900 bg-blue-900/10' : 'border-slate-200 text-slate-500 hover:text-slate-600 bg-transparent'}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="flex border border-slate-200 rounded overflow-hidden">
                          {(['cards','table'] as ViewMode[]).map(v => (
                            <button key={v} onClick={() => setViewMode(v)}
                              className={`px-2.5 py-1 text-xs cursor-pointer transition-colors ${viewMode === v ? 'bg-slate-200 text-slate-800' : 'bg-transparent text-slate-500 hover:text-slate-600'}`}>
                              {v === 'cards' ? '▦' : '≡'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {results.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-48 text-center px-8">
                        <div className="text-3xl mb-3 opacity-30">🔍</div>
                        <div className="text-sm text-slate-600 mb-1">No deals match filters</div>
                        <div className="text-xs text-slate-500">Lower Min Score / Min Profit / Min ROI sliders</div>
                      </div>
                    ) : viewMode === 'table' ? (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                              {['Property','Source','Price','ARV','Profit','ROI','DOM','Score'].map(h => (
                                <th key={h} className="text-left text-[10px] uppercase tracking-widest text-slate-500 py-2.5 px-2 font-normal first:pl-4 last:pr-4">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {results.map(p => <PropertyCard key={p.id} property={p} onClick={() => setSelected(p)} view="row" />)}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-5 flex flex-col gap-3">
                        {results.map(p => <PropertyCard key={p.id} property={p} onClick={() => setSelected(p)} view="card" />)}
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {tab === 'market' && <MarketIntel results={results} marketStats={marketStats} />}
            {tab === 'calc'   && <DealCalculator />}
          </div>
        </div>
      </div>

      <DetailPanel property={selected} onClose={() => setSelected(null)} />

      {toast && (
        <div className={`fixed bottom-5 right-5 z-[999] px-4 py-3 rounded-lg border text-xs font-mono shadow-xl max-w-sm
          ${toast.err ? 'bg-slate-50 border-red-500/50 text-red-400' : 'bg-slate-50 border-blue-900/40 text-slate-700'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
