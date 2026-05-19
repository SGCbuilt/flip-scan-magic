export const fmt$ = (n: number | undefined | null): string => {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return '$' + Math.round(n).toLocaleString()
}

export const fmtPct = (n: number, decimals = 1): string => n.toFixed(decimals) + '%'

export const tagColors: Record<string, string> = {
  green: 'border-green-500/30 text-emerald-700 bg-green-500/10',
  amber: 'border-amber-400/70 text-amber-600 bg-amber-500/10',
  blue: 'border-blue-500/30 text-blue-700 bg-blue-500/10',
  red: 'border-red-500/30 text-red-600 bg-red-500/10',
  purple: 'border-purple-500/30 text-purple-700 bg-purple-500/10',
}
