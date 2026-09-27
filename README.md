# EBFC Bot

A small helper app for **r/EastbourneBoroFC**, a fan community for Eastbourne Borough Football Club. It keeps the subreddit up to date with club news and first-team match information, so fans get it in one place without a moderator having to copy it over by hand.

## What it does

Every 30 minutes the app checks the club's official website and, when there's something new, makes a post in the subreddit from the app's own account:

- **Club news**: a link post with the article's headline, pointing to the full article on the club's website. The app never copies article text.
- **Full-time results**: a short post with the score, competition, venue and links to the club's match centre and match report, so fans can discuss the game.
- **Match previews**: posted before each first-team game (24 hours before by default). They show the kick-off time, the venue, Borough's recent form and, for league games, where both teams sit in the table.
- **League table**: once a week on Monday morning, and only if the table has changed since the last post.

It will never post more than 4 times in one check, and the first time it runs it just notes what's already on the website instead of posting a backlog.

## Settings for moderators

In the app's settings for the subreddit, moderators can switch each post type on or off, choose how many hours before kick-off the preview goes up, and choose whether "Match Report" news articles are skipped (the full-time post already links the report).

Two moderator menu actions are available from the subreddit menu:

- **EBFC Bot: check for updates now**: runs a check straight away.
- **EBFC Bot: post league table now**: posts the current table immediately.

## What it does not do

- It doesn't read, store or process anything about Reddit users.
- It doesn't comment, message anyone, or moderate content.
- It doesn't copy articles, photos, videos or logos from the club's website, only headlines, links, and factual match data (scores, fixtures and league standings).

## Fetch Domains

The following domains are requested for this app:

- `ebfc.co.uk`: the official website of Eastbourne Borough Football Club. The app reads four public pages: the club's public RSS news feed (`/feed/`), the men's first-team fixtures (`/fixtures/men/`), results (`/results/men/`) and league table (`/tables/men/`). This is the only official source for the club's news and match data. The site's robots.txt allows these pages to be read. Requests are light: four pages every 30 minutes.
- `www.ebfc.co.uk`: the same site under its `www` hostname, requested in case links or redirects use it.

## Terms and privacy

- [Terms of Service](TERMS.md)
- [Privacy Policy](PRIVACY.md)

This is an unofficial fan project. It is not affiliated with or endorsed by Eastbourne Borough Football Club.
