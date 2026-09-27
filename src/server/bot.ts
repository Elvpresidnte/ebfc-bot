// The bot's decision logic: what's new, what to post, and remembering what has
// already been posted (in the app's Redis) so nothing goes up twice.

import {context, reddit, redis, settings} from '@devvit/web/server'
import {
  fetchText,
  isOff,
  isPlayed,
  type Match,
  type NewsItem,
  parseMatches,
  parseNewsFeed,
  parseTable,
  type TableRow,
  URLS,
} from './ebfc.ts'
import {type Draft, newsDraft, previewDraft, resultDraft, tableDraft} from './format.ts'
import {ukIsoWeek, ukParts} from './time.ts'

/** Hard cap so a glitch can never flood the subreddit. Leftovers go next run. */
export const MAX_POSTS_PER_RUN = 4
/** Ignore anything older than this when deciding what's "new". */
const MAX_AGE_MS = 7 * 24 * 3_600_000

const KEY = {
  seeded: 'state:seeded',
  news: 'seen:news',
  results: 'seen:results',
  previews: 'seen:previews',
  tableWeek: 'table:lastWeek',
  tableHash: 'table:lastHash',
} as const

export type RunSummary = {
  posted: string[]
  errors: string[]
  seeded: boolean
}

type Settings = {
  postNews: boolean
  skipMatchReports: boolean
  postResults: boolean
  postPreviews: boolean
  previewHoursBefore: number
  postTable: boolean
}

async function loadSettings(): Promise<Settings> {
  const [postNews, skipMatchReports, postResults, postPreviews, previewHoursBefore, postTable] =
    await Promise.all([
      settings.get<boolean>('postNews'),
      settings.get<boolean>('skipMatchReports'),
      settings.get<boolean>('postResults'),
      settings.get<boolean>('postPreviews'),
      settings.get<number>('previewHoursBefore'),
      settings.get<boolean>('postTable'),
    ])
  const hours = Number(previewHoursBefore)
  return {
    postNews: postNews ?? true,
    skipMatchReports: skipMatchReports ?? false,
    postResults: postResults ?? true,
    postPreviews: postPreviews ?? true,
    previewHoursBefore: Number.isFinite(hours) && hours > 0 ? Math.min(hours, 168) : 24,
    postTable: postTable ?? true,
  }
}

type SiteData = {
  news: NewsItem[] | undefined
  results: Match[] | undefined
  fixtures: Match[] | undefined
  table: TableRow[] | undefined
}

async function loadSite(errors: string[]): Promise<SiteData> {
  const grab = async <T>(label: string, url: string, parse: (s: string) => T): Promise<T | undefined> => {
    try {
      return parse(await fetchText(url))
    } catch (err) {
      errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`)
      return undefined
    }
  }
  const [news, results, fixtures, table] = await Promise.all([
    grab('news', URLS.feed, parseNewsFeed),
    grab('results', URLS.results, parseMatches),
    grab('fixtures', URLS.fixtures, parseMatches),
    grab('table', URLS.table, parseTable),
  ])
  return {news, results, fixtures, table}
}

async function isSeen(key: string, id: string): Promise<boolean> {
  return (await redis.hGet(key, id)) !== undefined
}

async function markSeen(key: string, id: string): Promise<void> {
  await redis.hSet(key, {[id]: String(Date.now())})
}

async function submit(draft: Draft): Promise<string> {
  const subredditName = context.subredditName
  const post = draft.url
    ? await reddit.submitPost({subredditName, title: draft.title, url: draft.url})
    : await reddit.submitPost({subredditName, title: draft.title, text: draft.text ?? ''})
  console.log(`posted ${post.id}: ${draft.title}`)
  return draft.title
}

function byKickoffAsc(a: Match, b: Match): number {
  return (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0)
}

/**
 * First successful run: remember everything currently on the site without
 * posting it, so installing the bot doesn't dump a backlog on the subreddit.
 */
async function seed(site: SiteData): Promise<boolean> {
  if (await redis.get(KEY.seeded)) return false
  if (!site.news || !site.results) return false // wait for a clean fetch
  for (const n of site.news) await markSeen(KEY.news, n.id)
  for (const m of site.results) await markSeen(KEY.results, m.id)
  await redis.set(KEY.seeded, new Date().toISOString())
  console.log(`seeded ${site.news.length} news items and ${site.results.length} results`)
  return true
}

export async function runBot(now = new Date()): Promise<RunSummary> {
  const summary: RunSummary = {posted: [], errors: [], seeded: false}
  const cfg = await loadSettings()
  const site = await loadSite(summary.errors)
  const table = site.table ?? []

  summary.seeded = await seed(site)
  if (summary.seeded) return summary
  if (!(await redis.get(KEY.seeded))) {
    summary.errors.push('not seeded yet (site fetch failed); nothing posted')
    return summary
  }

  const budget = () => MAX_POSTS_PER_RUN - summary.posted.length
  const safely = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (err) {
      summary.errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // 1. Full-time results (most time-sensitive).
  if (cfg.postResults && site.results) {
    await safely('results', async () => {
      const played = site.results!.filter(isPlayed).sort(byKickoffAsc)
      for (const m of played) {
        if (budget() <= 0) break
        if (await isSeen(KEY.results, m.id)) continue
        const age = m.kickoff ? now.getTime() - m.kickoff.getTime() : 0
        if (age > MAX_AGE_MS) {
          await markSeen(KEY.results, m.id)
          continue
        }
        summary.posted.push(await submit(resultDraft(m, table)))
        await markSeen(KEY.results, m.id)
      }
    })
  }

  // 2. Match previews.
  if (cfg.postPreviews && site.fixtures) {
    await safely('previews', async () => {
      const windowMs = cfg.previewHoursBefore * 3_600_000
      const recent = (site.results ?? [])
        .filter(isPlayed)
        .sort((a, b) => byKickoffAsc(b, a))
      for (const m of site.fixtures!.sort(byKickoffAsc)) {
        if (budget() <= 0) break
        if (!m.kickoff || isPlayed(m) || isOff(m)) continue
        const untilKo = m.kickoff.getTime() - now.getTime()
        if (untilKo <= 0 || untilKo > windowMs) continue
        if (await isSeen(KEY.previews, m.id)) continue
        summary.posted.push(await submit(previewDraft(m, table, recent)))
        await markSeen(KEY.previews, m.id)
      }
    })
  }

  // 3. News articles, oldest first.
  if (cfg.postNews && site.news) {
    await safely('news', async () => {
      const items = [...site.news!].sort(
        (a, b) => (a.published?.getTime() ?? 0) - (b.published?.getTime() ?? 0),
      )
      for (const n of items) {
        if (budget() <= 0) break
        if (await isSeen(KEY.news, n.id)) continue
        const tooOld = n.published && now.getTime() - n.published.getTime() > MAX_AGE_MS
        const isReport = n.categories.some(c => /match report/i.test(c))
        if (tooOld || (cfg.skipMatchReports && isReport)) {
          await markSeen(KEY.news, n.id)
          continue
        }
        summary.posted.push(await submit(newsDraft(n.title, n.url)))
        await markSeen(KEY.news, n.id)
      }
    })
  }

  // 4. Weekly league table: Monday from 10:00 UK, once per week, only if changed.
  if (cfg.postTable && table.length && budget() > 0) {
    await safely('table', async () => {
      const uk = ukParts(now)
      const week = ukIsoWeek(now)
      if (uk.weekday !== 1 || uk.hour < 10) return
      if ((await redis.get(KEY.tableWeek)) === week) return
      const hash = JSON.stringify(table)
      if ((await redis.get(KEY.tableHash)) !== hash) {
        summary.posted.push(await submit(tableDraft(table, now)))
        await redis.set(KEY.tableHash, hash)
      }
      // Only mark the week done once posted (or unchanged), so a failed post retries.
      await redis.set(KEY.tableWeek, week)
    })
  }

  return summary
}

/** Moderator menu action: post the table right now, regardless of schedule. */
export async function postTableNow(now = new Date()): Promise<string> {
  const table = parseTable(await fetchText(URLS.table))
  if (!table.length) throw Error('could not read the league table from ebfc.co.uk')
  const title = await submit(tableDraft(table, now))
  await redis.set(KEY.tableHash, JSON.stringify(table))
  await redis.set(KEY.tableWeek, ukIsoWeek(now))
  return title
}
