import { useState, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import PropertyModal from './components/PropertyModal'
import MarketPanel from './components/MarketPanel'
import DealHunter from './components/DealHunter'
import ReferenceHub from './components/ReferenceHub'
import MarketAnalyzer from './components/MarketAnalyzer'
import FinancialTools, { FinancialSeed } from './components/FinancialTools'
import LeadRadar from './components/LeadRadar'
import { SearchParams, AnalyzedProperty, MarketStats, SortKey, ViewMode } from './types'
import { masterSearch, fetchMarketStats, buildLocationParams } from './lib/rentcast'
import { analyzeProperty, sortResults } from './lib/scoring'
import { fmt$ } from './lib/utils'
import sgcLogo from '@/assets/sgc-logo.png'

const DEFAULT_PARAMS: SearchParams = {
  searchMode: 'city', locationQuery: 'Norfolk, VA', radius: 25,
  sources: { activeMLS: true, foreclosures: true, shortSales: true, recentlyOffMarket: true, propertyRecords: false, corporateOwned: false },
  propertyType: '', minPrice: 50000, maxPrice: 700000,
  bedrooms: 0, bathrooms: 0, minSqft: 0, maxSqft: 0,
  maxYearBuilt: 0, minYearBuilt: 0, daysOnMarketMax: 365, daysOnMarketMin: 0,
  priceReduced: false, minFlipScore: 20, minProfit: 0, minROI: 0, strategy: 'all',
  rehabLevel: 'medium', customRehabCost: 50000, holdMonths: 6, financingRate: 10,
  downPaymentPct: 20, closingCostBuyPct: 3, closingCostSellPct: 2, agentCommissionPct: 6,
  arvMethod: 'auto',
}

export type AppState = 'idle' | 'loading' | 'results' | 'error'

const STRATEGIES = [
  { key: 'all',         label: 'All Deals',    filter: (r: AnalyzedProperty[]) => r },
  { key: 'hot',         label: '🔥 Hot',       filter: (r: AnalyzedProperty[]) => r.filter(x => x.flipScore >= 70) },
  { key: 'foreclosure', label: 'Foreclosure',  filter: (r: AnalyzedProperty[]) => r.filter(x => x.source === 'foreclosure') },
  { key: 'short_sale',  label: 'Short Sale',   filter: (r: AnalyzedProperty[]) => r.filter(x => x.source === 'short_sale') },
  { key: 'off_market',  label: 'Off-Market',   filter: (r: AnalyzedProperty[]) => r.filter(x => ['off_market','property_record','corporate_owned'].includes(x.source)) },
  { key: 'wholesale',   label: 'Wholesale',    filter: (r: AnalyzedProperty[]) => r.filter(x => x.price < 200000) },
  { key: 'flip',        label: 'Fix & Flip',   filter: (r: AnalyzedProperty[]) => r.filter(x => x.roi > 15) },
  { key: 'brrrr',       label: 'BRRRR',        filter: (r: AnalyzedProperty[]) => r.filter(x => x.cashOnCash > 20) },
]

export default function App() {
  const [params, setParams]             = useState<SearchParams>(DEFAULT_PARAMS)
  const [results, setResults]           = useState<AnalyzedProperty[]>([])
  const [allAnalyzed, setAllAnalyzed]   = useState<AnalyzedProperty[]>([])
  const [marketStats, setMarketStats]   = useState<MarketStats | null>(null)
  const [selected, setSelected]         = useState<AnalyzedProperty | null>(null)
  const [appState, setAppState]         = useState<AppState>('idle')
  const [apiErrors, setApiErrors]       = useState<string[]>([])
  const [loadingMsg, setLoadingMsg]     = useState('')
  const [sortKey, setSortKey]           = useState<SortKey>('score')
  const [viewMode, setViewMode]         = useState<ViewMode>('cards')
  const [activeStrategy, setActiveStrategy] = useState('all')
  const [activeTab, setActiveTab] = useState<'deals' | 'market' | 'analyzer' | 'financial' | 'hunt' | 'radar' | 'reference'>('deals')
  const [toast, setToast]               = useState<{ msg: string; err?: boolean } | null>(null)
  const [searchMeta, setSearchMeta]     = useState<{ time: number; raw: number } | null>(null)
  const [financialSeed, setFinancialSeed] = useState<FinancialSeed | undefined>(undefined)

  const runFinancials = (p: AnalyzedProperty) => {
    setFinancialSeed({
      price: p.price,
      arv: p.arv,
      rehab: p.rehabCost,
      addr: `${p.addr}, ${p.city}, ${p.state}`,
    })
    setActiveTab('financial')
  }

  const showToast = (msg: string, err = false) => {
    setToast({ msg, err })
    setTimeout(() => setToast(null), 5000)
  }

  const applySort = useCallback((key: SortKey, data: AnalyzedProperty[]) => sortResults(data, key), [])

  const handleSearch = async () => {
    const q = params.locationQuery.trim()
    if (!q) { showToast('Enter a location to search', true); return }
    const srcCount = Object.values(params.sources).filter(Boolean).length
    if (!srcCount) { showToast('Enable at least one data source', true); return }

    setAppState('loading'); setApiErrors([]); setResults([]); setAllAnalyzed([])
    const t0 = Date.now()

    try {
      setLoadingMsg(`Scanning ${srcCount} data sources...`)
      const { listings, errors: errs } = await masterSearch({
        mode: params.searchMode, query: q, radius: params.radius, sources: params.sources,
        filters: {
          minPrice: params.minPrice || undefined, maxPrice: params.maxPrice || undefined,
          bedrooms: params.bedrooms || undefined, bathrooms: params.bathrooms || undefined,
          minSqft: params.minSqft || undefined, maxSqft: params.maxSqft || undefined,
          minYear: params.minYearBuilt || undefined, maxYear: params.maxYearBuilt || undefined,
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
      setApiErrors(errs)

      const filtered = analyzed.filter(p =>
        p.flipScore >= params.minFlipScore && p.profit >= params.minProfit && p.roi >= params.minROI &&
        (params.daysOnMarketMin === 0 || p.dom >= params.daysOnMarketMin) &&
        (!params.priceReduced || p.priceReduced) &&
        (params.maxYearBuilt === 0 || !p.yearBuilt || p.yearBuilt <= params.maxYearBuilt) &&
        (params.minYearBuilt === 0 || !p.yearBuilt || p.yearBuilt >= params.minYearBuilt)
      )

      const sorted = applySort(sortKey, filtered)
      setResults(sorted); setActiveStrategy('all')
      setSearchMeta({ time: Date.now() - t0, raw: listings.length })
      setAppState('results')

      const hot = sorted.filter(r => r.flipScore >= 70).length
      showToast(sorted.length === 0
        ? `No deals found in ${listings.length} scanned — lower your thresholds`
        : `${sorted.length} deals found${hot > 0 ? ` · ${hot} hot` : ''} · ${listings.length} properties scanned`)
    } catch (e: any) {
      setApiErrors([e.message]); setAppState('error')
      showToast('Search failed', true)
    }
  }

  const handleSort = (key: SortKey) => { setSortKey(key); setResults(prev => applySort(key, prev)) }

  const stratDef = STRATEGIES.find(s => s.key === activeStrategy) || STRATEGIES[0]
  const strategyFiltered = stratDef.filter(results)

  const avg = (arr: number[]) => arr.length ? arr.reduce((s,n) => s+n,0) / arr.length : 0

  const STRATEGY_PILLS = STRATEGIES.map(s => ({
    ...s, count: s.filter(results).length
  })).filter(s => s.count > 0 || s.key === 'all')

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--sgc-gray-light)' }}>

      {/* ── HEADER ── */}
      <header style={{ background: 'var(--sgc-navy)', borderBottom: '1px solid var(--sgc-navy-dark)' }}
        className="flex items-center justify-between px-6 py-0 z-50 flex-shrink-0 h-14">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            {/* SGC logo */}
            <div className="w-9 h-9 flex-shrink-0 rounded bg-white flex items-center justify-center p-1">
              <img src={sgcLogo} alt="SGC Built" className="w-full h-full object-contain" />
            </div>
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

          {/* Divider */}
          <div className="w-px h-6 mx-2" style={{ background: 'rgba(255,255,255,0.15)' }} />

          {/* Strategy filter pills — only when results */}
          {appState === 'results' && results.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {STRATEGY_PILLS.map(s => (
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

        {/* Right side */}
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
        </div>
      </header>

      {/* ── BODY ── */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar params={params} onChange={setParams} onSearch={handleSearch} loading={appState === 'loading'} />

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Main tab bar */}
          <div className="flex items-center flex-shrink-0 px-5 pt-4 gap-1"
            style={{ background: 'var(--sgc-gray-light)' }}>
            {[
              { id: 'deals',    label: 'Deal Scanner',       icon: '⊞', badge: strategyFiltered.length > 0 ? strategyFiltered.length : undefined },
              { id: 'market',   label: 'Market Trends',       icon: '📊', badge: undefined },
              { id: 'analyzer',  label: 'Area Intelligence',   icon: '🔬', badge: undefined },
              { id: 'financial', label: 'Financial Tools',      icon: '💹', badge: undefined },
              { id: 'radar',    label: 'Lead Radar',            icon: '📡', badge: undefined },
              { id: 'hunt',      label: 'Deal Hunter',          icon: '🎯', badge: undefined },
              { id: 'reference',label: 'Lead Sources',        icon: '📚', badge: undefined },
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

          {/* Tab content */}
          <div className="flex-1 overflow-hidden border-t" style={{ background: 'white', borderColor: 'var(--sgc-gray-border)' }}>
            {activeTab === 'deals' && (
              <Dashboard
                appState={appState} results={strategyFiltered} allAnalyzed={allAnalyzed}
                marketStats={marketStats} apiErrors={apiErrors} loadingMsg={loadingMsg}
                sortKey={sortKey} viewMode={viewMode} onSort={handleSort}
                onViewMode={setViewMode} onSelect={setSelected} searchMeta={searchMeta} params={params}
                onRunFinancials={runFinancials}
              />
            )}
            {activeTab === 'market' && (
              <MarketPanel locationQuery={params.locationQuery} searchMode={params.searchMode}
                results={results} visible={activeTab === 'market'} />
            )}
            {activeTab === 'analyzer'  && <MarketAnalyzer />}
            {activeTab === 'financial' && <FinancialTools seed={financialSeed} />}
            {activeTab === 'radar'     && <LeadRadar />}
            {activeTab === 'hunt'      && <DealHunter />}
            {activeTab === 'reference' && <ReferenceHub />}
          </div>
        </div>
      </div>

      {selected && <PropertyModal property={selected} params={params} onClose={() => setSelected(null)} />}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[999] px-4 py-3 rounded-lg text-sm shadow-lg flex items-center gap-2"
          style={{
            background: toast.err ? 'var(--sgc-danger-bg)' : 'var(--sgc-navy)',
            color: toast.err ? 'var(--sgc-danger)' : 'white',
            border: `1px solid ${toast.err ? 'var(--sgc-danger)' : 'var(--sgc-navy-dark)'}`,
          }}>
          {toast.err ? '⚠' : '✓'} {toast.msg}
        </div>
      )}
    </div>
  )
}
