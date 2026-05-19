import React from 'react'
import { SearchParams } from '../types'

interface Props {
  params: SearchParams
  onChange: (p: SearchParams) => void
  onSearch: () => void
  loading: boolean
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-2 mb-3">
    <span className="text-[10px] tracking-[2px] uppercase text-amber-400 font-semibold">{children}</span>
    <div className="flex-1 h-px bg-amber-500/20" />
  </div>
)

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] tracking-widest uppercase text-zinc-500 mb-1.5">{children}</div>
)

const inputCls = "w-full bg-zinc-900 border border-zinc-800 rounded text-zinc-100 font-mono text-xs px-2.5 py-2 outline-none focus:border-amber-500/50 transition-colors"
const selectCls = inputCls + " cursor-pointer"

export default function Sidebar({ params, onChange, onSearch, loading }: Props) {
  const set = (key: keyof SearchParams) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.type === 'number' || e.target.type === 'range'
      ? parseFloat(e.target.value) || 0
      : e.target.value
    onChange({ ...params, [key]: val })
  }

  const applyPreset = (type: string) => {
    if (type === 'wholesale') onChange({ ...params, maxPrice: 200000, rehabLevel: 'heavy', daysOnMarketMax: 120, minEquity: 30000, minFlipScore: 40 })
    if (type === 'brrrr') onChange({ ...params, maxPrice: 300000, rehabLevel: 'medium', bedrooms: 3, holdMonths: 12, minFlipScore: 55 })
    if (type === 'luxury') onChange({ ...params, minPrice: 400000, maxPrice: 1200000, rehabLevel: 'heavy', bedrooms: 4, minFlipScore: 60 })
  }

  return (
    <div className="w-80 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto h-full p-5">
      <SectionLabel>Search Parameters</SectionLabel>

      <div className="mb-4">
        <FieldLabel>City / Zip Code</FieldLabel>
        <input className={inputCls} value={params.city} onChange={set('city')} placeholder="Norfolk, VA or 23501" />
      </div>

      <div className="mb-4">
        <FieldLabel>Property Type</FieldLabel>
        <select className={selectCls} value={params.propertyType} onChange={set('propertyType')}>
          <option value="">All Types</option>
          <option value="Single Family">Single Family</option>
          <option value="Condo">Condo</option>
          <option value="Townhouse">Townhouse</option>
          <option value="Multi-Family">Multi-Family</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div>
          <FieldLabel>Min Price</FieldLabel>
          <input className={inputCls} type="number" value={params.minPrice || ''} onChange={set('minPrice')} placeholder="50000" />
        </div>
        <div>
          <FieldLabel>Max Price</FieldLabel>
          <input className={inputCls} type="number" value={params.maxPrice || ''} onChange={set('maxPrice')} placeholder="500000" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div>
          <FieldLabel>Beds Min</FieldLabel>
          <select className={selectCls} value={params.bedrooms || ''} onChange={set('bedrooms')}>
            <option value="">Any</option>
            <option value="2">2+</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
          </select>
        </div>
        <div>
          <FieldLabel>Baths Min</FieldLabel>
          <select className={selectCls} value={params.bathrooms || ''} onChange={set('bathrooms')}>
            <option value="">Any</option>
            <option value="1">1+</option>
            <option value="2">2+</option>
            <option value="3">3+</option>
          </select>
        </div>
      </div>

      <div className="mb-4">
        <FieldLabel>Max Days on Market</FieldLabel>
        <input className={inputCls} type="number" value={params.daysOnMarketMax || ''} onChange={set('daysOnMarketMax')} placeholder="90" />
      </div>

      <div className="border-t border-zinc-800 my-5" />
      <SectionLabel>Flip Filters</SectionLabel>

      <div className="mb-4">
        <FieldLabel>Min Equity Gap ($)</FieldLabel>
        <input className={inputCls} type="number" value={params.minEquity || ''} onChange={set('minEquity')} placeholder="15000" />
      </div>

      <div className="mb-4">
        <div className="flex justify-between items-center mb-1.5">
          <FieldLabel>Min Flip Score</FieldLabel>
          <span className="text-amber-400 text-xs font-semibold">{params.minFlipScore}</span>
        </div>
        <input type="range" className="w-full" min="0" max="100" value={params.minFlipScore} onChange={set('minFlipScore')} />
      </div>

      <div className="border-t border-zinc-800 my-5" />
      <SectionLabel>Renovation Budget</SectionLabel>

      <div className="mb-4">
        <FieldLabel>Rehab Level</FieldLabel>
        <select className={selectCls} value={params.rehabLevel} onChange={set('rehabLevel')}>
          <option value="light">Light ($5K–$25K)</option>
          <option value="medium">Medium ($25K–$75K)</option>
          <option value="heavy">Heavy ($75K–$150K)</option>
          <option value="gut">Gut Rehab ($150K+)</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div>
          <FieldLabel>Hold (months)</FieldLabel>
          <input className={inputCls} type="number" value={params.holdMonths} onChange={set('holdMonths')} />
        </div>
        <div>
          <FieldLabel>Finance Rate %</FieldLabel>
          <input className={inputCls} type="number" step="0.5" value={params.financingRate} onChange={set('financingRate')} />
        </div>
      </div>

      <button
        onClick={onSearch}
        disabled={loading}
        className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 font-semibold text-xs tracking-widest uppercase py-3 rounded transition-colors cursor-pointer mt-1"
      >
        {loading ? '⏳ Searching...' : '⬡ Search Deals'}
      </button>

      <div className="border-t border-zinc-800 my-5" />
      <SectionLabel>Quick Presets</SectionLabel>

      {[
        { key: 'wholesale', label: '📦 Wholesale / Distressed' },
        { key: 'brrrr', label: '♻️ BRRRR Strategy' },
        { key: 'luxury', label: '💎 Luxury Flip' },
      ].map(p => (
        <button
          key={p.key}
          onClick={() => applyPreset(p.key)}
          className="w-full text-left text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 rounded px-3 py-2 mb-2 transition-colors cursor-pointer bg-transparent"
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
