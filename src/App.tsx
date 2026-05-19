import { useState, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import PropertyModal from './components/PropertyModal'
import MarketPanel from './components/MarketPanel'
import DealHunter from './components/DealHunter'
import MarketAnalyzer from './components/MarketAnalyzer'
import ReferenceHub from './components/ReferenceHub'
import { SearchParams, AnalyzedProperty, MarketStats, SortKey, ViewMode } from './types'
import { masterSearch, fetchMarketStats, buildLocationParams } from './lib/rentcast'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { useFavorites } from '@/context/FavoritesContext'
import CompareModal from './components/CompareModal'
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
  const [activeTab, setActiveTab] = useState<'deals' | 'market' | 'analyzer' | 'hunt' | 'reference'>('deals')
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const [searchMeta, setSearchMeta] = useState<{ time: number; raw: number; sources: number } | null>(null)
  const [showCompare, setShowCompare] = useState(false)

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
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* ── HEADER ── */}
      <header style={{ background: 'var(--sgc-navy)', borderBottom: '1px solid var(--sgc-navy-dark)' }}
        className="flex items-center justify-between px-6 py-0 z-50 flex-shrink-0 h-14">

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 38 38" className="w-8 h-8 flex-shrink-0">
              <rect width="38" height="38" rx="5" fill="white" fillOpacity="0.12"/>
              <polyline points="19,6 32,16 32,33 6,33 6,16" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeLinejoin="round"/>
              <line x1="19" y1="6" x2="6" y2="16" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeLinecap="round"/>
              <rect x="14.5" y="24" width="9" height="9" rx="0.5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2"/>
              <text x="19" y="22" textAnchor="middle" fill="white" fontSize="9.5" fontWeight="700" fontFamily="Inter,sans-serif" letterSpacing="0.5">SGC</text>
            </svg>
            <div>
              <div style={{ fontFamily: 'Inter,sans-serif', letterSpacing: '0.12em' }}
                className="text-white font-bold text-sm uppercase leading-none tracking-widest">
                SGC <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 400 }}>Built</span>
              </div>
              <div style={{ letterSpacing: '0.18em', fontSize: '9px', color: 'rgba(255,255,255,0.5)' }}
                className="uppercase mt-0.5">
                FlipScan Pro
              </div>
            </div>
          </div>

          <div className="w-px h-6 mx-2" style={{ background: 'rgba(255,255,255,0.15)' }} />

          {appState === 'results' && results.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {[
                { key: 'all',         label: 'All Deals',    count: results.length },
                { key: 'hot',         label: '🔥 Hot',       count: results.filter(r => r.flipScore >= 70).length },
                { key: 'foreclosure', label: 'Foreclosure',  count: results.filter(r => r.source === 'foreclosure').length },
                { key: 'short_sale',  label: 'Short Sale',   count: results.filter(r => r.source === 'short_sale').length },
                { key: 'off_market',  label: 'Off-Market',   count: results.filter(r => ['off_market','property_record','corporate_owned'].includes(r.source)).length },
                { key: 'wholesale',   label: 'Wholesale',    count: results.filter(r => r.price < 200000).length },
                { key: 'flip',        label: 'Fix & Flip',   count: results.filter(r => r.roi > 15).length },
                { key: 'brrrr',       label: 'BRRRR',        count: results.filter(r => r.cashOnCash > 20).length },
              ].filter(s => s.count > 0 || s.key === 'all').map(s => (
                <button key={s.key} onClick={() => setActiveStrategy(s.key)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all cursor-pointer border"
                  style={activeStrategy === s.key
                    ? { background: 'white', borderColor: 'white', color: 'var(--sgc-navy)', fontWeight: 600 }
                    : { background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.75)' }}>
                  {s.label}
                  <span className="text-[10px] px-1.5 py-0.5 rounded-sm font-bold"
                    style={activeStrategy === s.key
                      ? { background: 'var(--sgc-navy)', color: 'white' }
                      : { background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }}>
                    {s.count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {searchMeta && appState === 'results' && (
            <div className="hidden lg:flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
              <span>{params.locationQuery}</span>
              <span>·</span>
              <span>{params.searchMode === 'state' ? 'Statewide' : `${params.radius}mi`}</span>
              <span>·</span>
              <span>{searchMeta.raw} scanned</span>
              <span>·</span>
              <span>{(searchMeta.time/1000).toFixed(1)}s</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: '#4ade80' }} />
            Live
          </div>
          <FavoritesButton onOpen={() => setShowCompare(true)} />
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      {/* ── BODY ── */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar params={params} onChange={setParams} onSearch={handleSearch} loading={appState === 'loading'} />

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Main tab bar */}
          <div className="flex items-center flex-shrink-0 px-5 pt-4 gap-1" style={{ background: 'var(--sgc-gray-light)' }}>
            {[
              { id: 'deals',  label: 'Deal Scanner', icon: '⊞', badge: strategyFiltered.length > 0 ? strategyFiltered.length : undefined },
              { id: 'market', label: 'Market Intelligence', icon: '📊', badge: undefined as number | undefined },
              { id: 'analyzer', label: 'Market Analyzer', icon: '📈', badge: undefined as number | undefined },
              { id: 'hunt',   label: 'Deal Hunter', icon: '🎯', badge: undefined as number | undefined },
              { id: 'reference', label: 'Reference Hub', icon: '📚', badge: undefined as number | undefined },
            ].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id as any)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-all cursor-pointer border border-b-0"
                style={activeTab === t.id
                  ? { background: 'white', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-navy)', fontWeight: 600 }
                  : { background: 'transparent', borderColor: 'transparent', color: 'var(--sgc-gray-mid)' }}>
                <span className="text-base leading-none">{t.icon}</span>
                {t.label}
                {t.badge != null && t.badge > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                    style={activeTab === t.id
                      ? { background: 'var(--sgc-navy)', color: 'white' }
                      : { background: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden border-t" style={{ background: 'white', borderColor: 'var(--sgc-gray-border)' }}>
            {activeTab === 'deals' && (
              <Dashboard
                appState={appState} results={strategyFiltered} allAnalyzed={allAnalyzed}
                marketStats={marketStats} apiErrors={apiErrors} loadingMsg={loadingMsg}
                sortKey={sortKey} viewMode={viewMode} onSort={handleSort}
                onViewMode={setViewMode} onSelect={setSelected} searchMeta={searchMeta} params={params}
              />
            )}
            {activeTab === 'market' && (
              <MarketPanel locationQuery={params.locationQuery} searchMode={params.searchMode}
                results={results} visible={activeTab === 'market'} />
            )}
            {activeTab === 'hunt' && (
              <DealHunter />
            )}
            {activeTab === 'analyzer' && (
              <MarketAnalyzer />
            )}
            {activeTab === 'reference' && (
              <ReferenceHub />
            )}
          </div>
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

      {/* ── COMPARE MODAL ── */}
      {showCompare && (
        <CompareModal
          onClose={() => setShowCompare(false)}
          onSelect={(p) => { setShowCompare(false); setSelected(p) }}
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
      <div className="hidden md:flex items-center gap-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
        <div className="w-6 h-6 rounded-full font-bold flex items-center justify-center text-[11px]" style={{ background: 'white', color: 'var(--sgc-navy)' }}>{initial}</div>
        <span className="max-w-[160px] truncate">{user.email}</span>
      </div>
      <button
        onClick={signOut}
        className="text-[10px] uppercase tracking-widest rounded px-2.5 py-1 bg-transparent cursor-pointer transition-colors hover:bg-white/10"
        style={{ color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.3)' }}
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
      className="flex items-center justify-center w-8 h-8 rounded bg-transparent cursor-pointer transition-colors hover:bg-white/10"
      style={{ color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.3)' }}
    >
      {isDark ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      )}
    </button>
  )
}

function FavoritesButton({ onOpen }: { onOpen: () => void }) {
  const { favorites } = useFavorites()
  const count = favorites.length
  return (
    <button
      onClick={onOpen}
      title="View saved favorites & compare"
      className="relative flex items-center gap-1.5 h-8 px-2.5 rounded bg-transparent cursor-pointer transition-colors hover:bg-white/10 text-[11px] uppercase tracking-widest"
      style={{ color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.3)' }}
    >
      <span className="text-sm leading-none">★</span>
      <span className="hidden sm:inline">Favorites</span>
      {count > 0 && (
        <span className="ml-1 text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center" style={{ background: 'white', color: 'var(--sgc-navy)' }}>
          {count}
        </span>
      )}
    </button>
  )
}

