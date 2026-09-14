import React from 'react'
/**
 * FlipScan Pro — SGC General Contractors
 * Rebuilt shell: vertical sidebar nav + command dashboard
 *
 * Design: Refined utilitarian — dark navy sidebar, clean white content.
 * Every screen reachable in one click. No horizontal scrolling.
 * Live status indicators on every nav item that has pending work.
 */
import { useState, useCallback, useEffect } from 'react'
import Dashboard         from './components/Dashboard'
import PropertyModal     from './components/PropertyModal'
import MarketPanel       from './components/MarketPanel'
import DealHunter        from './components/DealHunter'
import ChathamPermits    from './components/ChathamPermits'
import AuctionRadar      from './components/AuctionRadar'
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
import AgentDashboard    from './components/AgentDashboard'
import ProjectTracker    from './components/ProjectTracker'
import NeighborhoodVelocity from './components/NeighborhoodVelocity'
import Settings from './components/Settings'
import PortalHub from './components/PortalHub'
import ErrorBoundary from './components/ErrorBoundary'
import ToastContainer from './components/ToastContainer'
import Onboarding from './components/Onboarding'
import AddPropertyMobile from './components/AddPropertyMobile'
import { initAutoSync, pendingCount, onQueueChange } from './lib/addPropertyQueue'
import { toast } from './lib/toast'
import { getTaskStats }  from './lib/followUpEngine'
import { getDripStats }  from './lib/drip'
import { hydratFromCloud } from './lib/cloudSync'
import { SearchParams, AnalyzedProperty, MarketStats, SortKey, ViewMode } from './types'
import { masterSearch, fetchMarketStats, buildLocationParams } from './lib/rentcast'
import { analyzeProperty, sortResults } from './lib/scoring'

// ── Types ────────────────────────────────────────────────────────────────────
export type AppState = 'idle' | 'loading' | 'results' | 'error'

type TabId =
  | 'hub' | 'home' | 'kpi'
  | 'radar' | 'velocity' | 'stack' | 'drive'
  | 'pipeline' | 'tasks' | 'drip' | 'agent' | 'project' | 'pl'
  | 'deals' | 'hunt' | 'chatham' | 'auction'
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
      { id: 'hub',  label: 'Portal Hub',     icon: '🏛️', tip: 'SGC-style command center — every tool in one grid' },
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
      { id: 'deals',    label: 'Deal Search',     icon: '🔍', tip: 'One search screen — quick scan or advanced hunt' },

      { id: 'auction',  label: 'Auction Radar',    icon: '⚖️', tip: 'Trustee, sheriff & tax-foreclosure sales with dates and equity spread' },
      { id: 'chatham',  label: 'Chatham Permits',  icon: '🏛️', tip: 'Manual official Chatham County permit report organizer' },
    ],
  },
  {
    section: 'Work Deals',
    color:   'rgba(255,255,255,0.5)',
    items: [
      { id: 'pipeline', label: 'Pipeline CRM',     icon: '🎯', tip: 'Kanban CRM — every lead from radar to closed' },
      { id: 'tasks',    label: 'Tasks',             icon: '✅', badge: () => { const s = getTaskStats(); return (s.overdue + s.dueToday) || undefined }, tip: 'Auto-generated follow-up task command center' },
      { id: 'drip',     label: 'Drip Sequences',   icon: '🔄', badge: () => getDripStats().dueToday || undefined, tip: 'Automated 60-day multi-touch follow-up' },
      { id: 'agent',    label: 'Research Agent',   icon: '🤖', tip: 'Live feed of auto-queued leads, scores and emails sent — with a stop switch' },
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
                  className="w-full flex items-center gap-2.5 cursor-pointer border-none transition-all relative group" aria-label={item.label}
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
interface TopbarProps {
  activeTab:        TabId
  appState:         AppState
  results:          AnalyzedProperty[]
  params:           SearchParams
  setParams:        React.Dispatch<React.SetStateAction<SearchParams>>
  searchMeta:       { time: number; raw: number } | null
  handleSearch:     () => void
  activeStrategy:   string
  setActiveStrategy:(s: string) => void
  strategyPills:    { key: string; label: string; count: number }[]
  showFilters:      boolean
  setShowFilters:   React.Dispatch<React.SetStateAction<boolean>>
  sidebarHidden:    boolean
  onToggleSidebar:  () => void
}

function Topbar({
  activeTab, appState, results, params, setParams, searchMeta,
  handleSearch, activeStrategy, setActiveStrategy, strategyPills,
  showFilters, setShowFilters, sidebarHidden, onToggleSidebar,
}: TopbarProps) {

  const [showSearch, setShowSearch] = useState(false)

  const tabTitles: Partial<Record<TabId, string>> = {
    home:     'Morning Brief', kpi: 'KPI Dashboard',
    radar:    'Lead Radar',    velocity: 'Neighborhood Velocity', stack: 'List Stack',
    drive:    'Drive for Dollars', deals: 'Deal Scanner', hunt: 'Deal Hunter', chatham: 'Chatham Permits',
    auction:  'Auction Radar',
    pipeline: 'Pipeline CRM', tasks: 'Tasks', drip: 'Drip Sequences', agent: 'Research Agent',
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

      {/* Sidebar toggle — always visible so a hidden sidebar can be brought back */}
      <button
        onClick={onToggleSidebar}
        aria-label={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
        title={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border cursor-pointer transition-colors"
        style={{
          background:  sidebarHidden ? '#0F2460' : 'white',
          borderColor: sidebarHidden ? '#0F2460' : '#D1D9E6',
          color:       sidebarHidden ? 'white'   : '#0F2460',
        }}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2"/>
          <line x1="9" y1="4" x2="9" y2="20"/>
        </svg>
      </button>

      {/* Page title */}
      <div className="font-bold text-sm truncate" style={{ color: '#0F2460', minWidth: 0, maxWidth: 200 }}>{title}</div>

      {/* Divider */}
      <div className="hidden md:block w-px h-6 flex-shrink-0" style={{ background: '#E5E9F0' }}/>

      {/* Deal Scanner search bar + filter toggle */}
      {activeTab === 'deals' && (
        <div className="flex items-center gap-2 flex-1 min-w-0 max-w-3xl">
          {/* Mode pills */}
          <div className="hidden sm:flex gap-0.5 flex-shrink-0">
            {(['city','zip','address','state'] as const).map(mode => (
              <button key={mode}
                onClick={() => setParams((p: SearchParams) => ({ ...p, searchMode: mode, locationQuery: '' }))}
                className="px-2.5 py-1.5 text-[10px] font-bold rounded border cursor-pointer capitalize transition-all"
                style={params.searchMode === mode
                  ? { background: '#0F2460', borderColor: '#0F2460', color: 'white' }
                  : { background: 'white', borderColor: '#D1D9E6', color: '#94A3B8' }}>
                {mode}
              </button>
            ))}
          </div>
          {/* Search input */}
          <div className="flex-1 flex items-center gap-2 rounded-lg border px-3 py-1.5"
            style={{ borderColor: '#D1D9E6', background: '#F8FAFC' }}>
            <span className="text-sm">🔍</span>
            <input
              className="flex-1 text-sm outline-none bg-transparent"
              style={{ color: '#0F2460' }}
              placeholder={
                params.searchMode === 'city'    ? 'Norfolk, VA  ·  Charlotte, NC' :
                params.searchMode === 'zip'     ? '23501  ·  27601' :
                params.searchMode === 'address' ? '123 Main St, Norfolk, VA' :
                'Virginia  ·  North Carolina'
              }
              value={params.locationQuery}
              onChange={e => setParams((p: SearchParams) => ({ ...p, locationQuery: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            {/* Radius — hidden on state mode */}
            {params.searchMode !== 'state' && (
              <div className="hidden md:flex items-center gap-1 flex-shrink-0">
                <span className="text-[10px]" style={{ color: '#94A3B8' }}>within</span>
                <select
                  className="text-[11px] border-none outline-none bg-transparent font-semibold cursor-pointer"
                  style={{ color: '#0F2460' }}
                  value={params.radius}
                  onChange={e => setParams((p: SearchParams) => ({ ...p, radius: Number(e.target.value) }))}>
                  {[1,5,10,25,50,75,100].map(r => <option key={r} value={r}>{r}mi</option>)}
                </select>
              </div>
            )}
          </div>
          {/* Source pills */}
          <div className="hidden lg:flex items-center gap-1 flex-shrink-0">
            {[
              { key: 'activeMLS',         label: 'MLS',    color: '#1B3A8C' },
              { key: 'foreclosures',      label: 'FC',     color: '#C0341D' },
              { key: 'shortSales',        label: 'SS',     color: '#C45E1A' },
              { key: 'recentlyOffMarket', label: 'Off-Mkt',color: '#6B3FAD' },
              { key: 'propertyRecords',   label: 'PR',     color: '#1A7A4A' },
            ].map((s) => {
              const active = params.sources[s.key as keyof typeof params.sources]
              return (
                <button key={s.key}
                  onClick={() => setParams((p: SearchParams) => ({
                    ...p, sources: { ...p.sources, [s.key]: !active }
                  }))}
                  className="px-2 py-1 text-[10px] font-bold rounded border cursor-pointer transition-all"
                  style={active
                    ? { background: s.color + '15', borderColor: s.color + '60', color: s.color }
                    : { background: 'white', borderColor: '#E2E8F0', color: '#CBD5E1' }}>
                  {s.label}
                </button>
              )
            })}
          </div>
          <button onClick={handleSearch} disabled={appState === 'loading'}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white border-none cursor-pointer flex-shrink-0"
            style={{ background: appState === 'loading' ? '#94A3B8' : '#0F2460' }}>
            {appState === 'loading' ? '⟳' : 'Scan'}
          </button>
          <button onClick={() => setShowFilters((f: boolean) => !f)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer flex-shrink-0"
            style={{
              borderColor: showFilters ? '#0F2460' : '#D1D9E6',
              color:        showFilters ? '#0F2460' : '#94A3B8',
              background:   showFilters ? '#EEF2FB' : 'white',
            }}>
            ⚙ Filters
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
  const [activeTab,       setActiveTab]       = useState<TabId>(() => {
    // Support PWA shortcuts via ?tab= URL parameter
    try {
      const param = new URLSearchParams(window.location.search).get('tab')
      const valid: TabId[] = ['hub','home','kpi','radar','velocity','stack','drive','pipeline','tasks','drip','agent','project','pl','deals','hunt','chatham','auction','wholesale','buyers','financial','market','analyzer','reference','settings']
      if (param && valid.includes(param as TabId)) return param as TabId
    } catch {}
    return 'hub'
  })
  const [collapsed,       setCollapsed]       = useState(false)
  const [sidebarHidden,   setSidebarHidden]   = useState(false)
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
  const [searchMeta,      setSearchMeta]      = useState<{ time: number; raw: number } | null>(null)
  const [taskBadge,       setTaskBadge]       = useState(0)
  const [showFilters,     setShowFilters]     = useState(false)
  const [showAddProperty, setShowAddProperty] = useState(false)
  const [queueBadge,      setQueueBadge]      = useState(0)
  const [showOnboarding,  setShowOnboarding]  = useState(() => {
    const hasKey = (import.meta.env.VITE_RENTCAST_KEY as string) || localStorage.getItem('fscan_rentcast')
    return !hasKey
  })

  // Refresh badge every 60s
  useEffect(() => {
    const upd = () => { const s = getTaskStats(); setTaskBadge(s.overdue + s.dueToday) }
    upd()
    const t = setInterval(upd, 60000)
    return () => clearInterval(t)
  }, [])

  // Init offline queue auto-sync + track pending count for FAB badge
  useEffect(() => {
    initAutoSync()
    const upd = () => { pendingCount().then(setQueueBadge) }
    upd()
    const unsub = onQueueChange(upd)
    return () => { unsub() }
  }, [])

  // Hydrate from cloud on startup (silent, non-blocking)
  useEffect(() => {
    hydratFromCloud().then(r => {
      if (r.synced > 0) console.log(`[CloudSync] Hydrated ${r.synced} stores from cloud`)
    })
  }, [])

  // Close filter drawer whenever user switches away from Deal Scanner
  useEffect(() => {
    if (activeTab !== 'deals') setShowFilters(false)
  }, [activeTab])

  const showToast = (msg: string, err = false) => {
    if (err) toast.error(msg)
    else toast.success(msg)
  }

  const applySort = useCallback((key: SortKey, data: AnalyzedProperty[]) => sortResults(data, key), [])

  const handleSearch = async () => {
    const q = params.locationQuery.trim()
    if (!q) { showToast('Enter a location to search', true); return }
    // Guard: RentCast key required for all search operations
    const rentcastKey = (import.meta.env.VITE_RENTCAST_KEY as string) || localStorage.getItem('fscan_rentcast') || ''
    if (!rentcastKey) {
      toast.error('RentCast API key required — add it in Settings → API Keys → RentCast')
      return
    }
    setShowFilters(false)
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
      {!sidebarHidden && (
        <Sidebar
          activeTab={activeTab}
          onTab={setActiveTab}
          collapsed={collapsed}
          onToggle={() => setCollapsed(c => !c)}
        />
      )}

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Topbar */}
        <Topbar
          activeTab={activeTab} appState={appState} results={results}
          params={params} setParams={setParams} searchMeta={searchMeta}
          handleSearch={handleSearch} activeStrategy={activeStrategy}
          setActiveStrategy={setActiveStrategy} strategyPills={strategyPills}
          showFilters={showFilters} setShowFilters={setShowFilters}
          sidebarHidden={sidebarHidden}
          onToggleSidebar={() => setSidebarHidden(h => !h)}
        />

        {/* Filter drawer — Deal Scanner only */}
        {activeTab === 'deals' && showFilters && (
          <div className="flex-shrink-0 border-b overflow-y-auto"
            style={{ background: 'white', borderColor: '#E5E9F0', maxHeight: 320 }}>
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">

              {/* Strategy presets */}
              <div className="col-span-2 md:col-span-1 lg:col-span-1">
                <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Strategy Preset</div>
                <div className="flex flex-col gap-1">
                  {[
                    { k: 'quickflip',  l: '⚡ Quick Flip',  p: { maxPrice: 350000, rehabLevel: 'light'  as const, holdMonths: 4,  minROI: 18, strategy: 'flip'      as const } },
                    { k: 'wholesale',  l: '🏷️ Wholesale',   p: { maxPrice: 180000, rehabLevel: 'heavy'  as const, daysOnMarketMin: 45, minProfit: 15000, strategy: 'wholesale' as const } },
                    { k: 'brrrr',      l: '♻️ BRRRR',        p: { maxPrice: 320000, rehabLevel: 'medium' as const, holdMonths: 12, minROI: 10, strategy: 'brrrr'     as const } },
                    { k: 'distressed', l: '🏚️ Distressed',   p: { rehabLevel: 'gut' as const, daysOnMarketMin: 60, maxYearBuilt: 1985 } },
                  ].map(({ k, l, p }) => (
                    <button key={k} onClick={() => setParams((prev: SearchParams) => ({ ...prev, ...p }))}
                      className="text-[11px] px-2 py-1.5 rounded border cursor-pointer text-left font-medium"
                      style={{ borderColor: '#D1D9E6', color: '#0F2460', background: '#EEF2FB' }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price + property */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Price Range</div>
                <div className="space-y-1.5">
                  <input type="number" placeholder="Min $" value={params.minPrice || ''}
                    onChange={e => setParams((p: SearchParams) => ({ ...p, minPrice: Number(e.target.value) || 0 }))}
                    className="w-full rounded-lg border text-xs px-2 py-1.5 outline-none"
                    style={{ borderColor: '#D1D9E6' }} />
                  <input type="number" placeholder="Max $" value={params.maxPrice || ''}
                    onChange={e => setParams((p: SearchParams) => ({ ...p, maxPrice: Number(e.target.value) || 0 }))}
                    className="w-full rounded-lg border text-xs px-2 py-1.5 outline-none"
                    style={{ borderColor: '#D1D9E6' }} />
                  <select value={params.propertyType} onChange={e => setParams((p: SearchParams) => ({ ...p, propertyType: e.target.value }))}
                    className="w-full rounded-lg border text-xs px-2 py-1.5 outline-none cursor-pointer"
                    style={{ borderColor: '#D1D9E6' }}>
                    <option value="">All Types</option>
                    <option value="Single Family">Single Family</option>
                    <option value="Condo">Condo</option>
                    <option value="Townhouse">Townhouse</option>
                    <option value="Multi-Family">Multi-Family</option>
                  </select>
                </div>
              </div>

              {/* Beds / Baths / Year */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Property</div>
                <div className="space-y-1.5">
                  <select value={params.bedrooms || ''} onChange={e => setParams((p: SearchParams) => ({ ...p, bedrooms: Number(e.target.value) || 0 }))}
                    className="w-full rounded-lg border text-xs px-2 py-1.5 outline-none cursor-pointer"
                    style={{ borderColor: '#D1D9E6' }}>
                    <option value="">Any Beds</option>
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}+ beds</option>)}
                  </select>
                  <select value={params.bathrooms || ''} onChange={e => setParams((p: SearchParams) => ({ ...p, bathrooms: Number(e.target.value) || 0 }))}
                    className="w-full rounded-lg border text-xs px-2 py-1.5 outline-none cursor-pointer"
                    style={{ borderColor: '#D1D9E6' }}>
                    <option value="">Any Baths</option>
                    {[1,2,3].map(n => <option key={n} value={n}>{n}+ baths</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-1">
                    <input type="number" placeholder="Built after" value={params.minYearBuilt || ''}
                      onChange={e => setParams((p: SearchParams) => ({ ...p, minYearBuilt: Number(e.target.value) || 0 }))}
                      className="w-full rounded-lg border text-xs px-2 py-1.5 outline-none"
                      style={{ borderColor: '#D1D9E6' }} />
                    <input type="number" placeholder="Built before" value={params.maxYearBuilt || ''}
                      onChange={e => setParams((p: SearchParams) => ({ ...p, maxYearBuilt: Number(e.target.value) || 0 }))}
                      className="w-full rounded-lg border text-xs px-2 py-1.5 outline-none"
                      style={{ borderColor: '#D1D9E6' }} />
                  </div>
                </div>
              </div>

              {/* Flip criteria */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Flip Criteria</div>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span style={{ color: '#64748B' }}>Min Score</span>
                      <span className="font-bold" style={{ color: '#0F2460' }}>{params.minFlipScore}</span>
                    </div>
                    <input type="range" min="0" max="100" value={params.minFlipScore}
                      onChange={e => setParams((p: SearchParams) => ({ ...p, minFlipScore: Number(e.target.value) }))}
                      className="w-full" />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span style={{ color: '#64748B' }}>Min Profit</span>
                      <span className="font-bold" style={{ color: '#0F2460' }}>${(params.minProfit/1000).toFixed(0)}k</span>
                    </div>
                    <input type="range" min="0" max="150000" step="2500" value={params.minProfit}
                      onChange={e => setParams((p: SearchParams) => ({ ...p, minProfit: Number(e.target.value) }))}
                      className="w-full" />
                  </div>
                  <select value={params.arvMethod} onChange={e => setParams((p: SearchParams) => ({ ...p, arvMethod: e.target.value as any }))}
                    className="w-full rounded-lg border text-xs px-2 py-1.5 outline-none cursor-pointer"
                    style={{ borderColor: '#D1D9E6' }}>
                    <option value="conservative">ARV: Conservative</option>
                    <option value="auto">ARV: Market Rate</option>
                    <option value="aggressive">ARV: Aggressive</option>
                  </select>
                </div>
              </div>

              {/* Deal math */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Deal Math</div>
                <div className="space-y-1.5">
                  <select value={params.rehabLevel} onChange={e => setParams((p: SearchParams) => ({ ...p, rehabLevel: e.target.value as any }))}
                    className="w-full rounded-lg border text-xs px-2 py-1.5 outline-none cursor-pointer"
                    style={{ borderColor: '#D1D9E6' }}>
                    <option value="light">Light: $5-25k</option>
                    <option value="medium">Medium: $25-75k</option>
                    <option value="heavy">Heavy: $75-150k</option>
                    <option value="gut">Gut: $150k+</option>
                    <option value="custom">Custom</option>
                  </select>
                  {params.rehabLevel === 'custom' && (
                    <input type="number" placeholder="Rehab $" value={params.customRehabCost || ''}
                      onChange={e => setParams((p: SearchParams) => ({ ...p, customRehabCost: Number(e.target.value) }))}
                      className="w-full rounded-lg border text-xs px-2 py-1.5 outline-none"
                      style={{ borderColor: '#D1D9E6' }} />
                  )}
                  <div className="grid grid-cols-2 gap-1">
                    <div>
                      <div className="text-[9px] mb-0.5" style={{ color: '#94A3B8' }}>Hold (mo)</div>
                      <input type="number" value={params.holdMonths}
                        onChange={e => setParams((p: SearchParams) => ({ ...p, holdMonths: Number(e.target.value) }))}
                        className="w-full rounded-lg border text-xs px-2 py-1.5 outline-none"
                        style={{ borderColor: '#D1D9E6' }} />
                    </div>
                    <div>
                      <div className="text-[9px] mb-0.5" style={{ color: '#94A3B8' }}>Rate %</div>
                      <input type="number" step="0.5" value={params.financingRate}
                        onChange={e => setParams((p: SearchParams) => ({ ...p, financingRate: Number(e.target.value) }))}
                        className="w-full rounded-lg border text-xs px-2 py-1.5 outline-none"
                        style={{ borderColor: '#D1D9E6' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Market signals */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Market Signals</div>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span style={{ color: '#64748B' }}>Max DOM</span>
                      <span className="font-bold" style={{ color: '#0F2460' }}>{params.daysOnMarketMax >= 365 ? 'Any' : `${params.daysOnMarketMax}d`}</span>
                    </div>
                    <input type="range" min="0" max="365" step="5" value={params.daysOnMarketMax}
                      onChange={e => setParams((p: SearchParams) => ({ ...p, daysOnMarketMax: Number(e.target.value) }))}
                      className="w-full" />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span style={{ color: '#64748B' }}>Min DOM (motivated)</span>
                      <span className="font-bold" style={{ color: '#0F2460' }}>{params.daysOnMarketMin || 'Any'}</span>
                    </div>
                    <input type="range" min="0" max="180" step="5" value={params.daysOnMarketMin}
                      onChange={e => setParams((p: SearchParams) => ({ ...p, daysOnMarketMin: Number(e.target.value) }))}
                      className="w-full" />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input type="checkbox" checked={params.priceReduced}
                      onChange={e => setParams((p: SearchParams) => ({ ...p, priceReduced: e.target.checked }))} />
                    <span style={{ color: '#374151' }}>Price-reduced only</span>
                  </label>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Content */}
        <main className="flex-1 overflow-hidden" style={{ background: '#F8FAFC' }}>
          <ErrorBoundary label="Portal Hub">       {activeTab === 'hub'       && <PortalHub onNavigate={(t) => setActiveTab(t as TabId)} />} </ErrorBoundary>
          <ErrorBoundary label="Morning Brief">    {activeTab === 'home'      && <DailyDigest />}            </ErrorBoundary>
          <ErrorBoundary label="KPI Dashboard">    {activeTab === 'kpi'       && <KPIDashboard />}           </ErrorBoundary>
          <ErrorBoundary label="Lead Radar">       {activeTab === 'radar'     && <LeadRadar />}              </ErrorBoundary>
          <ErrorBoundary label="Neighborhood">     {activeTab === 'velocity'  && <NeighborhoodVelocity />}   </ErrorBoundary>
          <ErrorBoundary label="List Stack">       {activeTab === 'stack'     && <ListStacking />}           </ErrorBoundary>
          <ErrorBoundary label="Drive for Dollars">{activeTab === 'drive'     && <DriveForDollars />}        </ErrorBoundary>
          <ErrorBoundary label="Deal Scanner">
            {activeTab === 'deals' && (
              <Dashboard
                appState={appState} results={strategyFiltered} allAnalyzed={allAnalyzed}
                marketStats={marketStats} apiErrors={apiErrors} loadingMsg={loadingMsg}
                sortKey={sortKey} viewMode={viewMode} onSort={handleSort}
                onViewMode={setViewMode} onSelect={setSelected} searchMeta={searchMeta} params={params}
              />
            )}
          </ErrorBoundary>
          <ErrorBoundary label="Deal Hunter">      {activeTab === 'hunt'      && <DealHunter />}             </ErrorBoundary>
          <ErrorBoundary label="Chatham Permits">  {activeTab === 'chatham'   && <ChathamPermits />}         </ErrorBoundary>
          <ErrorBoundary label="Auction Radar">    {activeTab === 'auction'   && <AuctionRadar />}           </ErrorBoundary>
          <ErrorBoundary label="Pipeline CRM">     {activeTab === 'pipeline'  && <Pipeline />}               </ErrorBoundary>
          <ErrorBoundary label="Tasks">            {activeTab === 'tasks'     && <Tasks />}                  </ErrorBoundary>
          <ErrorBoundary label="Drip Sequences">   {activeTab === 'drip'      && <DripSequences />}          </ErrorBoundary>
          <ErrorBoundary label="Research Agent">   {activeTab === 'agent'     && <AgentDashboard />}         </ErrorBoundary>
          <ErrorBoundary label="Project Clock">    {activeTab === 'project'   && <ProjectTracker />}         </ErrorBoundary>
          <ErrorBoundary label="Deal P&L">         {activeTab === 'pl'        && <DealPLTracker />}          </ErrorBoundary>
          <ErrorBoundary label="Wholesale">        {activeTab === 'wholesale' && <Wholesale />}              </ErrorBoundary>
          <ErrorBoundary label="Buyer List">       {activeTab === 'buyers'    && <BuyerList />}              </ErrorBoundary>
          <ErrorBoundary label="Financial Tools">  {activeTab === 'financial' && <FinancialTools />}         </ErrorBoundary>
          <ErrorBoundary label="Market Trends">
            {activeTab === 'market' && <MarketPanel locationQuery={params.locationQuery} searchMode={params.searchMode} results={results} visible={activeTab === 'market'} />}
          </ErrorBoundary>
          <ErrorBoundary label="Area Intelligence">{activeTab === 'analyzer'  && <MarketAnalyzer />}         </ErrorBoundary>
          <ErrorBoundary label="Lead Sources">     {activeTab === 'reference' && <ReferenceHub />}           </ErrorBoundary>
          <ErrorBoundary label="Settings">         {activeTab === 'settings'  && <Settings />}               </ErrorBoundary>
        </main>
      </div>

      {selected && <PropertyModal property={selected} params={params} onClose={() => setSelected(null)} />}

      <ToastContainer />
      {showOnboarding && <Onboarding onDismiss={() => setShowOnboarding(false)} />}

      {/* Floating "Add Property" button — mobile-first D4D capture */}
      <button
        onClick={() => setShowAddProperty(true)}
        aria-label="Add property"
        className="fixed z-[90] rounded-full shadow-2xl border-none cursor-pointer text-white font-bold flex items-center justify-center bg-[#0F2460] hover:bg-[#1a3a8f] transition-colors"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom) + 20px)',
          right: '20px',
          width: '56px',
          height: '56px',
          fontSize: '28px',
        }}
      >
        +
        {queueBadge > 0 && (
          <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
            {queueBadge}
          </span>
        )}
      </button>

      {showAddProperty && <AddPropertyMobile onClose={() => setShowAddProperty(false)} />}
    </div>
  )
}
