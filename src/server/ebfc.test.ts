// Parser tests. The HTML below mirrors the structure of ebfc.co.uk as of
// September 2026 (class names taken from the live site).

import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
  decodeEntities,
  findInTable,
  isOff,
  isPlayed,
  outcome,
  parseMatches,
  parseNewsFeed,
  parseTable,
} from './ebfc.ts'
import {previewDraft, resultDraft, tableDraft} from './format.ts'
import {kickoffToUtc, ukIsoWeek, ukOffsetHours, ukParts} from './time.ts'

const RESULTS_HTML = `
<div class="match-list match-list-results"><div class="match-items md:container">
  <h2 class="match-list-sub-heading">September</h2>
  <div class="match-card">
    <div class="match-details">
      <img class="logo" alt="FA Trophy">
      <span class="match-date">Sat 26 September</span>
      <span class="match-venue-name">Connect Management Stadium</span>
    </div>
    <div class="match-clubs">
      <div class="match-club match-club-home"><img class="logo club-logo" alt="Eastbourne Borough">
        <div class="match-club-inner"><span class="match-club-name">Eastbourne Boro</span></div>
        <span class="match-club-score">4</span></div>
      <div class="match-club match-club-away"><img class="logo club-logo" alt="Welwyn Garden City">
        <div class="match-club-inner"><span class="match-club-name">Welwyn Garden City</span></div>
        <span class="match-club-score">2</span></div>
      <div class="match-state"><span class="match-score">4-2</span></div>
    </div>
    <div class="match-actions">
      <a class="btn btn-sm btn-outline" href="https://ebfc.co.uk/matches/2026-27/8401/eastbourne-boro-vs-welwyn-garden-city/?utm=x">Match Centre</a>
      <a class="btn btn-sm btn-secondary" href="https://ebfc.co.uk/2026/09/report-eastbourne-4-welwyn-garden-city-2/">Report</a>
    </div>
  </div>
  <div class="match-card">
    <div class="match-details">
      <span class="match-competition">FA Cup Second Qualifying Round</span>
      <span class="match-date">Sat 19 September</span>
      <span class="match-venue-name">Connect Management Stadium</span>
    </div>
    <div class="match-clubs">
      <div class="match-club match-club-home"><div class="match-club-inner"><span class="match-club-name">Eastbourne Boro</span></div>
        <span class="match-club-score">0</span></div>
      <div class="match-club match-club-away"><div class="match-club-inner"><span class="match-club-name">Windsor &amp; Eton</span></div>
        <span class="match-club-score">1</span></div>
    </div>
    <div class="match-actions"><a class="btn" href="/matches/2026-27/8297/eastbourne-boro-vs-windsor-eton/">Match Centre</a></div>
  </div>
</div></div>`

const FIXTURES_HTML = `
<div class="match-card">
  <div class="match-details">
    <img class="logo" alt="Sussex Transport Senior Challenge Cup">
    <span class="match-date">Tue 29 September</span>
    <span class="match-venue-name">Connect Management Stadium</span>
  </div>
  <div class="match-clubs">
    <div class="match-club match-club-home"><div class="match-club-inner"><span class="match-club-name">Eastbourne Boro</span></div></div>
    <div class="match-club match-club-away"><div class="match-club-inner"><span class="match-club-name">Little Common</span></div></div>
    <div class="match-state"><span class="match-ko">19:45</span></div>
  </div>
  <div class="match-actions"><a class="btn" href="https://ebfc.co.uk/matches/2026-27/8413/eastbourne-boro-vs-little-common/">Match Centre</a></div>
</div>
<div class="match-card">
  <div class="match-details">
    <img class="logo" alt="Pitching In Isthmian League Premier Division">
    <span class="match-date">Sat 2 January</span>
    <span class="match-venue-name">Meadow View</span>
  </div>
  <div class="match-clubs">
    <div class="match-club match-club-home"><div class="match-club-inner"><span class="match-club-name">Welling United</span></div></div>
    <div class="match-club match-club-away"><div class="match-club-inner"><span class="match-club-name">Eastbourne Boro</span></div></div>
    <div class="match-state"><span class="match-ko">15:00</span></div>
  </div>
  <div class="match-actions"><a class="btn" href="https://ebfc.co.uk/matches/2026-27/8500/welling-united-vs-eastbourne-boro/">Match Centre</a></div>
</div>`

const TABLE_HTML = `
<table>
  <tr><th class="standings-number standings-pos">Pos</th><th></th><th class="standings-number standings-pld">Pld</th><th>W</th></tr>
  <tr><td class="standings-number standings-pos">1</td><td class="standings-logo"></td><td class="standings-club-name">Enfield Town</td>
    <td class="standings-pld standings-number">8</td><td class="standings-w standings-number">6</td><td class="standings-d standings-number">0</td>
    <td class="standings-l standings-number">2</td><td class="standings-f standings-number">23</td><td class="standings-a standings-number">11</td>
    <td class="standings-gd standings-number">12</td><td class="standings-pts standings-number">18</td><td class="standings-form"></td></tr>
  <tr><td class="standings-number standings-pos">2</td><td class="standings-logo"></td><td class="standings-club-name">Welling United</td>
    <td class="standings-pld standings-number">8</td><td class="standings-w standings-number">6</td><td class="standings-d standings-number">0</td>
    <td class="standings-l standings-number">2</td><td class="standings-f standings-number">15</td><td class="standings-a standings-number">9</td>
    <td class="standings-gd standings-number">6</td><td class="standings-pts standings-number">18</td><td class="standings-form"></td></tr>
  <tr><td class="standings-number standings-pos">10</td><td class="standings-logo"></td><td class="standings-club-name">Eastbourne Borough</td>
    <td class="standings-pld standings-number">8</td><td class="standings-w standings-number">4</td><td class="standings-d standings-number">1</td>
    <td class="standings-l standings-number">3</td><td class="standings-f standings-number">12</td><td class="standings-a standings-number">13</td>
    <td class="standings-gd standings-number">-1</td><td class="standings-pts standings-number">13</td><td class="standings-form"></td></tr>
</table>`

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><title>Eastbourne Borough FC</title>
  <item>
    <title>Report: Eastbourne 4 Welwyn Garden City 2</title>
    <link>https://ebfc.co.uk/2026/09/report-eastbourne-4-welwyn-garden-city-2/</link>
    <dc:creator><![CDATA[EBFC]]></dc:creator>
    <pubDate>Sat, 26 Sep 2026 18:02:11 +0000</pubDate>
    <category><![CDATA[Match Report]]></category>
    <guid isPermaLink="false">https://ebfc.co.uk/?p=12345</guid>
    <description><![CDATA[Borough book their place in the First Round]]></description>
  </item>
  <item>
    <title>Borough&#8217;s new signing</title>
    <link>https://ebfc.co.uk/2026/09/new-signing/</link>
    <pubDate>Fri, 25 Sep 2026 10:00:00 +0000</pubDate>
    <category><![CDATA[Club News]]></category>
    <category><![CDATA[Transfers]]></category>
    <guid isPermaLink="false">https://ebfc.co.uk/?p=12340</guid>
  </item>
</channel></rss>`

test('parses results', () => {
  const ms = parseMatches(RESULTS_HTML)
  assert.equal(ms.length, 2)
  const [a, b] = ms
  assert.equal(a!.id, '8401')
  assert.equal(a!.url, 'https://ebfc.co.uk/matches/2026-27/8401/eastbourne-boro-vs-welwyn-garden-city/')
  assert.equal(a!.competition, 'FA Trophy')
  assert.equal(a!.home, 'Eastbourne Boro')
  assert.equal(a!.away, 'Welwyn Garden City')
  assert.equal(a!.homeScore, 4)
  assert.equal(a!.awayScore, 2)
  assert.equal(a!.reportUrl, 'https://ebfc.co.uk/2026/09/report-eastbourne-4-welwyn-garden-city-2/')
  assert.equal(outcome(a!), 'W')
  assert.equal(b!.competition, 'FA Cup Second Qualifying Round')
  assert.equal(b!.away, 'Windsor & Eton')
  assert.equal(b!.url, 'https://ebfc.co.uk/matches/2026-27/8297/eastbourne-boro-vs-windsor-eton/')
  assert.equal(b!.reportUrl, undefined)
  assert.equal(outcome(b!), 'L')
})

test('parses fixtures with kick-off times and season years', () => {
  const ms = parseMatches(FIXTURES_HTML)
  assert.equal(ms.length, 2)
  assert.equal(isPlayed(ms[0]!), false)
  assert.equal(ms[0]!.competition, 'Sussex Transport Senior Challenge Cup')
  // 19:45 BST on 29 Sep 2026 = 18:45 UTC
  assert.equal(ms[0]!.kickoff?.toISOString(), '2026-09-29T18:45:00.000Z')
  // January belongs to the second year of the 2026-27 season; GMT so no shift.
  assert.equal(ms[1]!.kickoff?.toISOString(), '2027-01-02T15:00:00.000Z')
})

test('spots postponed fixtures', () => {
  const html = FIXTURES_HTML.replace('<span class="match-ko">19:45</span>', '<span class="match-ko">P - P</span>')
  const [m, n] = parseMatches(html)
  assert.equal(isOff(m!), true)
  assert.equal(isOff(n!), false)
})

test('parses the league table', () => {
  const rows = parseTable(TABLE_HTML)
  assert.equal(rows.length, 3)
  assert.deepEqual(rows[2], {
    pos: 10,
    team: 'Eastbourne Borough',
    played: 8,
    won: 4,
    drawn: 1,
    lost: 3,
    goalsFor: 12,
    goalsAgainst: 13,
    goalDiff: -1,
    points: 13,
  })
  assert.equal(findInTable(rows, 'Eastbourne Boro')?.pos, 10)
  assert.equal(findInTable(rows, 'Welling United')?.pos, 2)
  assert.equal(findInTable(rows, 'Little Common'), undefined)
})

test('parses the news feed', () => {
  const items = parseNewsFeed(RSS)
  assert.equal(items.length, 2)
  assert.equal(items[0]!.id, 'https://ebfc.co.uk/?p=12345')
  assert.deepEqual(items[0]!.categories, ['Match Report'])
  assert.equal(items[1]!.title, 'Borough’s new signing')
  assert.deepEqual(items[1]!.categories, ['Club News', 'Transfers'])
  assert.equal(items[1]!.published?.toISOString(), '2026-09-25T10:00:00.000Z')
})

test('decodes entities', () => {
  assert.equal(decodeEntities('Rock &amp; Roll &#8211; &#x2019;'), 'Rock & Roll – ’')
})

test('UK time helpers handle BST boundaries', () => {
  assert.equal(ukOffsetHours(new Date('2026-07-01T12:00:00Z')), 1)
  assert.equal(ukOffsetHours(new Date('2026-12-01T12:00:00Z')), 0)
  // 2026 clocks go back on Sunday 25 October at 01:00 UTC.
  assert.equal(ukOffsetHours(new Date('2026-10-25T00:59:00Z')), 1)
  assert.equal(ukOffsetHours(new Date('2026-10-25T01:00:00Z')), 0)
  const p = ukParts(new Date('2026-09-28T09:30:00Z'))
  assert.deepEqual([p.weekday, p.hour, p.minute], [1, 10, 30])
  assert.equal(ukIsoWeek(new Date('2026-09-28T09:30:00Z')), '2026-W40')
  assert.equal(kickoffToUtc('2026-27', 'nonsense', '15:00'), undefined)
})

test('formats posts', () => {
  const table = parseTable(TABLE_HTML)
  const [result] = parseMatches(RESULTS_HTML)
  const ft = resultDraft(result!, table)
  assert.equal(ft.title, 'FT: Eastbourne Boro 4-2 Welwyn Garden City | FA Trophy')
  assert.match(ft.text!, /\[Match report\]\(https:\/\/ebfc\.co\.uk\/2026\/09\/report/)

  const [, league] = parseMatches(FIXTURES_HTML)
  const pv = previewDraft(league!, table, parseMatches(RESULTS_HTML))
  assert.equal(
    pv.title,
    'Match Preview: Welling United vs Eastbourne Boro - Saturday 2 January, 15:00 KO | Pitching In Isthmian League Premier Division',
  )
  assert.match(pv.text!, /Borough's last 2:\*\* W L/)
  assert.match(pv.text!, /\*\*Eastbourne Boro:\*\* 10th, 13 pts/)
  assert.match(pv.text!, /\*\*Welling United:\*\* 2nd, 18 pts/)

  const tb = tableDraft(table, new Date('2026-09-28T09:30:00Z'))
  assert.equal(tb.title, 'League Table - Monday 28 September')
  assert.match(tb.text!, /\| \*\*10\*\* \| \*\*Eastbourne Borough\*\* \|/)
})
