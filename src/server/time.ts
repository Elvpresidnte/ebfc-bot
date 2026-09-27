// UK time helpers. Deliberately avoids Intl time zone data so it behaves the
// same everywhere: BST runs from 01:00 UTC on the last Sunday of March to
// 01:00 UTC on the last Sunday of October.

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const

function lastSundayUtc(year: number, month: number): number {
  // month is 0-based. Start from the last day of the month and walk back.
  const d = new Date(Date.UTC(year, month + 1, 0, 1, 0, 0))
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.getTime()
}

/** Hours the UK is ahead of UTC at the given instant (0 or 1). */
export function ukOffsetHours(at: Date): number {
  const y = at.getUTCFullYear()
  const start = lastSundayUtc(y, 2)
  const end = lastSundayUtc(y, 9)
  const t = at.getTime()
  return t >= start && t < end ? 1 : 0
}

export type UkParts = {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  weekday: number // 0 = Sunday
}

export function ukParts(at: Date): UkParts {
  const local = new Date(at.getTime() + ukOffsetHours(at) * 3_600_000)
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    weekday: local.getUTCDay(),
  }
}

/** ISO week key such as "2026-W40" for the UK-local date of `at`. */
export function ukIsoWeek(at: Date): string {
  const p = ukParts(at)
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * Turn the site's "Tue 29 September" + "19:45" + season "2026-27" into a UTC
 * Date. The site omits the year, so July-December belong to the season's first
 * year and January-June to the second.
 */
export function kickoffToUtc(
  season: string,
  dateText: string,
  koText: string | undefined,
): Date | undefined {
  const seasonMatch = /^(\d{4})-\d{2}$/.exec(season)
  const dateMatch = /(\d{1,2})\s+([A-Za-z]+)/.exec(dateText)
  if (!seasonMatch || !dateMatch) return undefined
  const startYear = Number(seasonMatch[1])
  const day = Number(dateMatch[1])
  const monthIdx = MONTHS.indexOf(
    dateMatch[2]!.toLowerCase() as (typeof MONTHS)[number],
  )
  if (monthIdx < 0) return undefined
  const year = monthIdx >= 6 ? startYear : startYear + 1

  const koMatch = /(\d{1,2}):(\d{2})/.exec(koText ?? '')
  // Unknown kick-off time: assume the traditional 15:00.
  const hour = koMatch ? Number(koMatch[1]) : 15
  const minute = koMatch ? Number(koMatch[2]) : 0

  // Treat the wall-clock time as UTC first, then correct for BST.
  const naive = new Date(Date.UTC(year, monthIdx, day, hour, minute))
  return new Date(naive.getTime() - ukOffsetHours(naive) * 3_600_000)
}

export function formatUkDate(at: Date): string {
  const p = ukParts(at)
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const month = MONTHS[p.month - 1]!
  return `${days[p.weekday]} ${p.day} ${month[0]!.toUpperCase()}${month.slice(1)}`
}

export function formatUkTime(at: Date): string {
  const p = ukParts(at)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}
