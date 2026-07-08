import {
  Scan, Users, Shield, ArrowUpRight, Target, BriefcaseBusiness, Home,
  LayoutDashboard, Receipt, BookOpen, TrendingUp, Calculator, FileSearch,
  Compass, Megaphone, Building2, LineChart, Activity, Radar, MapPinned,
  Layers, Car, Kanban, CheckSquare, Repeat2, Timer, ClipboardList, Tag,
  Users2, Sparkles, BookMarked, Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react'

type Tile = {
  tab?: string
  href?: string
  title: string
  description: string
  icon: LucideIcon
  external?: boolean
}

type Section = {
  title: string
  caption: string
  tiles: Tile[]
}

const sections: Section[] = [
  {
    title: 'Command',
    caption: 'Start the day, watch the numbers.',
    tiles: [
      { tab: 'home', title: 'Morning Brief',   description: 'Daily digest — new leads, stale pipeline, tasks due today.',                icon: LayoutDashboard },
      { tab: 'kpi',  title: 'KPI Dashboard',   description: 'Business performance, accuracy, conversion rates, revenue pacing.',        icon: Activity },
    ],
  },
  {
    title: 'Find Deals',
    caption: 'Sourcing, signals, and drive-by capture.',
    tiles: [
      { tab: 'radar',    title: 'Lead Radar',        description: '11 government APIs — Norfolk, Virginia Beach, Charlotte, Raleigh.',   icon: Radar },
      { tab: 'velocity', title: 'Neighborhood Velocity', description: 'Where the market is moving before comps catch up.',               icon: MapPinned },
      { tab: 'stack',    title: 'List Stack',        description: 'Cross-source signal stacking — triple-signal leads only.',            icon: Layers },
      { tab: 'drive',    title: 'Drive for Dollars', description: 'Mobile capture with instant skip-trace and curb-appeal notes.',      icon: Car },
      { tab: 'deals',    title: 'Deal Scanner',      description: 'MLS + off-market search with GC-calibrated flip scoring.',            icon: Scan },
      { tab: 'hunt',     title: 'Deal Hunter',       description: 'Advanced criteria-based property hunting across sources.',            icon: FileSearch },
    ],
  },
  {
    title: 'Work Deals',
    caption: 'CRM, tasks, and follow-up automation.',
    tiles: [
      { tab: 'pipeline', title: 'Pipeline CRM',    description: 'Kanban CRM — every lead from radar to closed.',                         icon: Kanban },
      { tab: 'tasks',    title: 'Tasks',           description: 'Auto-generated follow-up task command center.',                          icon: CheckSquare },
      { tab: 'drip',     title: 'Drip Sequences',  description: 'Automated 60-day multi-touch follow-up cadence.',                        icon: Repeat2 },
    ],
  },
  {
    title: 'Execute',
    caption: 'Construction clock and post-close truth.',
    tiles: [
      { tab: 'project', title: 'Project Clock', description: 'Construction timeline tracker — every day is carry cost.',                 icon: Timer },
      { tab: 'pl',      title: 'Deal P&L',      description: 'Actuals vs estimates — the learning layer.',                                icon: ClipboardList },
    ],
  },
  {
    title: 'Wholesale',
    caption: 'Move contracts, feed the buyer list.',
    tiles: [
      { tab: 'wholesale', title: 'Wholesale',   description: 'Deal listings, PDF generator, and buyer email blast.',                     icon: Tag },
      { tab: 'buyers',    title: 'Buyer List',  description: 'Buy-box matching and one-click deal blast.',                                icon: Users2 },
    ],
  },
  {
    title: 'Research',
    caption: 'Numbers, comps, and market intelligence.',
    tiles: [
      { tab: 'financial', title: 'Financial Tools',   description: 'Rehab estimator, flip calc, BRRRR, live rates.',                     icon: Calculator },
      { tab: 'market',    title: 'Market Trends',     description: 'Area market stats, days on market, price trends.',                    icon: TrendingUp },
      { tab: 'analyzer',  title: 'Area Intelligence', description: 'AI market analysis by location — Gemini + Claude.',                   icon: Sparkles },
      { tab: 'reference', title: 'Lead Sources',      description: 'Guide to every data source and government API.',                      icon: BookMarked },
    ],
  },
  {
    title: 'Admin & Security',
    caption: 'Keys, access, cloud sync.',
    tiles: [
      { tab: 'settings', title: 'Settings',           description: 'API keys, cloud sync, SMS templates, direct mail.',                   icon: SettingsIcon },
    ],
  },
  {
    title: 'Connected SGC Apps',
    caption: 'Your other Lovable projects, one click away.',
    tiles: [
      { href: 'https://www.sgcbuilt.com/admin', title: 'SGC Portal',   description: 'Main SGC control center — clients, estimates, portal access.', icon: Compass,   external: true },
      { href: 'https://www.sgcsocial.com',      title: 'SGC Social',   description: 'Advertising and social campaigns workspace.',                   icon: Megaphone, external: true },
      { href: 'https://sgcanalyzer.com',        title: 'SGC Analyzer', description: 'Property and market analysis tools.',                           icon: LineChart, external: true },
    ],
  },
]

interface Props {
  onNavigate: (tab: string) => void
}

export default function PortalHub({ onNavigate }: Props) {
  let counter = 0
  return (
    <div className="min-h-full overflow-y-auto" style={{ background: '#F8FAFC', fontFamily: 'Urbanist, system-ui, sans-serif' }}>
      {/* Hero */}
      <div style={{ background: '#0F2460', color: 'white' }}>
        <div className="max-w-6xl mx-auto px-6 pt-16 pb-14">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] mb-5" style={{ color: '#C9A84C' }}>
                — FlipScan · Portal Hub
              </p>
              <h1 className="text-4xl sm:text-5xl font-extrabold leading-[1.05] tracking-tight">
                Run the deal engine.
              </h1>
              <p className="mt-4 max-w-xl text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                Every FlipScan tool, one click away — sourcing, pipeline, execution, and post-close truth.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => onNavigate('home')}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg font-semibold transition-colors cursor-pointer border"
                style={{ borderColor: 'rgba(255,255,255,0.3)', background: 'transparent', color: 'white' }}
              >
                <LayoutDashboard className="h-4 w-4" />
                Morning Brief
              </button>
              <a
                href="https://www.sgcbuilt.com/admin"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg font-semibold transition-colors border"
                style={{ borderColor: 'rgba(255,255,255,0.3)', background: 'transparent', color: 'white' }}
              >
                <Home className="h-4 w-4" />
                SGC Portal
              </a>
              <button
                onClick={() => onNavigate('pipeline')}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg font-semibold transition-opacity cursor-pointer border-none"
                style={{ background: '#C9A84C', color: '#0F2460' }}
              >
                <BriefcaseBusiness className="h-4 w-4" />
                Open Pipeline
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="max-w-6xl mx-auto px-6 py-14 space-y-14">
        {sections.map((section) => (
          <section key={section.title}>
            <div className="flex items-baseline justify-between flex-wrap gap-2 mb-5">
              <h2 className="text-2xl font-bold tracking-tight" style={{ color: '#0F2460' }}>
                {section.title}
              </h2>
              <p className="text-[11px] uppercase tracking-[0.25em]" style={{ color: '#94A3B8' }}>
                {section.caption}
              </p>
            </div>
            <div
              className="grid gap-px sm:grid-cols-2 lg:grid-cols-3 border"
              style={{ background: '#E5E9F0', borderColor: '#E5E9F0' }}
            >
              {section.tiles.map(({ tab, href, title, description, icon: Icon, external }) => {
                counter += 1
                const idx = counter
                const inner = (
                  <>
                    <div className="flex items-start justify-between mb-8">
                      <Icon className="h-7 w-7" strokeWidth={1.5} style={{ color: '#C9A84C' }} />
                      <span className="text-[10px] tabular-nums uppercase tracking-[0.25em]" style={{ color: '#94A3B8' }}>
                        {String(idx).padStart(2, '0')}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold mb-2 tile-title" style={{ color: '#0F2460' }}>{title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: '#64748B', fontFamily: 'Epilogue, system-ui, sans-serif' }}>
                      {description}
                    </p>
                    <ArrowUpRight className="h-4 w-4 tile-arrow absolute bottom-6 right-6 transition-all" style={{ color: '#94A3B8' }} />
                  </>
                )
                const cls = 'group relative bg-white hover:bg-[#FAFBFC] transition-colors p-8 flex flex-col min-h-[200px] cursor-pointer border-none text-left w-full'
                if (external && href) {
                  return (
                    <a key={href} href={href} target="_blank" rel="noopener noreferrer" className={cls}>
                      {inner}
                    </a>
                  )
                }
                return (
                  <button key={tab} onClick={() => tab && onNavigate(tab)} className={cls}>
                    {inner}
                  </button>
                )
              })}
            </div>
          </section>
        ))}

        <div className="pt-4 pb-2 text-center text-[11px] uppercase tracking-[0.3em]" style={{ color: '#94A3B8' }}>
          FlipScan Pro · SGC General Contractors
        </div>
      </div>

      <style>{`
        .group:hover .tile-title { color: #C9A84C; }
        .group:hover .tile-arrow { color: #C9A84C; transform: translate(4px, -4px); }
      `}</style>
    </div>
  )
}