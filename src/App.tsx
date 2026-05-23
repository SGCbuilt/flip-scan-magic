/**
 * FlipScan Pro — SGC General Contractors
 * Rebuilt shell: vertical sidebar nav + command dashboard
 *
 * Design: Refined utilitarian — dark navy sidebar, clean white content.
 * Every screen reachable in one click. No horizontal scrolling.
 * Live status indicators on every nav item that has pending work.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import Dashboard         from './components/Dashboard'
import PropertyModal     from './components/PropertyModal'
import MarketPanel       from './components/MarketPanel'
import DealHunter        from './components/DealHunter'
import ReferenceHub      from './components/ReferenceHub'
import MarketAnalyzer    from './components/MarketAnalyzer'
import FinancialTools    from './components/FinancialTools'
import LeadRadar         from './components/LeadRadar'
import Pipeline          from './components/Pipeline'
import Wholesale         from './components/Wholesale'
import DriveForDollars   from './components/DriveForDollars'
import Tasks             from './components/Tasks'
import KPIDashboard      from './components/Dashboard2'
import BuyerList         from './components/BuyerList'
import ListStacking      from './components/ListStacking'
import DealPLTracker     from './components/DealPL'
import DailyDigest       from './components/DailyDigest'
import DripSequences     from './components/DripSequences'
import ProjectTracker    from './components/ProjectTracker'
import NeighborhoodVelocity from './components/NeighborhoodVelocity'
import Settings from './components/Settings'
import { getTaskStats }  from './lib/followUpEngine'
import { getDripStats }  from './lib/drip'
import { hydratFromCloud } from './lib/cloudSync'
import { SearchParams, AnalyzedProperty, MarketStats, SortKey, ViewMode } from './types'
import { masterSearch, fetchMarketStats, buildLocationParams } from './lib/rentcast'
import { analyzeProperty, sortResults } from './lib/scoring'

// ── Types ────────────────────────────────────────────────────────────────────
export type AppState = 'idle' | 'loading' | 'results' | 'error'

type TabId =
  | 'home' | 'kpi'
  | 'radar' | 'velocity' | 'stack' | 'drive'
  | 'pipeline' | 'tasks' | 'drip' | 'project' | 'pl'
  | 'deals' | 'hunt'
  | 'wholesale' | 'buyers'
  | 'financial' | 'market' | 'analyzer' | 'reference'
  | 'settings'

// ── Nav structure ─────────────────────────────────────────────────────────────
interface NavItem {
  id:      TabId
  label:   string
  icon:    string
  badge?:  () => number | undefined
  tip:     string   // one-line description shown on hover
}

interface NavSection {
  section: string
  color:   string
  items:   NavItem[]
}

const NAV: NavSection[] = [
  {
    section: 'Command',
    color:   'rgba(255,255,255,0.5)',
    items: [
      { id: 'home', label: 'Morning Brief',  icon: '☀️', badge: () => { const s = getTaskStats(); return (s.overdue + s.dueToday) || undefined }, tip: 'Daily digest — leads, tasks, stale pipeline' },
      { id: 'kpi',  label: 'KPI Dashboard',  icon: '📊', tip: 'Business performance, accuracy, conversion rates' },
    ],
  },
  {
    section: 'Find Deals',
    color:   'rgba(255,255,255,0.5)',
    items: [
      { id: 'radar',    label: 'Lead Radar',      icon: '📡', tip: '11 gov APIs — Norfolk, VB, Charlotte, Raleigh…' },
      { id: 'velocity', label: 'Neighborhood',     icon: '🗺️', tip: 'Velocity index — where to focus before the market' },
      { id: 'stack',    label: 'List Stack',       icon: '⚡', tip: 'Cross-source signal stacking — triple-signal leads' },
      { id: 'drive',    label: 'Drive for Dollars',icon: '🚗', tip: 'Mobile capture — curb appeal + instant skip trace' },
      { id: 'deals',    label: 'Deal Scanner',     icon: '🔍', tip: 'MLS + off-market search with flip scoring' },
      { id: 'hunt',     label: 'Deal Hunter',      icon: '🎰', tip: 'Advanced criteria-based property hunting' },
    ],
  },
  {
    section: 'Work Deals',
    color:   'rgba(255,255,255,0.5)',
    items: [
      { id: 'pipeline', label: 'Pipeline CRM',     icon: '🎯', tip: 'Kanban CRM — every lead from radar to closed' },
      { id: 'tasks',    label: 'Tasks',             icon: '✅', badge: () => { const s = getTaskStats(); return (s.overdue + s.dueToday) || undefined }, tip: 'Auto-generated follow-up task command center' },
      { id: 'drip',     label: 'Drip Sequences',   icon: '🔄', badge: () => getDripStats().dueToday || undefined, tip: 'Automated 60-day multi-touch follow-up' },
    ],
  },
  {
    section: 'Execute',
    color:   'rgba(255,255,255,0.5)',
    items: [
      { id: 'project', label: 'Project Clock',     icon: '⏱️', tip: 'Construction timeline tracker — carry cost clock' },
      { id: 'pl',      label: 'Deal P&L',          icon: '📒', tip: 'Actuals vs estimates — costing intelligence' },
    ],
  },
  {
    section: 'Wholesale',
    color:   'rgba(255,255,255,0.5)',
    items: [
      { id: 'wholesale', label: 'Wholesale',       icon: '🏷️', tip: 'Deal listings, PDF generator, email blast' },
      { id: 'buyers',    label: 'Buyer List',      icon: '👥', tip: 'Buy box matching + one-click deal blast' },
    ],
  },
  {
    section: 'Research',
    color:   'rgba(255,255,255,0.5)',
    items: [
      { id: 'financial',  label: 'Financial Tools',  icon: '💹', tip: 'Rehab estimator, flip calc, BRRRR, live rates' },
      { id: 'market',     label: 'Market Trends',    icon: '📈', tip: 'Area market stats, DOM, price trends' },
      { id: 'analyzer',   label: 'Area Intelligence', icon: '🔬', tip: 'Claude AI market analysis by location' },
      { id: 'reference',  label: 'Lead Sources',     icon: '📚', tip: 'Guide to all data sources and gov APIs' },
    ],
  },
  {
    section: 'System',
    color:   'rgba(255,255,255,0.5)',
    items: [
      { id: 'settings', label: 'Settings',  icon: '⚙️', tip: 'API keys, cloud sync, SMS templates, direct mail' },
    ],
  },
]

// ── Deal Scanner defaults ─────────────────────────────────────────────────────
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

const STRATEGIES = [
  { key: 'all',         label: 'All',         filter: (r: AnalyzedProperty[]) => r },
  { key: 'hot',         label: '🔥 Hot',      filter: (r: AnalyzedProperty[]) => r.filter(x => x.flipScore >= 70) },
  { key: 'foreclosure', label: 'Foreclosure', filter: (r: AnalyzedProperty[]) => r.filter(x => x.source === 'foreclosure') },
  { key: 'short_sale',  label: 'Short Sale',  filter: (r: AnalyzedProperty[]) => r.filter(x => x.source === 'short_sale') },
  { key: 'off_market',  label: 'Off-Market',  filter: (r: AnalyzedProperty[]) => r.filter(x => ['off_market','property_record','corporate_owned'].includes(x.source)) },
  { key: 'wholesale',   label: 'Wholesale',   filter: (r: AnalyzedProperty[]) => r.filter(x => x.price < 200000) },
  { key: 'flip',        label: 'Fix & Flip',  filter: (r: AnalyzedProperty[]) => r.filter(x => x.roi > 15) },
]

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ activeTab, onTab, collapsed, onToggle }: {
  activeTab: TabId
  onTab:     (id: TabId) => void
  collapsed: boolean
  onToggle:  () => void
}) {
  const [hoveredTip, setHoveredTip] = useState<string | null>(null)

  return (
    <aside
      className="flex flex-col flex-shrink-0 h-full overflow-hidden transition-all duration-200 relative"
      style={{
        width:      collapsed ? 56 : 220,
        background: '#0F2460',
        borderRight:'1px solid rgba(255,255,255,0.07)',
      }}>

      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', minHeight: 56 }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.1)' }}>
          <svg viewBox="0 0 24 24" className="w-5 h-5">
            <polyline points="12,3 20,9 20,21 4,21 4,9" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinejoin="round"/>
            <line x1="12" y1="3" x2="4" y2="9" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round"/>
            <rect x="9" y="15" width="6" height="6" rx="0.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2"/>
            <text x="12" y="13.5" textAnchor="middle" fill="white" fontSize="5.5" fontWeight="800" fontFamily="monospace" letterSpacing="0.3">SGC</text>
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-[11px] font-bold tracking-widest text-white uppercase leading-none">FlipScan</div>
            <div className="text-[9px] tracking-wider mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>SGC Pro · sgcflip.com</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {NAV.map(section => (
          <div key={section.section} className="mb-1">
            {!collapsed && (
              <div className="px-3 pt-3 pb-1 text-[9px] font-bold tracking-widest uppercase"
                style={{ color: 'rgba(255,255,255,0.28)' }}>
                {section.section}
              </div>
            )}
            {collapsed && <div className="my-2 mx-3 h-px" style={{ background: 'rgba(255,255,255,0.08)' }}/>}

            {section.items.map(item => {
              const badge  = item.badge?.()
              const active = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => onTab(item.id)}
                  onMouseEnter={() => setHoveredTip(collapsed ? item.label + ' — ' + item.tip : null)}
                  onMouseLeave={() => setHoveredTip(null)}
                  title={collapsed ? item.label : undefined}
                  className="w-full flex items-center gap-2.5 cursor-pointer border-none transition-all relative group"
                  style={{
                    padding:    collapsed ? '8px 0' : '7px 10px 7px 12px',
                    margin:     '1px 4px',
                    width:      'calc(100% - 8px)',
                    borderRadius: 8,
                    background: active
                      ? 'rgba(255,255,255,0.12)'
                      : 'transparent',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                  }}>

                  {/* Active indicator */}
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                      style={{ background: '#60A5FA' }}/>
                  )}

                  {/* Icon */}
                  <span className="text-base leading-none flex-shrink-0"
                    style={{ opacity: active ? 1 : 0.65, filter: active ? 'none' : 'grayscale(0.3)' }}>
                    {item.icon}
                  </span>

                  {/* Label */}
                  {!collapsed && (
                    <span className="text-xs font-medium flex-1 text-left truncate"
                      style={{ color: active ? 'white' : 'rgba(255,255,255,0.65)', fontWeight: active ? 600 : 400 }}>
                      {item.label}
                    </span>
                  )}

                  {/* Badge */}
                  {badge !== undefined && badge > 0 && (
                    <span className="text-[9px] font-black rounded-full flex-shrink-0 flex items-center justify-center"
                      style={{
                        background: '#EF4444',
                        color:      'white',
                        minWidth:   16,
                        height:     16,
                        padding:    '0 4px',
                        position:   collapsed ? 'absolute' : 'relative',
                        top:        collapsed ? 4 : undefined,
                        right:      collapsed ? 4 : undefined,
                      }}>
                      {badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="flex-shrink-0 flex items-center gap-2 cursor-pointer border-none transition-all"
        style={{
          padding:    '10px 16px',
          background: 'transparent',
          borderTop:  '1px solid rgba(255,255,255,0.07)',
          color:      'rgba(255,255,255,0.35)',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
        <span className="text-sm">{collapsed ? '→' : '←'}</span>
        {!collapsed && <span className="text-[10px]">Collapse</span>}
      </button>

      {/* Tooltip for collapsed mode */}
      {hoveredTip && collapsed && (
        <div className="fixed z-[999] pointer-events-none text-xs rounded-lg px-3 py-2 shadow-xl"
          style={{ left: 64, background: '#1B3A8C', color: 'white', top: '50%', transform: 'translateY(-50%)', maxWidth: 220 }}>
          {hoveredTip}
        </div>
      )}
    </aside>
  )
}

// ── Topbar ────────────────────────────────────────────────────────────────────
function Topbar({ activeTab, appState, results, params, setParams, searchMeta, handleSearch,
  activeStrategy, setActiveStrategy, strategyPills }: any) {

  const [showSearch, setShowSearch] = useState(false)

  const tabTitles: Partial<Record<TabId, string>> = {
    home:     'Morning Brief', kpi: 'KPI Dashboard',
    radar:    'Lead Radar',    velocity: 'Neighborhood Velocity', stack: 'List Stack',
    drive:    'Drive for Dollars', deals: 'Deal Scanner', hunt: 'Deal Hunter',
    pipeline: 'Pipeline CRM', tasks: 'Tasks', drip: 'Drip Sequences',
    project:  'Project Clock', pl: 'Deal P&L',
    wholesale:'Wholesale', buyers: 'Buyer List',
    financial:'Financial Tools', market: 'Market Trends', analyzer: 'Area Intelligence', reference: 'Lead Sources',
  }

  const title = tabTitles[activeTab as TabId] || ''

  return (
    <header className="flex-shrink-0 flex items-center gap-3 px-5"
      style={{
        height: 52,
        background: 'white',
        borderBottom: '1px solid #E5E9F0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>

      {/* Page title */}
      <div className="font-bold text-sm" style={{ color: '#0F2460', minWidth: 120 }}>{title}</div>

      {/* Deal Scanner search bar */}
      {activeTab === 'deals' && (
        <div className="flex items-center gap-2 flex-1 max-w-xl">
          <div className="flex-1 flex items-center gap-2 rounded-lg border px-3 py-1.5"
            style={{ borderColor: '#D1D9E6', background: '#F8FAFC' }}>
            <span className="text-sm">🔍</span>
            <input
              className="flex-1 text-sm outline-none bg-transparent"
              style={{ color: '#0F2460' }}
              placeholder="City, zip, or address…"
              value={params.locationQuery}
              onChange={e => setParams((p: SearchParams) => ({ ...p, locationQuery: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button onClick={handleSearch} disabled={appState === 'loading'}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white border-none cursor-pointer flex-shrink-0"
            style={{ background: appState === 'loading' ? '#94A3B8' : '#0F2460' }}>
            {appState === 'loading' ? '⟳' : 'Search'}
          </button>
        </div>
      )}

      {/* Strategy pills — only when deals tab has results */}
      {activeTab === 'deals' && appState === 'results' && results.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto flex-nowrap">
          {strategyPills.map((s: any) => (
            <button key={s.key} onClick={() => setActiveStrategy(s.key)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer border whitespace-nowrap"
              style={activeStrategy === s.key
                ? { background: '#0F2460', borderColor: '#0F2460', color: 'white' }
                : { background: 'white', borderColor: '#D1D9E6', color: '#64748B' }}>
              {s.label}
              {s.count > 0 && <span className="text-[9px] font-bold opacity-70">{s.count}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1"/>

      {/* Status */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {searchMeta && activeTab === 'deals' && (
          <div className="text-[10px] hidden lg:block" style={{ color: '#94A3B8' }}>
            {searchMeta.raw} scanned · {(searchMeta.time/1000).toFixed(1)}s
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: '#94A3B8' }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#22C55E' }}/>
          Live
        </div>
        <div className="text-[10px] hidden md:block" style={{ color: '#94A3B8' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
      </div>
    </header>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab,       setActiveTab]       = useState<TabId>('home')
  const [collapsed,       setCollapsed]       = useState(false)
  const [params,          setParams]          = useState<SearchParams>(DEFAULT_PARAMS)
  const [results,         setResults]         = useState<AnalyzedProperty[]>([])
  const [allAnalyzed,     setAllAnalyzed]     = useState<AnalyzedProperty[]>([])
  const [marketStats,     setMarketStats]     = useState<MarketStats | null>(null)
  const [selected,        setSelected]        = useState<AnalyzedProperty | null>(null)
  const [appState,        setAppState]        = useState<AppState>('idle')
  const [apiErrors,       setApiErrors]       = useState<string[]>([])
  const [loadingMsg,      setLoadingMsg]      = useState('')
  const [sortKey,         setSortKey]         = useState<SortKey>('score')
  const [viewMode,        setViewMode]        = useState<ViewMode>('cards')
  const [activeStrategy,  setActiveStrategy]  = useState('all')
  const [toast,           setToast]           = useState<{ msg: string; err?: boolean } | null>(null)
  const [searchMeta,      setSearchMeta]      = useState<{ time: number; raw: number } | null>(null)
  const [taskBadge,       setTaskBadge]       = useState(0)

  // Refresh badge every 60s
  useEffect(() => {
    const upd = () => { const s = getTaskStats(); setTaskBadge(s.overdue + s.dueToday) }
    upd()
    const t = setInterval(upd, 60000)
    return () => clearInterval(t)
  }, [])

  // Hydrate from cloud on startup (silent, non-blocking)
  useEffect(() => {
    hydratFromCloud().then(r => {
      if (r.synced > 0) console.log(`[CloudSync] Hydrated ${r.synced} stores from cloud`)
    })
  }, [])

  const showToast = (msg: string, err = false) => {
    setToast({ msg, err })
    setTimeout(() => setToast(null), 5000)
  }

  const applySort = useCallback((key: SortKey, data: AnalyzedProperty[]) => sortResults(data, key), [])

  const handleSearch = async () => {
    const q = params.locationQuery.trim()
    if (!q) { showToast('Enter a location to search', true); return }
    setAppState('loading'); setApiErrors([]); setResults([]); setAllAnalyzed([])
    const t0 = Date.now()
    try {
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
      const avgPsf = ms?.averagePricePerSquareFoot || null
      const analyzed = listings.map(raw => analyzeProperty(raw, params, avgPsf)).filter((p): p is AnalyzedProperty => p !== null)
      setAllAnalyzed(analyzed)
      setApiErrors(errs)
      const filtered = analyzed.filter(p =>
        p.flipScore >= params.minFlipScore && p.profit >= params.minProfit && p.roi >= params.minROI &&
        (params.daysOnMarketMin === 0 || p.dom >= params.daysOnMarketMin) &&
        (!params.priceReduced || p.priceReduced)
      )
      const sorted = applySort(sortKey, filtered)
      setResults(sorted); setActiveStrategy('all')
      setSearchMeta({ time: Date.now() - t0, raw: listings.length })
      setAppState('results')
      const hot = sorted.filter(r => r.flipScore >= 70).length
      showToast(sorted.length === 0 ? `No deals found in ${listings.length} scanned — lower thresholds` : `${sorted.length} deals · ${hot > 0 ? `${hot} hot · ` : ''}${listings.length} scanned`)
    } catch (e: any) {
      setApiErrors([e.message]); setAppState('error')
      showToast('Search failed', true)
    }
  }

  const handleSort = (key: SortKey) => { setSortKey(key); setResults(prev => applySort(key, prev)) }

  const stratDef = STRATEGIES.find(s => s.key === activeStrategy) || STRATEGIES[0]
  const strategyFiltered = stratDef.filter(results)
  const strategyPills = STRATEGIES.map(s => ({ ...s, count: s.filter(results).length })).filter(s => s.count > 0 || s.key === 'all')

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F1F5F9' }}>

      {/* ── SIDEBAR NAV ── */}
      <Sidebar
        activeTab={activeTab}
        onTab={setActiveTab}
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
      />

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Topbar */}
        <Topbar
          activeTab={activeTab} appState={appState} results={results}
          params={params} setParams={setParams} searchMeta={searchMeta}
          handleSearch={handleSearch} activeStrategy={activeStrategy}
          setActiveStrategy={setActiveStrategy} strategyPills={strategyPills}
        />

        {/* Content */}
        <main className="flex-1 overflow-hidden" style={{ background: '#F8FAFC' }}>
          {activeTab === 'home'      && <DailyDigest />}
          {activeTab === 'kpi'       && <KPIDashboard />}
          {activeTab === 'radar'     && <LeadRadar />}
          {activeTab === 'velocity'  && <NeighborhoodVelocity />}
          {activeTab === 'stack'     && <ListStacking />}
          {activeTab === 'drive'     && <DriveForDollars />}
          {activeTab === 'deals'     && (
            <Dashboard
              appState={appState} results={strategyFiltered} allAnalyzed={allAnalyzed}
              marketStats={marketStats} apiErrors={apiErrors} loadingMsg={loadingMsg}
              sortKey={sortKey} viewMode={viewMode} onSort={handleSort}
              onViewMode={setViewMode} onSelect={setSelected} searchMeta={searchMeta} params={params}
            />
          )}
          {activeTab === 'hunt'      && <DealHunter />}
          {activeTab === 'pipeline'  && <Pipeline />}
          {activeTab === 'tasks'     && <Tasks />}
          {activeTab === 'drip'      && <DripSequences />}
          {activeTab === 'project'   && <ProjectTracker />}
          {activeTab === 'pl'        && <DealPLTracker />}
          {activeTab === 'wholesale' && <Wholesale />}
          {activeTab === 'buyers'    && <BuyerList />}
          {activeTab === 'financial' && <FinancialTools />}
          {activeTab === 'market'    && <MarketPanel locationQuery={params.locationQuery} searchMode={params.searchMode} results={results} visible={activeTab === 'market'} />}
          {activeTab === 'analyzer'  && <MarketAnalyzer />}
          {activeTab === 'reference' && <ReferenceHub />}
          {activeTab === 'settings'  && <Settings />}
        </main>
      </div>

      {selected && <PropertyModal property={selected} params={params} onClose={() => setSelected(null)} />}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[999] px-5 py-3 rounded-xl text-sm shadow-xl flex items-center gap-2.5 max-w-md"
          style={{
            background: toast.err ? '#FEF0ED' : '#0F2460',
            color:      toast.err ? '#C0341D' : 'white',
            border:     `1px solid ${toast.err ? '#C0341D30' : 'rgba(255,255,255,0.1)'}`,
          }}>
          <span>{toast.err ? '⚠' : '✓'}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  )
}
