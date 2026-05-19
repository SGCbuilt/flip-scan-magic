import React, { useState } from 'react'
import { SearchParams } from '../types'

interface Props {
  params: SearchParams
  onChange: (p: SearchParams) => void
  onSearch: () => void
  loading: boolean
}

const SectionLabel = ({ children, icon }: { children: React.ReactNode; icon?: string }) => (
  <div className="flex items-center gap-2 mb-3 mt-5 first:mt-0">
    {icon && <span className="text-sm">{icon}</span>}
    <span className="text-[10px] tracking-[2px] uppercase text-amber-400 font-semibold">{children}</span>
    <div className="flex-1 h-px bg-amber-500/20" />
  </div>
)

const FL = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] tracking-widest uppercase text-zinc-500 mb-1">{children}</div>
)

const ic = "w-full bg-zinc-950 border border-zinc-800 rounded text-zinc-100 font-mono text-xs px-2.5 py-1.5 outline-none focus:border-amber-500/60 transition-colors placeholder:text-zinc-700"
const sc = ic + " cursor-pointer"

const PRESETS: Record<string, Partial<SearchParams>> = {
  wholesale:  { maxPrice: 180000, rehabLevel: 'heavy', daysOnMarketMin: 45, minProfit: 20000, minROI: 15, strategy: 'wholesale', arvMethod: 'conservative' },
  brrrr:      { maxPrice: 320000, rehabLevel: 'medium', bedrooms: 2, holdMonths: 12, minROI: 12, strategy: 'brrrr', downPaymentPct: 20, arvMethod: 'auto' },
  luxury:     { minPrice: 500000, maxPrice: 1500000, rehabLevel: 'heavy', bedrooms: 4, minProfit: 80000, strategy: 'luxury', agentCommissionPct: 5, arvMethod: 'aggressive' },
  quickflip:  { maxPrice: 300000, rehabLevel: 'light', holdMonths: 4, minROI: 20, daysOnMarketMin: 0, strategy: 'flip', arvMethod: 'auto' },
  distressed: { rehabLevel: 'gut', daysOnMarketMin: 60, maxYearBuilt: 1980, minROI: 18, strategy: 'all', arvMethod: 'conservative' },
}

const CollapsibleSection = ({
  id, icon, title, collapsed, onToggle, children,
}: {
  id: string; icon: string; title: string;
  collapsed: boolean; onToggle: (id: string) => void;
  children: React.ReactNode;
}) => (
  <div className="mb-1">
    <button onClick={() => onToggle(id)} className="w-full flex items-center gap-2 mb-2 mt-4 cursor-pointer bg-transparent border-none text-left">
      <span className="text-sm">{icon}</span>
      <span className="text-[10px] tracking-[2px] uppercase text-amber-400 font-semibold">{title}</span>
      <div className="flex-1 h-px bg-amber-500/20" />
      <span className="text-zinc-600 text-xs">{collapsed ? '▸' : '▾'}</span>
    </button>
    {!collapsed && <div className="space-y-3">{children}</div>}
  </div>
)

export default function Sidebar({ params, onChange, onSearch, loading }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const set = (key: keyof SearchParams) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const t = e.target
    let val: any = t.value
    if (t.type === 'number' || t.type === 'range') val = parseFloat(t.value) || 0
    if (t.type === 'checkbox') val = (t as HTMLInputElement).checked
    onChange({ ...params, [key]: val })
  }

  const toggle = (section: string) => setCollapsed(c => ({ ...c, [section]: !c[section] }))

  const applyPreset = (key: string) => {
    onChange({ ...params, ...PRESETS[key] })
  }

  return (
    <div className="w-[300px] flex-shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto h-full flex flex-col">
      <div className="p-4 flex-1 overflow-y-auto">

        {/* PRESETS */}
        <SectionLabel icon="⚡">Strategy Presets</SectionLabel>
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          {[
            { key: 'quickflip',  label: '⚡ Quick Flip',    active: params.strategy === 'flip'      },
            { key: 'wholesale',  label: '📦 Wholesale',     active: params.strategy === 'wholesale'  },
            { key: 'brrrr',      label: '♻️ BRRRR',         active: params.strategy === 'brrrr'      },
            { key: 'luxury',     label: '💎 Luxury',        active: params.strategy === 'luxury'     },
            { key: 'distressed', label: '🏚️ Distressed',    active: false                            },
          ].map(p => (
            <button key={p.key} onClick={() => applyPreset(p.key)}
              className={`text-[10px] tracking-wide uppercase px-2 py-2 rounded border cursor-pointer transition-all text-left
                ${p.active ? 'border-amber-500/50 text-amber-400 bg-amber-500/10' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 bg-transparent'}`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* LOCATION */}
        <CollapsibleSection id="loc" icon="📍" title="Location">
          <div>
            <FL>City, State or Zip</FL>
            <input className={ic} value={params.city} onChange={set('city')} placeholder="Norfolk, VA or 23501"
              onKeyDown={e => e.key === 'Enter' && onSearch()} />
          </div>
          <div>
            <div className="flex justify-between mb-1"><FL>Search Radius (miles)</FL><span className="text-amber-400 text-[10px]">{params.radius} mi</span></div>
            <input type="range" className="w-full" min="1" max="50" step="1" value={params.radius} onChange={set('radius')} />
          </div>
        </CollapsibleSection>

        {/* PROPERTY */}
        <CollapsibleSection id="prop" icon="🏠" title="Property">
          <div>
            <FL>Type</FL>
            <select className={sc} value={params.propertyType} onChange={set('propertyType')}>
              <option value="">All Types</option>
              <option value="Single Family">Single Family</option>
              <option value="Condo">Condo</option>
              <option value="Townhouse">Townhouse</option>
              <option value="Multi-Family">Multi-Family</option>
              <option value="Mobile Home">Mobile Home</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><FL>Min Price</FL><input className={ic} type="number" value={params.minPrice || ''} onChange={set('minPrice')} placeholder="50,000" /></div>
            <div><FL>Max Price</FL><input className={ic} type="number" value={params.maxPrice || ''} onChange={set('maxPrice')} placeholder="500,000" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FL>Beds Min</FL>
              <select className={sc} value={params.bedrooms || ''} onChange={set('bedrooms')}>
                <option value="">Any</option><option value="1">1+</option><option value="2">2+</option>
                <option value="3">3+</option><option value="4">4+</option><option value="5">5+</option>
              </select>
            </div>
            <div>
              <FL>Baths Min</FL>
              <select className={sc} value={params.bathrooms || ''} onChange={set('bathrooms')}>
                <option value="">Any</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><FL>Min SqFt</FL><input className={ic} type="number" value={params.minSqft || ''} onChange={set('minSqft')} placeholder="800" /></div>
            <div><FL>Max SqFt</FL><input className={ic} type="number" value={params.maxSqft || ''} onChange={set('maxSqft')} placeholder="5000" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><FL>Built After</FL><input className={ic} type="number" value={params.minYearBuilt || ''} onChange={set('minYearBuilt')} placeholder="1900" /></div>
            <div><FL>Built Before</FL><input className={ic} type="number" value={params.maxYearBuilt || ''} onChange={set('maxYearBuilt')} placeholder="2010" /></div>
          </div>
        </CollapsibleSection>

        {/* MARKET SIGNALS */}
        <CollapsibleSection id="mkt" icon="📡" title="Market Signals">
          <div>
            <div className="flex justify-between mb-1"><FL>Max Days on Market</FL><span className="text-amber-400 text-[10px]">{params.daysOnMarketMax}d</span></div>
            <input type="range" className="w-full" min="0" max="365" step="5" value={params.daysOnMarketMax} onChange={set('daysOnMarketMax')} />
          </div>
          <div>
            <div className="flex justify-between mb-1"><FL>Min Days on Market (motivated sellers)</FL><span className="text-amber-400 text-[10px]">{params.daysOnMarketMin}d</span></div>
            <input type="range" className="w-full" min="0" max="180" step="5" value={params.daysOnMarketMin} onChange={set('daysOnMarketMin')} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={params.priceReduced} onChange={set('priceReduced')} className="accent-amber-500" />
            <span className="text-[11px] text-zinc-400">Price-reduced only</span>
          </label>
        </CollapsibleSection>

        {/* FLIP CRITERIA */}
        <CollapsibleSection id="flip" icon="🎯" title="Flip Criteria">
          <div>
            <div className="flex justify-between mb-1"><FL>Min Flip Score</FL><span className="text-amber-400 text-[10px]">{params.minFlipScore}</span></div>
            <input type="range" className="w-full" min="0" max="100" value={params.minFlipScore} onChange={set('minFlipScore')} />
          </div>
          <div>
            <div className="flex justify-between mb-1"><FL>Min Net Profit</FL><span className="text-amber-400 text-[10px]">${(params.minProfit/1000).toFixed(0)}K</span></div>
            <input type="range" className="w-full" min="0" max="150000" step="1000" value={params.minProfit} onChange={set('minProfit')} />
          </div>
          <div>
            <div className="flex justify-between mb-1"><FL>Min ROI %</FL><span className="text-amber-400 text-[10px]">{params.minROI}%</span></div>
            <input type="range" className="w-full" min="0" max="60" step="1" value={params.minROI} onChange={set('minROI')} />
          </div>
          <div>
            <FL>ARV Method</FL>
            <select className={sc} value={params.arvMethod} onChange={set('arvMethod')}>
              <option value="conservative">Conservative (-8%)</option>
              <option value="auto">Market Rate (auto)</option>
              <option value="aggressive">Aggressive (+10%)</option>
            </select>
          </div>
        </CollapsibleSection>

        {/* DEAL MATH */}
        <CollapsibleSection id="deal" icon="🔢" title="Deal Math">
          <div>
            <FL>Rehab Level</FL>
            <select className={sc} value={params.rehabLevel} onChange={set('rehabLevel')}>
              <option value="light">Light — $5K–$25K (cosmetic)</option>
              <option value="medium">Medium — $25K–$75K</option>
              <option value="heavy">Heavy — $75K–$150K</option>
              <option value="gut">Gut Rehab — $150K+</option>
              <option value="custom">Custom amount</option>
            </select>
          </div>
          {params.rehabLevel === 'custom' && (
            <div><FL>Custom Rehab ($)</FL><input className={ic} type="number" value={params.customRehabCost} onChange={set('customRehabCost')} /></div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div><FL>Hold (months)</FL><input className={ic} type="number" value={params.holdMonths} onChange={set('holdMonths')} /></div>
            <div><FL>Hard Money Rate %</FL><input className={ic} type="number" step="0.5" value={params.financingRate} onChange={set('financingRate')} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><FL>Down Payment %</FL><input className={ic} type="number" step="5" value={params.downPaymentPct} onChange={set('downPaymentPct')} /></div>
            <div><FL>Agent Comm %</FL><input className={ic} type="number" step="0.5" value={params.agentCommissionPct} onChange={set('agentCommissionPct')} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><FL>Closing Buy %</FL><input className={ic} type="number" step="0.5" value={params.closingCostBuyPct} onChange={set('closingCostBuyPct')} /></div>
            <div><FL>Closing Sell %</FL><input className={ic} type="number" step="0.5" value={params.closingCostSellPct} onChange={set('closingCostSellPct')} /></div>
          </div>
        </CollapsibleSection>

      </div>

      {/* SEARCH BUTTON - sticky bottom */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-900 flex-shrink-0">
        <button
          onClick={onSearch}
          disabled={loading}
          className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 font-semibold text-xs tracking-widest uppercase py-3 rounded-md transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          {loading ? (
            <><span className="w-3.5 h-3.5 border-2 border-zinc-600 border-t-zinc-900 rounded-full spin inline-block" /> Scanning...</>
          ) : (
            '⬡ Scan for Deals'
          )}
        </button>
        <div className="text-[10px] text-zinc-700 text-center mt-2">Press Enter in city field to search</div>
      </div>
    </div>
  )
}
