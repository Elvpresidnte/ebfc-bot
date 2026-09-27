// Titles and bodies for everything the bot posts. Reddit markdown.

import {
  findInTable,
  type Match,
  OUR_CLUB,
  outcome,
  type TableRow,
  URLS,
} from './ebfc.ts'
import {formatUkDate, formatUkTime} from './time.ts'

const FOOTER =
  '\n\n---\n\n^(Posted automatically by the r/EastbourneBoroFC bot. Data from) ^[ebfc.co.uk](https://ebfc.co.uk)^.'

export type Draft = {title: string; text?: string; url?: string}

function trimTitle(title: string): string {
  return title.length <= 300 ? title : `${title.slice(0, 297)}...`
}

function competitionTag(competition: string): string {
  return competition ? ` | ${competition}` : ''
}

function when(m: Match): string {
  if (!m.kickoff) return m.date
  return `${formatUkDate(m.kickoff)}, ${formatUkTime(m.kickoff)} KO`
}

function tablePosLine(rows: TableRow[], team: string): string | undefined {
  const r = findInTable(rows, team)
  if (!r) return undefined
  return `**${team}:** ${ordinal(r.pos)}, ${r.points} pts from ${r.played} (W${r.won} D${r.drawn} L${r.lost}, GD ${signed(r.goalDiff)})`
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

// ---------- news ----------

export function newsDraft(title: string, url: string): Draft {
  return {title: trimTitle(title), url}
}

// ---------- full time ----------

export function resultDraft(m: Match, table: TableRow[]): Draft {
  const title = trimTitle(
    `FT: ${m.home} ${m.homeScore}-${m.awayScore} ${m.away}${competitionTag(m.competition)}`,
  )
  const lines = [
    `# ${m.home} ${m.homeScore} - ${m.awayScore} ${m.away}`,
    '',
    `**Competition:** ${m.competition || 'n/a'}  `,
    `**Date:** ${m.date}  `,
    `**Venue:** ${m.venue || 'n/a'}`,
    '',
    `* [Match centre](${m.url})`,
  ]
  if (m.reportUrl) lines.push(`* [Match report](${m.reportUrl})`)
  lines.push(`* [Full league table](${URLS.table})`)

  const ours = table.find(r => OUR_CLUB.test(r.team))
  if (ours && /league/i.test(m.competition)) {
    lines.push(
      '',
      `Borough are currently **${ordinal(ours.pos)}** on ${ours.points} points from ${ours.played} games.`,
    )
  }
  lines.push('', 'What did you make of it? Discuss below.')
  return {title, text: lines.join('\n') + FOOTER}
}

// ---------- preview ----------

export function previewDraft(m: Match, table: TableRow[], recent: Match[]): Draft {
  const weAreHome = OUR_CLUB.test(m.home)
  const opponent = weAreHome ? m.away : m.home
  const title = trimTitle(
    `Match Preview: ${m.home} vs ${m.away} - ${when(m)}${competitionTag(m.competition)}`,
  )

  const lines = [
    `# ${m.home} vs ${m.away}`,
    '',
    `**Competition:** ${m.competition || 'n/a'}  `,
    `**Kick-off:** ${when(m)}  `,
    `**Venue:** ${m.venue || 'n/a'} (${weAreHome ? 'home' : 'away'})`,
  ]

  const form = recent
    .map(outcome)
    .filter((o): o is 'W' | 'D' | 'L' => o !== undefined)
    .slice(0, 5)
  if (form.length) {
    lines.push('', `**Borough's last ${form.length}:** ${form.join(' ')} (most recent first)`)
    for (const r of recent.slice(0, 5)) {
      lines.push(`* ${r.date}: ${r.home} ${r.homeScore}-${r.awayScore} ${r.away}`)
    }
  }

  if (/league/i.test(m.competition) && table.length) {
    const us = tablePosLine(table, weAreHome ? m.home : m.away)
    const them = tablePosLine(table, opponent)
    if (us || them) {
      lines.push('', '**League position going in:**', '')
      if (us) lines.push(`* ${us}`)
      if (them) lines.push(`* ${them}`)
    }
  }

  lines.push(
    '',
    `* [Match centre](${m.url})`,
    `* [All fixtures](${URLS.fixtures})`,
    '',
    'Predictions? Going? Get them in below.',
  )
  return {title, text: lines.join('\n') + FOOTER}
}

// ---------- league table ----------

export function tableDraft(rows: TableRow[], now: Date): Draft {
  const title = `League Table - ${formatUkDate(now)}`
  const lines = [
    '| Pos | Team | P | W | D | L | GF | GA | GD | Pts |',
    '|--:|:--|--:|--:|--:|--:|--:|--:|--:|--:|',
  ]
  for (const r of rows) {
    const team = OUR_CLUB.test(r.team) ? `**${r.team}**` : r.team
    const cells = [r.pos, team, r.played, r.won, r.drawn, r.lost, r.goalsFor, r.goalsAgainst, signed(r.goalDiff), r.points]
    const row = `| ${cells.join(' | ')} |`
    lines.push(OUR_CLUB.test(r.team) ? row.replace(/\| (\d+) \|/, '| **$1** |') : row)
  }
  lines.push('', `[Full table on ebfc.co.uk](${URLS.table})`)
  return {title, text: lines.join('\n') + FOOTER}
}
