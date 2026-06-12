export function formatDDay(targetDate: string): string {
  const target = new Date(targetDate.replace(/\./g, '-'))
  const now = new Date()
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diff <= 0) return 'D-Day'
  return `D-${diff}`
}

export function formatDate(dateStr: string): string {
  return dateStr.replace(/-/g, '.')
}

export function formatDateRange(start: string, end: string): string {
  const s = start.slice(5).replace('-', '.')
  const e = end.slice(5).replace('-', '.')
  return `${start.slice(0, 4)}. ${s} ~ ${e}`
}
