import React, { useState } from 'react'
import { SearchParams, SearchMode, DataSources } from '../types'

interface Props {
  params: SearchParams
  onChange: (p: SearchParams) => void
  onSearch: () => void
  loading: boolean
}

const FL = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] tracking-widest uppercase text-slate-500 mb-1 font-semibold">{children}</div>
)
const ic = "w-full bg-white border border-slate-200 rounded text-slate-900 text-sm px-2.5 py-2 outline-none focus:border-blue-900/50 focus:ring-2 focus:ring-blue-900/10 transition-colors placeholder:text-slate-400"
const sc = ic + " cursor-pointer"

const PRESETS: Record<string, Partial<SearchParams>> = {
  wholesale:  { maxPrice: 180000, rehabLevel: 'heavy', daysOnMarketMin: 45, minProfit: 15000, minROI: 12, strategy: 'wholesale', arvMethod: 'conservative' },
  brrrr:      { maxPrice: 320000, rehabLevel: 'medium', bedrooms: 2, holdMonths: 12, minROI: 10, strategy: 'brrrr', downPaymentPct: 20 },
  luxury:     { minPrice: 500000, maxPrice: 1500000, rehabLevel: 'heavy', bedrooms: 4, minProfit: 80000, strategy: 'luxury', agentCommissionPct: 5, arvMethod: 'aggressive' },
  quickflip:  { maxPrice: 350000, rehabLevel: 'light', holdMonths: 4, minROI: 18, strategy: 'flip' },
  distressed: { rehabLevel: 'gut', daysOnMarketMin: 60, maxYearBuilt: 1985, minROI: 15, strategy: 'all', arvMethod: 'conservative' },
}

const MODE_INFO: Record<SearchMode, { placeholder: string; hint: string }> = {
  city:    { placeholder: 'Norfolk, VA  |  Austin, TX  |  Miami FL', hint: 'Search all listings in a city + radius' },
  state:   { placeholder: 'Virginia  |  VA  |  Texas  |  FL',        hint: 'Full statewide sweep across all cities' },
  zip:     { placeholder: '23501  |  78701  |  90210',               hint: '5-digit zip code(s), comma-separated' },
  address: { placeholder: '123 Main St, Norfolk, VA 23501',          hint: 'Pin-drop — deals near a specific address' },
}

const SOURCES: { key: keyof DataSources; icon: string; label: string; desc: string; color: string }[] = [
  { key: 'activeMLS',         icon: '🏠', label: 'Active MLS',        desc: 'Listed on MLS — standard listings',      color: 'border-blue-500/40 text-blue-400' },
  { key: 'foreclosures',      icon: '🔨', label: 'Foreclosures',      desc: 'Bank-owned REO & court-ordered sales',   color: 'border-red-500/40 text-red-400' },
  { key: 'shortSales',        icon: '📉', label: 'Short Sales',       desc: 'Pre-foreclosure, below-market sales',    color: 'border-orange-500/40 text-orange-400' },
  { key: 'recentlyOffMarket', icon: '🔒', label: 'Off-Market Recent', desc: 'Delisted in last 90 days — motivated',   color: 'border-purple-500/40 text-purple-400' },
  { key: 'propertyRecords',   icon: '📋', label: 'Property Records',  desc: '140M records — find non-listed owners',  color: 'border-green-500/40 text-green-400' },
  { key: 'corporateOwned',    icon: '🏢', label: 'Corporate Owned',   desc: 'Org-owned — often motivated sellers',    color: 'border-blue-900/40 text-blue-900' },
]

const RADIUS_MARKS = [1, 5, 10, 25, 50, 75, 100]

export default function Sidebar({ params, onChange, onSearch, loading }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ deal: true })

  const set = (key: keyof SearchParams) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const t = e.target
    let val: any = t.value
    if (t.type === 'number' || t.type === 'range') val = parseFloat(t.value) || 0
    if (t.type === 'checkbox') val = (t as HTMLInputElement).checked
    onChange({ ...params, [key]: val })
  }

  const setSource = (key: keyof DataSources, val: boolean) => {
    onChange({ ...params, sources: { ...params.sources, [key]: val } })
  }

  const toggleAll = (val: boolean) => {
    const all: DataSources = { activeMLS: val, foreclosures: val, shortSales: val, recentlyOffMarket: val, propertyRecords: val, corporateOwned: val }
    onChange({ ...params, sources: all })
  }

  const toggle = (id: string) => setCollapsed(c => ({ ...c, [id]: !c[id] }))
  const isOpen = (id: string, def = true) => collapsed[id] === undefined ? def : !collapsed[id]

  const applyPreset = (key: string) => onChange({ ...params, ...PRESETS[key] })

  const Section = ({ id, icon, title, def = true, children }: { id: string; icon: string; title: string; def?: boolean; children: React.ReactNode }) => (
    <div className="border-t border-slate-200/70 pt-3 mt-3">
      <button onClick={() => toggle(id)} className="w-full flex items-center gap-2 mb-2.5 cursor-pointer bg-transparent border-none text-left">
        <span>{icon}</span>
        <span className="text-[10px] tracking-[2px] uppercase text-blue-900 font-semibold flex-1">{title}</span>
        <span className="text-slate-500 text-[10px]">{isOpen(id, def) ? '▾' : '▸'}</span>
      </button>
      {isOpen(id, def) && <div className="space-y-3">{children}</div>}
    </div>
  )

  const activeSourceCount = Object.values(params.sources).filter(Boolean).length

  return (
    <div className="w-[300px] flex-shrink-0 bg-slate-50 border-r border-slate-200 h-full flex flex-col">
      <div className="p-4 flex-1 overflow-y-auto min-h-0">

        {/* ── PRESETS ── */}
        <div className="mb-1">
          <div className="text-[10px] tracking-[2px] uppercase text-blue-900 font-semibold mb-2">⚡ Strategy</div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { k: 'quickflip',  l: '⚡ Quick Flip'  },
              { k: 'wholesale',  l: '📦 Wholesale'   },
              { k: 'brrrr',      l: '♻️ BRRRR'       },
              { k: 'luxury',     l: '💎 Luxury'      },
              { k: 'distressed', l: '🏚️ Distressed'  },
            ].map(({ k, l }) => (
              <button key={k} onClick={() => applyPreset(k)}
                className="text-[10px] tracking-wide uppercase px-2 py-2 rounded border cursor-pointer transition-all text-left border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300 bg-transparent">
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* ── LOCATION ── */}
        <Section id="loc" icon="📍" title="Location" def={true}>
          <div>
            <FL>Search By</FL>
            <div className="grid grid-cols-4 gap-1 mb-2">
              {(['city', 'state', 'zip', 'address'] as SearchMode[]).map(mode => (
                <button key={mode} onClick={() => onChange({ ...params, searchMode: mode, locationQuery: '' })}
                  className={`py-1.5 rounded border text-[10px] uppercase tracking-wide cursor-pointer transition-all
                    ${params.searchMode === mode
                      ? 'bg-blue-900/10 border-blue-900/50 text-blue-900'
                      : 'bg-transparent border-slate-200 text-slate-500 hover:text-slate-600'}`}>
                  {mode}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-slate-500 bg-slate-100/50 rounded px-2 py-1.5 mb-2 leading-relaxed">
              {MODE_INFO[params.searchMode].hint}
            </div>
            <input
              className={ic}
              value={params.locationQuery}
              onChange={set('locationQuery')}
              placeholder={MODE_INFO[params.searchMode].placeholder}
              onKeyDown={e => e.key === 'Enter' && onSearch()}
              aria-label="Search location"
            />
          </div>

          {params.searchMode !== 'state' && (
            <div>
              <div className="flex justify-between mb-1">
                <FL>Radius</FL>
                <span className={`text-[11px] font-bold ${params.radius >= 100 ? 'text-green-400' : 'text-blue-900'}`}>
                  {params.radius >= 100 ? '100 mi MAX' : `${params.radius} mi`}
                </span>
              </div>
              <input type="range" className="w-full mb-1" min="1" max="100" step="1" value={params.radius} onChange={set('radius')} />
              <div className="flex justify-between">
                {RADIUS_MARKS.map(m => (
                  <button key={m} onClick={() => onChange({ ...params, radius: m })}
                    className={`text-[9px] px-1 py-0.5 rounded cursor-pointer transition-colors
                      ${params.radius === m ? 'text-blue-900 bg-blue-900/10' : 'text-slate-400 hover:text-slate-500'}`}>
                    {m}
                  </button>
                ))}
              </div>
              {params.radius >= 75 && (
                <div className="text-[10px] text-blue-900/70 mt-1.5 bg-blue-900/5 border border-blue-900/20 rounded px-2 py-1.5">
                  ⚠️ Large radius — expect many results & more API calls
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ── DATA SOURCES ── */}
        <Section id="src" icon="📡" title={`Data Sources (${activeSourceCount}/6)`} def={true}>
          <div className="flex justify-between mb-1">
            <button onClick={() => toggleAll(true)}  className="text-[10px] text-blue-900 cursor-pointer bg-transparent border-none hover:text-blue-700">All On</button>
            <button onClick={() => toggleAll(false)} className="text-[10px] text-slate-500 cursor-pointer bg-transparent border-none hover:text-slate-600">All Off</button>
          </div>
          <div className="space-y-1.5">
            {SOURCES.map(s => (
              <label key={s.key} className={`flex items-start gap-2.5 p-2 rounded border cursor-pointer transition-all
                ${params.sources[s.key]
                  ? `${s.color} bg-opacity-10`
                  : 'border-slate-200 text-slate-500'}`}>
                <input
                  type="checkbox"
                  checked={params.sources[s.key]}
                  onChange={e => setSource(s.key, e.target.checked)}
                  className="accent-blue-900 mt-0.5 flex-shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium flex items-center gap-1">
                    <span>{s.icon}</span>
                    <span className={params.sources[s.key] ? '' : 'text-slate-500'}>{s.label}</span>
                  </div>
                  <div className="text-[9px] text-slate-500 leading-relaxed">{s.desc}</div>
                </div>
              </label>
            ))}
          </div>
          <div className="text-[10px] text-slate-400 bg-slate-100/40 rounded p-2 mt-1 leading-relaxed">
            💡 More sources = more deals found. Each source uses separate API calls.
          </div>
        </Section>

        {/* ── PROPERTY ── */}
        <Section id="prop" icon="🏠" title="Property Filters" def={true}>
          <div>
            <FL>Type</FL>
            <select className={sc} value={params.propertyType} onChange={set('propertyType')}>
              <option value="">All Types</option>
              <option value="Single Family">Single Family</option>
              <option value="Condo">Condo</option>
              <option value="Townhouse">Townhouse</option>
              <option value="Multi-Family">Multi-Family</option>
              <option value="Manufactured">Manufactured</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><FL>Min Price</FL><input className={ic} type="number" value={params.minPrice || ''} onChange={set('minPrice')} placeholder="50,000" /></div>
            <div><FL>Max Price</FL><input className={ic} type="number" value={params.maxPrice || ''} onChange={set('maxPrice')} placeholder="600,000" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FL>Beds Min</FL>
              <select className={sc} value={params.bedrooms || ''} onChange={set('bedrooms')}>
                <option value="">Any</option>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}+</option>)}
              </select>
            </div>
            <div>
              <FL>Baths Min</FL>
              <select className={sc} value={params.bathrooms || ''} onChange={set('bathrooms')}>
                <option value="">Any</option>
                {[1,2,3].map(n => <option key={n} value={n}>{n}+</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><FL>Min SqFt</FL><input className={ic} type="number" value={params.minSqft || ''} onChange={set('minSqft')} placeholder="800" /></div>
            <div><FL>Max SqFt</FL><input className={ic} type="number" value={params.maxSqft || ''} onChange={set('maxSqft')} placeholder="5,000" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><FL>Built After</FL><input className={ic} type="number" value={params.minYearBuilt || ''} onChange={set('minYearBuilt')} placeholder="1900" /></div>
            <div><FL>Built Before</FL><input className={ic} type="number" value={params.maxYearBuilt || ''} onChange={set('maxYearBuilt')} placeholder="2015" /></div>
          </div>
        </Section>

        {/* ── MARKET SIGNALS ── */}
        <Section id="mkt" icon="📡" title="Market Signals" def={true}>
          <div>
            <div className="flex justify-between mb-1">
              <FL>Max DOM</FL>
              <span className="text-blue-900 text-[10px]">{params.daysOnMarketMax >= 365 ? 'Any' : `${params.daysOnMarketMax}d`}</span>
            </div>
            <input type="range" className="w-full" min="0" max="365" step="5" value={params.daysOnMarketMax} onChange={set('daysOnMarketMax')} />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <FL>Min DOM (motivated sellers)</FL>
              <span className="text-blue-900 text-[10px]">{params.daysOnMarketMin === 0 ? 'Any' : `${params.daysOnMarketMin}d+`}</span>
            </div>
            <input type="range" className="w-full" min="0" max="180" step="5" value={params.daysOnMarketMin} onChange={set('daysOnMarketMin')} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={params.priceReduced} onChange={set('priceReduced')} className="accent-blue-900 w-3.5 h-3.5" />
            <span className="text-[11px] text-slate-600">Price-reduced only</span>
          </label>
        </Section>

        {/* ── FLIP FILTERS ── */}
        <Section id="flip" icon="🎯" title="Flip Filters" def={true}>
          <div>
            <div className="flex justify-between mb-1">
              <FL>Min Flip Score</FL>
              <span className="text-blue-900 text-[10px] font-bold">{params.minFlipScore}</span>
            </div>
            <input type="range" className="w-full" min="0" max="100" value={params.minFlipScore} onChange={set('minFlipScore')} />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <FL>Min Net Profit</FL>
              <span className="text-blue-900 text-[10px]">${(params.minProfit / 1000).toFixed(0)}K</span>
            </div>
            <input type="range" className="w-full" min="0" max="150000" step="2500" value={params.minProfit} onChange={set('minProfit')} />
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <FL>Min ROI %</FL>
              <span className="text-blue-900 text-[10px]">{params.minROI}%</span>
            </div>
            <input type="range" className="w-full" min="0" max="60" step="1" value={params.minROI} onChange={set('minROI')} />
          </div>
          <div>
            <FL>ARV Method</FL>
            <select className={sc} value={params.arvMethod} onChange={set('arvMethod')}>
              <option value="conservative">Conservative (−8%)</option>
              <option value="auto">Market Rate (auto)</option>
              <option value="aggressive">Aggressive (+10%)</option>
            </select>
          </div>
        </Section>

        {/* ── DEAL MATH ── */}
        <Section id="deal" icon="🔢" title="Deal Math" def={false}>
          <div>
            <FL>Rehab Level</FL>
            <select className={sc} value={params.rehabLevel} onChange={set('rehabLevel')}>
              <option value="light">Light — $5K–$25K (cosmetic)</option>
              <option value="medium">Medium — $25K–$75K</option>
              <option value="heavy">Heavy — $75K–$150K</option>
              <option value="gut">Gut Rehab — $150K+</option>
              <option value="custom">Custom amount ↓</option>
            </select>
          </div>
          {params.rehabLevel === 'custom' && (
            <div><FL>Custom Rehab ($)</FL><input className={ic} type="number" value={params.customRehabCost} onChange={set('customRehabCost')} /></div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div><FL>Hold (months)</FL><input className={ic} type="number" value={params.holdMonths} onChange={set('holdMonths')} /></div>
            <div><FL>HM Rate %/yr</FL><input className={ic} type="number" step="0.5" value={params.financingRate} onChange={set('financingRate')} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><FL>Down Pmt %</FL><input className={ic} type="number" step="5" value={params.downPaymentPct} onChange={set('downPaymentPct')} /></div>
            <div><FL>Agent Comm %</FL><input className={ic} type="number" step="0.5" value={params.agentCommissionPct} onChange={set('agentCommissionPct')} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><FL>Close Buy %</FL><input className={ic} type="number" step="0.5" value={params.closingCostBuyPct} onChange={set('closingCostBuyPct')} /></div>
            <div><FL>Close Sell %</FL><input className={ic} type="number" step="0.5" value={params.closingCostSellPct} onChange={set('closingCostSellPct')} /></div>
          </div>
        </Section>

      </div>

      {/* ── SEARCH BUTTON ── */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
        <button onClick={onSearch} disabled={loading}
          className="w-full bg-blue-900 hover:bg-blue-800 active:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500 text-white font-bold text-xs tracking-widest uppercase py-3 rounded-md transition-colors cursor-pointer flex items-center justify-center gap-2">
          {loading
            ? <><span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-white rounded-full spin inline-block" /> Scanning {activeSourceCount} sources...</>
            : `⬡ Scan ${params.searchMode === 'state' ? 'Statewide' : `${params.radius}mi`} · ${activeSourceCount} Sources`}
        </button>
        <div className="text-[10px] text-slate-400 text-center mt-1.5">↵ Enter in location field to search</div>
      </div>
    </div>
  )
}
