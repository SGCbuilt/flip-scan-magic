import React, { useState } from 'react'
import { SearchParams, SearchMode, DataSources } from '../types'

interface Props {
  params: SearchParams
  onChange: (p: SearchParams) => void
  onSearch: () => void
  loading: boolean
}

const ic = `w-full rounded-lg border text-sm px-3 py-2 outline-none transition-colors`
  + ` bg-white text-gray-900 border-[var(--sgc-gray-border)]`
  + ` focus:border-[var(--sgc-navy)] focus:ring-1 focus:ring-[var(--sgc-navy)]/20 placeholder:text-gray-400`
const sc = ic + ' cursor-pointer appearance-none'

const FL = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs font-medium mb-1" style={{ color: 'var(--sgc-gray-mid)', letterSpacing: '0.03em' }}>{children}</div>
)

const SOURCES: { key: keyof DataSources; icon: string; label: string; desc: string; color: string }[] = [
  { key: 'activeMLS',         icon: '⊞', label: 'Active MLS',       desc: 'Live MLS listings',            color: '#1B3A8C' },
  { key: 'foreclosures',      icon: '⚖', label: 'Foreclosures',     desc: 'Bank-owned REO',               color: '#C0341D' },
  { key: 'shortSales',        icon: '↓', label: 'Short Sales',      desc: 'Pre-foreclosure deals',        color: '#C45E1A' },
  { key: 'recentlyOffMarket', icon: '○', label: 'Off-Market',       desc: 'Delisted in 90 days',          color: '#6B3FAD' },
  { key: 'propertyRecords',   icon: '▦', label: 'Property Records', desc: '140M+ non-listed owners',      color: '#1A7A4A' },
  { key: 'corporateOwned',    icon: '◈', label: 'Corporate Owned',  desc: 'Org-owned, motivated sellers', color: '#8A5700' },
]

const MODE_INFO: Record<SearchMode, { placeholder: string; hint: string }> = {
  city:    { placeholder: 'Norfolk, VA  ·  Austin, TX', hint: 'Search all listings in a city' },
  state:   { placeholder: 'Virginia  ·  VA  ·  Texas',  hint: 'Full statewide sweep' },
  zip:     { placeholder: '23501  ·  78701',             hint: '5-digit zip code' },
  address: { placeholder: '123 Main St, Norfolk, VA',    hint: 'Pin-drop search near address' },
}

const PRESETS = {
  quickflip:  { maxPrice: 350000, rehabLevel: 'light' as const,  holdMonths: 4, minROI: 18, strategy: 'flip' as const },
  wholesale:  { maxPrice: 180000, rehabLevel: 'heavy' as const,  daysOnMarketMin: 45, minProfit: 15000, strategy: 'wholesale' as const, arvMethod: 'conservative' as const },
  brrrr:      { maxPrice: 320000, rehabLevel: 'medium' as const, holdMonths: 12, minROI: 10, strategy: 'brrrr' as const },
  luxury:     { minPrice: 500000, maxPrice: 1500000, rehabLevel: 'heavy' as const, bedrooms: 4, strategy: 'luxury' as const, arvMethod: 'aggressive' as const },
  distressed: { rehabLevel: 'gut' as const, daysOnMarketMin: 60, maxYearBuilt: 1985, arvMethod: 'conservative' as const },
}

const RADIUS_MARKS = [1, 5, 10, 25, 50, 75, 100]

const cleanStateInput = (value: string) => value.replace(/[^a-z]/gi, '').toUpperCase().slice(-2)
const cleanZipInput = (value: string) => value.replace(/\D/g, '').slice(-5)
const selectOnFocus = (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select()

const splitCityState = (q: string): { city: string; state: string } => {
  const value = q || ''
  const commaIndex = value.indexOf(',')
  if (commaIndex >= 0) {
    return { city: value.slice(0, commaIndex), state: cleanStateInput(value.slice(commaIndex + 1)) }
  }

  const cityStateMatch = value.match(/^(.*)\s+([A-Za-z]{2})$/)
  if (cityStateMatch) return { city: cityStateMatch[1], state: cleanStateInput(cityStateMatch[2]) }

  return { city: value, state: '' }
}

interface SectionProps {
  id: string
  title: string
  def?: boolean
  children: React.ReactNode
  isOpen: (id: string, def?: boolean) => boolean
  onToggle: (id: string) => void
}

function Section({ id, title, def = true, children, isOpen, onToggle }: SectionProps) {
  const open = isOpen(id, def)

  return (
    <div className="border-t pt-3 mt-3" style={{ borderColor: 'var(--sgc-gray-border)' }}>
      <button onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between mb-2.5 cursor-pointer bg-transparent border-none text-left">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--sgc-navy)', letterSpacing: '0.08em' }}>{title}</span>
        <span className="text-xs" style={{ color: 'var(--sgc-gray-mid)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="space-y-2.5">{children}</div>}
    </div>
  )
}

export default function Sidebar({ params, onChange, onSearch, loading }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ deal: true })
  const toggle = (id: string) => setCollapsed(c => ({ ...c, [id]: !c[id] }))
  const isOpen = (id: string, def = true) => collapsed[id] === undefined ? def : !collapsed[id]

  const set = (key: keyof SearchParams) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const t = e.target
    let val: any = t.value
    if (t.type === 'number' || t.type === 'range') val = parseFloat(t.value) || 0
    if (t.type === 'checkbox') val = (t as HTMLInputElement).checked
    onChange({ ...params, [key]: val })
  }
  const setCity = (city: string) => {
    const { state } = splitCityState(params.locationQuery)
    onChange({ ...params, locationQuery: state ? `${city}, ${state}` : city })
  }
  const setStatePart = (state: string) => {
    const { city } = splitCityState(params.locationQuery)
    const s = cleanStateInput(state)
    onChange({ ...params, locationQuery: city ? `${city}, ${s}` : s })
  }
  const setSource = (key: keyof DataSources, val: boolean) =>
    onChange({ ...params, sources: { ...params.sources, [key]: val } })
  const toggleAll = (val: boolean) =>
    onChange({ ...params, sources: Object.fromEntries(SOURCES.map(s => [s.key, val])) as unknown as DataSources })

  const activeSources = Object.values(params.sources).filter(Boolean).length
  const radiusLabel = params.radius >= 100 ? '100 mi' : `${params.radius} mi`

  return (
    <div className="flex-shrink-0 flex flex-col h-full border-r"
      style={{ width: 300, background: 'var(--sgc-white)', borderColor: 'var(--sgc-gray-border)' }}>

      <div className="flex-1 overflow-y-auto p-4 min-h-0">

        {/* Strategy presets */}
        <div className="mb-1">
          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--sgc-navy)', letterSpacing: '0.08em' }}>Strategy</div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { k: 'quickflip', l: 'Quick Flip'  },
              { k: 'wholesale', l: 'Wholesale'   },
              { k: 'brrrr',     l: 'BRRRR'       },
              { k: 'luxury',    l: 'Luxury'      },
              { k: 'distressed',l: 'Distressed'  },
            ].map(({ k, l }) => (
              <button key={k} onClick={() => onChange({ ...params, ...PRESETS[k as keyof typeof PRESETS] })}
                className="text-xs px-2.5 py-2 rounded-lg border cursor-pointer transition-all text-left font-medium"
                style={{ borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-navy)', background: 'var(--sgc-navy-pale)' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Data Sources */}
        <Section id="src" title={`Data Sources  ${activeSources}/6`} def={true} isOpen={isOpen} onToggle={toggle}>
          <div className="flex gap-2 mb-1">
            <button onClick={() => toggleAll(true)}
              className="text-xs cursor-pointer bg-transparent border-none font-semibold"
              style={{ color: 'var(--sgc-navy)' }}>All On</button>
            <button onClick={() => toggleAll(false)}
              className="text-xs cursor-pointer bg-transparent border-none"
              style={{ color: 'var(--sgc-gray-mid)' }}>All Off</button>
          </div>
          <div className="space-y-1.5">
            {SOURCES.map(s => (
              <label key={s.key}
                className="flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all"
                style={{
                  borderColor: params.sources[s.key] ? s.color + '40' : 'var(--sgc-gray-border)',
                  background: params.sources[s.key] ? s.color + '08' : 'transparent',
                }}>
                <input type="checkbox" checked={params.sources[s.key]}
                  onChange={e => setSource(s.key, e.target.checked)}
                  className="mt-0.5 flex-shrink-0 w-3.5 h-3.5" style={{ accentColor: s.color }} />
                <div className="min-w-0">
                  <div className="text-xs font-semibold" style={{ color: params.sources[s.key] ? s.color : 'var(--sgc-black)' }}>
                    {s.label}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--sgc-gray-mid)' }}>{s.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </Section>

        {/* Location */}
        <Section id="loc" title="Location" def={true} isOpen={isOpen} onToggle={toggle}>
          <div>
            <FL>Search Mode</FL>
            <div className="grid grid-cols-4 gap-1 mb-2">
              {(['city','state','zip','address'] as SearchMode[]).map(mode => (
                <button key={mode} onClick={() => onChange({ ...params, searchMode: mode, locationQuery: '' })}
                  className="py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all"
                  style={params.searchMode === mode
                    ? { background: 'var(--sgc-navy)', borderColor: 'var(--sgc-navy)', color: 'white' }
                    : { background: 'transparent', borderColor: 'var(--sgc-gray-border)', color: 'var(--sgc-gray-mid)' }}>
                  {mode}
                </button>
              ))}
            </div>
            <div className="text-[10px] mb-2 px-2 py-1.5 rounded-lg" style={{ background: 'var(--sgc-navy-pale)', color: 'var(--sgc-navy)' }}>
              {MODE_INFO[params.searchMode].hint}
            </div>
            {params.searchMode === 'city' ? (
              <div className="grid grid-cols-[1fr_70px] gap-2">
                <div>
                  <FL>City</FL>
                  <input className={ic} type="text" autoComplete="address-level2"
                    value={splitCityState(params.locationQuery).city}
                    onChange={e => setCity(e.target.value)}
                    onFocus={selectOnFocus}
                    placeholder="Norfolk"
                    onKeyDown={e => e.key === 'Enter' && onSearch()} />
                </div>
                <div>
                  <FL>State</FL>
                  <input className={ic + ' uppercase'} type="text" autoComplete="address-level1"
                    value={splitCityState(params.locationQuery).state}
                    onChange={e => setStatePart(e.target.value)}
                    onFocus={selectOnFocus}
                    placeholder="VA"
                    onKeyDown={e => e.key === 'Enter' && onSearch()} />
                </div>
              </div>
            ) : params.searchMode === 'state' ? (
              <input className={ic + ' uppercase'} type="text" autoComplete="address-level1"
                value={params.locationQuery}
                onChange={e => onChange({ ...params, locationQuery: cleanStateInput(e.target.value) })}
                onFocus={selectOnFocus}
                placeholder="VA"
                onKeyDown={e => e.key === 'Enter' && onSearch()} />
            ) : params.searchMode === 'zip' ? (
              <input className={ic} type="text" inputMode="numeric" autoComplete="postal-code"
                value={params.locationQuery}
                onChange={e => onChange({ ...params, locationQuery: cleanZipInput(e.target.value) })}
                onFocus={selectOnFocus}
                placeholder="23501"
                onKeyDown={e => e.key === 'Enter' && onSearch()} />
            ) : (
              <input className={ic} type="text" autoComplete="street-address"
                value={params.locationQuery}
                onChange={set('locationQuery')}
                placeholder={MODE_INFO[params.searchMode].placeholder}
                onKeyDown={e => e.key === 'Enter' && onSearch()} />
            )}
          </div>

          {params.searchMode !== 'state' && (
            <div>
              <div className="flex justify-between mb-1">
                <FL>Radius</FL>
                <span className="text-xs font-bold" style={{ color: 'var(--sgc-navy)' }}>{radiusLabel}</span>
              </div>
              <input type="range" className="w-full mb-1" min="1" max="100" step="1"
                value={params.radius} onChange={set('radius')} />
              <div className="flex justify-between">
                {RADIUS_MARKS.map(m => (
                  <button key={m} onClick={() => onChange({ ...params, radius: m })}
                    className="text-[9px] px-1 py-0.5 rounded cursor-pointer transition-colors bg-transparent border-none"
                    style={{ color: params.radius === m ? 'var(--sgc-navy)' : 'var(--sgc-gray-mid)', fontWeight: params.radius === m ? 700 : 400 }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Property Filters */}
        <Section id="prop" title="Property" def={true} isOpen={isOpen} onToggle={toggle}>
          <div>
            <FL>Type</FL>
            <select className={sc} value={params.propertyType} onChange={set('propertyType')}>
              <option value="">All Types</option>
              <option value="Single Family">Single Family</option>
              <option value="Condo">Condo</option>
              <option value="Townhouse">Townhouse</option>
              <option value="Multi-Family">Multi-Family</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><FL>Min Price</FL><input className={ic} type="number" value={params.minPrice || ''} onChange={set('minPrice')} placeholder="50,000" /></div>
            <div><FL>Max Price</FL><input className={ic} type="number" value={params.maxPrice || ''} onChange={set('maxPrice')} placeholder="700,000" /></div>
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
            <div><FL>Built After</FL><input className={ic} type="number" value={params.minYearBuilt || ''} onChange={set('minYearBuilt')} placeholder="1900" /></div>
            <div><FL>Built Before</FL><input className={ic} type="number" value={params.maxYearBuilt || ''} onChange={set('maxYearBuilt')} placeholder="2015" /></div>
          </div>
        </Section>

        {/* Market Signals */}
        <Section id="mkt" title="Market Signals" def={true} isOpen={isOpen} onToggle={toggle}>
          <div>
            <div className="flex justify-between mb-1"><FL>Max DOM</FL>
              <span className="text-xs font-bold" style={{ color: 'var(--sgc-navy)' }}>{params.daysOnMarketMax >= 365 ? 'Any' : `${params.daysOnMarketMax}d`}</span>
            </div>
            <input type="range" className="w-full" min="0" max="365" step="5" value={params.daysOnMarketMax} onChange={set('daysOnMarketMax')} />
          </div>
          <div>
            <div className="flex justify-between mb-1"><FL>Min DOM (motivated)</FL>
              <span className="text-xs font-bold" style={{ color: 'var(--sgc-navy)' }}>{params.daysOnMarketMin === 0 ? 'Any' : `${params.daysOnMarketMin}d+`}</span>
            </div>
            <input type="range" className="w-full" min="0" max="180" step="5" value={params.daysOnMarketMin} onChange={set('daysOnMarketMin')} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={params.priceReduced} onChange={set('priceReduced')} className="w-3.5 h-3.5" />
            <span className="text-xs" style={{ color: 'var(--sgc-black)' }}>Price-reduced only</span>
          </label>
        </Section>

        {/* Flip Criteria */}
        <Section id="flip" title="Flip Criteria" def={true} isOpen={isOpen} onToggle={toggle}>
          <div>
            <div className="flex justify-between mb-1"><FL>Min Flip Score</FL>
              <span className="text-xs font-bold" style={{ color: 'var(--sgc-navy)' }}>{params.minFlipScore}</span>
            </div>
            <input type="range" className="w-full" min="0" max="100" value={params.minFlipScore} onChange={set('minFlipScore')} />
          </div>
          <div>
            <div className="flex justify-between mb-1"><FL>Min Net Profit</FL>
              <span className="text-xs font-bold" style={{ color: 'var(--sgc-navy)' }}>${(params.minProfit/1000).toFixed(0)}K</span>
            </div>
            <input type="range" className="w-full" min="0" max="150000" step="2500" value={params.minProfit} onChange={set('minProfit')} />
          </div>
          <div>
            <div className="flex justify-between mb-1"><FL>Min ROI %</FL>
              <span className="text-xs font-bold" style={{ color: 'var(--sgc-navy)' }}>{params.minROI}%</span>
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

        {/* Deal Math */}
        <Section id="deal" title="Deal Math" def={false} isOpen={isOpen} onToggle={toggle}>
          <div>
            <FL>Rehab Level</FL>
            <select className={sc} value={params.rehabLevel} onChange={set('rehabLevel')}>
              <option value="light">Light — $5K–$25K</option>
              <option value="medium">Medium — $25K–$75K</option>
              <option value="heavy">Heavy — $75K–$150K</option>
              <option value="gut">Gut — $150K+</option>
              <option value="custom">Custom amount</option>
            </select>
          </div>
          {params.rehabLevel === 'custom' && (
            <div><FL>Custom Rehab ($)</FL><input className={ic} type="number" value={params.customRehabCost} onChange={set('customRehabCost')} /></div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div><FL>Hold (months)</FL><input className={ic} type="number" value={params.holdMonths} onChange={set('holdMonths')} /></div>
            <div><FL>Rate %/yr</FL><input className={ic} type="number" step="0.5" value={params.financingRate} onChange={set('financingRate')} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><FL>Down Pmt %</FL><input className={ic} type="number" step="5" value={params.downPaymentPct} onChange={set('downPaymentPct')} /></div>
            <div><FL>Commission %</FL><input className={ic} type="number" step="0.5" value={params.agentCommissionPct} onChange={set('agentCommissionPct')} /></div>
          </div>
        </Section>
      </div>

      {/* Search button */}
      <div className="p-4 border-t flex-shrink-0" style={{ borderColor: 'var(--sgc-gray-border)', background: 'var(--sgc-white)' }}>
        <button onClick={onSearch} disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold tracking-wide transition-all cursor-pointer border-none"
          style={{ background: loading ? 'var(--sgc-gray-border)' : 'var(--sgc-navy)', color: loading ? 'var(--sgc-gray-mid)' : 'white' }}>
          {loading
            ? <><span className="w-4 h-4 border-2 border-gray-300 border-t-white rounded-full spin inline-block" /> Scanning {activeSources} sources...</>
            : `⊞ Scan ${params.searchMode === 'state' ? 'Statewide' : `${params.radius}mi`} · ${activeSources} Sources`}
        </button>
      </div>
    </div>
  )
}
