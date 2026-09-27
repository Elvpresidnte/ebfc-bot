// Fetching and parsing ebfc.co.uk. Parsers are pure functions so they can be
// unit tested against saved HTML without network access.

import {XMLParser} from 'fast-xml-parser'
import {parse, type HTMLElement} from 'node-html-parser'
import {kickoffToUtc} from './time.ts'

export const SITE = 'https://ebfc.co.uk'
export const URLS = {
  feed: `${SITE}/feed/`,
  results: `${SITE}/results/men/`,
  fixtures: `${SITE}/fixtures/men/`,
  table: `${SITE}/tables/men/`,
} as const

// Used to spot "us" in team names ("Eastbourne Boro", "Eastbourne Borough").
export const OUR_CLUB = /eastbourne/i

export type NewsItem = {
  id: string
  title: string
  url: string
  categories: string[]
  published: Date | undefined
}

export type Match = {
  id: string
  url: string
  season: string
  date: string
  kickoffText: string | undefined
  kickoff: Date | undefined
  venue: string
  competition: string
  home: string
  away: string
  homeScore: number | undefined
  awayScore: number | undefined
  reportUrl: string | undefined
  /** Raw text of the card's status area, e.g. "4-2", "19:45" or "P - P". */
  status: string
}

export type TableRow = {
  pos: number
  team: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDiff: number
  points: number
}

export async function fetchText(url: string): Promise<string> {
  const rsp = await fetch(url, {
    headers: {
      'User-Agent': 'ebfc-bot (Reddit Devvit app for r/EastbourneBoroFC)',
      Accept: 'text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  })
  if (!rsp.ok) throw Error(`GET ${url} failed: HTTP ${rsp.status}`)
  return rsp.text()
}

// ---------- text helpers ----------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  pound: '£',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X'
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole
  })
}

function clean(text: string | undefined): string {
  return decodeEntities(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function textOf(root: HTMLElement, selector: string): string {
  return clean(root.querySelector(selector)?.text)
}

function stripQuery(url: string): string {
  return url.replace(/[?#].*$/, '')
}

function absolute(url: string): string {
  if (url.startsWith('http')) return url
  return `${SITE}${url.startsWith('/') ? '' : '/'}${url}`
}

function toInt(text: string): number | undefined {
  const m = /-?\d+/.exec(text)
  return m ? Number(m[0]) : undefined
}

// ---------- news (WordPress RSS) ----------

export function parseNewsFeed(xml: string): NewsItem[] {
  const parser = new XMLParser({
    ignoreAttributes: true,
    processEntities: true,
    isArray: name => name === 'item' || name === 'category',
  })
  const doc = parser.parse(xml)
  const items: unknown[] = doc?.rss?.channel?.item ?? []
  const out: NewsItem[] = []
  for (const raw of items) {
    const item = raw as Record<string, unknown>
    const url = clean(String(item.link ?? ''))
    const title = clean(String(item.title ?? ''))
    if (!url || !title) continue
    const guid = clean(String(item.guid ?? '')) || url
    const cats = Array.isArray(item.category) ? item.category : []
    const pub = item.pubDate ? new Date(String(item.pubDate)) : undefined
    out.push({
      id: guid,
      title,
      url,
      categories: cats.map(c => clean(String(c))),
      published: pub && !Number.isNaN(pub.getTime()) ? pub : undefined,
    })
  }
  return out
}

// ---------- fixtures & results ----------

const MATCH_HREF = /\/matches\/(\d{4}-\d{2})\/(\d+)\//

export function parseMatches(html: string): Match[] {
  const root = parse(html)
  const out: Match[] = []
  const seen = new Set<string>()

  for (const card of root.querySelectorAll('.match-card')) {
    let url: string | undefined
    let reportUrl: string | undefined
    for (const a of card.querySelectorAll('a')) {
      const href = a.getAttribute('href')
      if (!href) continue
      if (!url && MATCH_HREF.test(href)) url = stripQuery(absolute(href))
      if (/report/i.test(a.text) && !MATCH_HREF.test(href)) {
        reportUrl = stripQuery(absolute(href))
      }
    }
    if (!url) continue
    const m = MATCH_HREF.exec(url)!
    const season = m[1]!
    const id = m[2]!
    if (seen.has(id)) continue
    seen.add(id)

    const details = card.querySelector('.match-details')
    let competition = textOf(card, '.match-competition')
    if (!competition && details) {
      const logo = details.querySelector('img.logo')
      competition = clean(logo?.getAttribute('alt'))
    }

    const home = card.querySelector('.match-club-home')
    const away = card.querySelector('.match-club-away')
    const date = textOf(card, '.match-date')
    const kickoffText = textOf(card, '.match-ko') || undefined

    const homeScore = home ? toInt(textOf(home, '.match-club-score')) : undefined
    const awayScore = away ? toInt(textOf(away, '.match-club-score')) : undefined

    out.push({
      id,
      url,
      season,
      date,
      kickoffText,
      kickoff: kickoffToUtc(season, date, kickoffText),
      venue: textOf(card, '.match-venue-name'),
      competition,
      home: home ? textOf(home, '.match-club-name') : '',
      away: away ? textOf(away, '.match-club-name') : '',
      homeScore,
      awayScore,
      reportUrl,
      status: textOf(card, '.match-state'),
    })
  }
  return out
}

export function isPlayed(m: Match): boolean {
  return m.homeScore !== undefined && m.awayScore !== undefined
}

/** Postponed, abandoned or cancelled, per the card's status text. */
export function isOff(m: Match): boolean {
  return /postpon|abandon|cancel|\bp\s*-\s*p\b/i.test(m.status)
}

/** W, D or L from our point of view. */
export function outcome(m: Match): 'W' | 'D' | 'L' | undefined {
  if (!isPlayed(m)) return undefined
  const weAreHome = OUR_CLUB.test(m.home)
  const us = weAreHome ? m.homeScore! : m.awayScore!
  const them = weAreHome ? m.awayScore! : m.homeScore!
  return us > them ? 'W' : us < them ? 'L' : 'D'
}

// ---------- league table ----------

export function parseTable(html: string): TableRow[] {
  const root = parse(html)
  const table = root.querySelector('table')
  if (!table) return []
  const rows: TableRow[] = []
  for (const tr of table.querySelectorAll('tr')) {
    const team = textOf(tr, '.standings-club-name')
    if (!team) continue // header row
    const num = (cls: string) => toInt(textOf(tr, `td.${cls}`)) ?? 0
    rows.push({
      pos: num('standings-pos'),
      team,
      played: num('standings-pld'),
      won: num('standings-w'),
      drawn: num('standings-d'),
      lost: num('standings-l'),
      goalsFor: num('standings-f'),
      goalsAgainst: num('standings-a'),
      goalDiff: num('standings-gd'),
      points: num('standings-pts'),
    })
  }
  return rows
}

/** Find a club in the table despite small naming differences between pages. */
export function findInTable(rows: TableRow[], name: string): TableRow | undefined {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(fc|afc|town|united|utd|borough|boro|city)\b/g, '')
      .replace(/[^a-z]/g, '')
  const target = norm(name)
  if (!target) return undefined
  return (
    rows.find(r => norm(r.team) === target) ??
    rows.find(r => norm(r.team).startsWith(target) || target.startsWith(norm(r.team)))
  )
}
