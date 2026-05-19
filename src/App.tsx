import { useState, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import PropertyModal from './components/PropertyModal'
import { SearchParams, AnalyzedProperty, MarketStats, SortKey, ViewMode } from './types'
import { masterSearch, fetchMarketStats, buildLocationParams } from './lib/rentcast'
import sgcLogo from '@/assets/sgc-logo.png'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { analyzeProperty, sortResults } from './lib/scoring'
import { fmt$ } from './lib/utils'

const DEFAULT_PARAMS: SearchParams = {
  searchMode: 'city',
  locationQuery: 'Norfolk, VA',
  radius: 25,
  sources: {
    activeMLS: true,
    foreclosures: true,
    shortSales: true,
    recentlyOffMarket: true,
    propertyRecords: false,
    corporateOwned: false,
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

export type AppState = 'idle' | 'loading' | 'results' | 'error'

export default function App() {
  const [params, setParams] = useState<SearchParams>(DEFAULT_PARAMS)
  const [results, setResults] = useState<AnalyzedProperty[]>([])
  const [allAnalyzed, setAllAnalyzed] = useState<AnalyzedProperty[]>([])
  const [marketStats, setMarketStats] = useState<MarketStats | null>(null)
  const [selected, setSelected] = useState<AnalyzedProperty | null>(null)
  const [appState, setAppState] = useState<AppState>('idle')
  const [apiErrors, setApiErrors] = useState<string[]>([])
  const [loadingMsg, setLoadingMsg] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [activeStrategy, setActiveStrategy] = useState<string>('all')
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const [searchMeta, setSearchMeta] = useState<{ time: number; raw: number; sources: number } | null>(null)

  const showToast = (msg: string, err = false) => {
    setToast({ msg, err })
    setTimeout(() => setToast(null), 5000)
  }

  const applySort = useCallback((key: SortKey, data: AnalyzedProperty[]) => sortResults(data, key), [])

  const handleSearch = async () => {
    const q = params.locationQuery.trim()
    if (!q) { showToast('Enter a location to search', true); return }
    const activeSrcCount = Object.values(params.sources).filter(Boolean).length
    if (activeSrcCount === 0) { showToast('Enable at least one data source', true); return }

    setAppState('loading'); setApiErrors([]); setResults([]); setAllAnalyzed([])
    const t0 = Date.now()

    try {
      setLoadingMsg(`Scanning ${activeSrcCount} data sources...`)

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

      const locParams = buildLocationParams(params.searchMode, q, params.radius)
      const ms = await fetchMarketStats(locParams).catch(() => null)
      setMarketStats(ms)

      setLoadingMsg(`Scoring ${listings.length} properties...`)
      const avgPsf = ms?.averagePricePerSquareFoot || ms?.saleData?.averagePricePerSquareFoot || null

      const analyzed = listings
        .map(raw => analyzeProperty(raw, params, avgPsf))
        .filter((p): p is AnalyzedProperty => p !== null)

      setAllAnalyzed(analyzed)
      setApiErrors(searchErrors)

      const filtered = analyzed.filter(p =>
        p.flipScore >= params.minFlipScore &&
        p.profit >= params.minProfit &&
        p.roi >= params.minROI &&
        (params.daysOnMarketMin === 0 || p.dom >= params.daysOnMarketMin) &&
        (!params.priceReduced || p.priceReduced) &&
        (params.maxYearBuilt === 0 || !p.yearBuilt || p.yearBuilt <= params.maxYearBuilt) &&
        (params.minYearBuilt === 0 || !p.yearBuilt || p.yearBuilt >= params.minYearBuilt)
      )

      const sorted = applySort(sortKey, filtered)
      setResults(sorted)
      setSearchMeta({ time: Date.now() - t0, raw: listings.length, sources: activeSrcCount })
      setAppState('results')
      setActiveStrategy('all')

      const hot = sorted.filter(r => r.flipScore >= 70).length
      showToast(sorted.length === 0
        ? `No deals found — ${listings.length} scanned. Try lowering filters.`
        : `✓ ${sorted.length} deals · ${hot > 0 ? `${hot} hot 🔥 · ` : ''}${listings.length} scanned`
      )
    } catch (e: any) {
      setApiErrors([e.message])
      setAppState('error')
      showToast('Search failed', true)
    }
  }

  const handleSort = (key: SortKey) => {
    setSortKey(key)
    setResults(prev => applySort(key, prev))
  }

  // Strategy filter — applied on top of results
  const strategyFiltered = activeStrategy === 'all'
    ? results
    : results.filter(r => {
        if (activeStrategy === 'hot')        return r.flipScore >= 70
        if (activeStrategy === 'foreclosure') return r.source === 'foreclosure'
        if (activeStrategy === 'short_sale')  return r.source === 'short_sale'
        if (activeStrategy === 'off_market')  return r.source === 'off_market' || r.source === 'property_record' || r.source === 'corporate_owned'
        if (activeStrategy === 'wholesale')   return r.price < 200000
        if (activeStrategy === 'flip')        return r.roi > 15
        if (activeStrategy === 'brrrr')       return r.cashOnCash > 20
        return true
      })

  const avg = (arr: number[]) => arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0

  return (
    <div className="flex flex-col h-screen bg-white font-mono overflow-hidden">

      {/* ── HEADER ── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-[#0a1f4d] z-50 flex-shrink-0">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9 flex-shrink-0 rounded-md bg-white p-0.5 flex items-center justify-center">
              <img src={sgcLogo} alt="SGC Built — General Contractors" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-white tracking-widest uppercase leading-none">FlipScan Pro</div>
              <div className="text-[10px] text-gold-400 tracking-wider mt-0.5">SGC General Contractors</div>
            </div>
          </div>

          {/* Strategy filter chips — only shown when results exist */}
          {appState === 'results' && results.length > 0 && (
            <div className="flex items-center gap-1 ml-4 border-l border-zinc-800 pl-4">
              {[
                { key: 'all',         label: 'All',          count: results.length },
                { key: 'hot',         label: '🔥 Hot',       count: results.filter(r => r.flipScore >= 70).length },
                { key: 'foreclosure', label: '🔨 REO',       count: results.filter(r => r.source === 'foreclosure').length },
                { key: 'short_sale',  label: '📉 Short Sale', count: results.filter(r => r.source === 'short_sale').length },
                { key: 'off_market',  label: '🔒 Off-Market', count: results.filter(r => ['off_market','property_record','corporate_owned'].includes(r.source)).length },
                { key: 'wholesale',   label: '📦 Wholesale',  count: results.filter(r => r.price < 200000).length },
                { key: 'flip',        label: '⚡ Flip',       count: results.filter(r => r.roi > 15).length },
                { key: 'brrrr',       label: '♻️ BRRRR',      count: results.filter(r => r.cashOnCash > 20).length },
              ].filter(s => s.count > 0 || s.key === 'all').map(s => (
                <button
                  key={s.key}
                  onClick={() => setActiveStrategy(s.key)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] tracking-wide font-medium transition-all cursor-pointer border
                    ${activeStrategy === s.key
                      ? 'bg-[#1a3a8f] border-[#1a3a8f] text-white'
                      : 'bg-transparent border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'}`}
                >
                  {s.label}
                  {s.count > 0 && (
                    <span className={`text-[9px] px-1 py-0.5 rounded-sm font-bold
                      ${activeStrategy === s.key ? 'bg-white/20 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                      {s.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {searchMeta && appState === 'results' && (
            <div className="hidden lg:flex items-center gap-2 text-[10px] text-zinc-600">
              <span>{params.locationQuery}</span>
              <span>·</span>
              <span>{params.searchMode === 'state' ? 'statewide' : `${params.radius}mi radius`}</span>
              <span>·</span>
              <span>{searchMeta.raw} scanned</span>
              <span>·</span>
              <span>{(searchMeta.time / 1000).toFixed(1)}s</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[11px] text-gold-400">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 pulse-dot" />
            Live
          </div>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      {/* ── BODY ── */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar params={params} onChange={setParams} onSearch={handleSearch} loading={appState === 'loading'} />

        <div className="flex-1 overflow-hidden">
          <Dashboard
            appState={appState}
            results={strategyFiltered}
            allAnalyzed={allAnalyzed}
            marketStats={marketStats}
            apiErrors={apiErrors}
            loadingMsg={loadingMsg}
            sortKey={sortKey}
            viewMode={viewMode}
            onSort={handleSort}
            onViewMode={setViewMode}
            onSelect={setSelected}
            searchMeta={searchMeta}
            params={params}
          />
        </div>
      </div>

      {/* ── PROPERTY MODAL ── */}
      {selected && (
        <PropertyModal
          property={selected}
          params={params}
          onClose={() => setSelected(null)}
        />
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-[999] px-4 py-3 rounded-lg border text-xs font-mono shadow-2xl max-w-sm transition-all
          ${toast.err ? 'bg-zinc-900 border-red-500/50 text-red-400' : 'bg-zinc-900 border-[#1a3a8f]/60 text-zinc-300'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function SignOutButton() {
  const { user, signOut } = useAuth()
  if (!user) return null
  const initial = (user.email || '?').charAt(0).toUpperCase()
  return (
    <div className="flex items-center gap-2">
      <div className="hidden md:flex items-center gap-2 text-[11px] text-gold-400/80">
        <div className="w-6 h-6 rounded-full bg-gold-400 text-[#0a1f4d] font-bold flex items-center justify-center text-[11px]">{initial}</div>
        <span className="max-w-[160px] truncate">{user.email}</span>
      </div>
      <button
        onClick={signOut}
        className="text-[10px] uppercase tracking-widest text-gold-400 hover:text-white border border-gold-500/40 hover:border-gold-400 rounded px-2.5 py-1 bg-transparent cursor-pointer transition-colors"
      >
        Sign Out
      </button>
    </div>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className="flex items-center justify-center w-8 h-8 rounded border border-gold-500/40 hover:border-gold-400 text-gold-400 hover:text-white bg-transparent cursor-pointer transition-colors"
    >
      {isDark ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      )}
    </button>
  )
}
