export const fmt$ = (n: number | undefined | null): string => {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return '$' + Math.round(n).toLocaleString()
}

export const fmtPct = (n: number, decimals = 1): string => n.toFixed(decimals) + '%'

export const tagColors: Record<string, string> = {
  green: 'border-green-500/30 text-green-400 bg-green-500/10',
  amber: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
  blue: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
  red: 'border-red-500/30 text-red-400 bg-red-500/10',
  purple: 'border-purple-500/30 text-purple-400 bg-purple-500/10',
}
