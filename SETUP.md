# Setup (for the developer, not part of the app description)

The bot is a Reddit Devvit app. It runs on Reddit's servers, so no hosting, API keys or bot account are needed. Posts appear from the app's own account (u/ebfc-bot).

## One-time setup (Bazzite / any Linux)

1. **Node 24+.** Bazzite ships Homebrew: `brew install node`, then check `node -v` shows v24 or newer.
2. **Get the code:**
   ```sh
   git clone https://github.com/Elvpresidnte/ebfc-bot
   cd ebfc-bot
   npm install
   ```
3. **Log in to Devvit** with the Reddit account that moderates r/EastbourneBoroFC:
   ```sh
   npx devvit login
   ```
   If the browser hand-off doesn't come back to the terminal, use `npx devvit login --copy-paste`.
4. **Upload the app:**
   ```sh
   npm run upload
   ```
   The first upload registers the app name `ebfc-bot`. If that name is taken, change `"name"` in `devvit.json` to something else (3–20 lowercase letters, numbers or hyphens) and run it again. Uploading also submits `ebfc.co.uk` for fetch-domain review.
5. **Fill in the app details** at `https://developers.reddit.com/apps/ebfc-bot`. The Terms and Privacy links must be public URLs, so the repo needs to be public (or the two files hosted somewhere public).
6. **Wait for domain approval.** Approved domains show under *Developer Settings* on the app page. Reddit says 1–2 business days is typical. Until approval, the bot runs but can't read the site, so it posts nothing.
7. **Install it on the subreddit:**
   ```sh
   npm run install-app
   ```
   Uploaded, unreviewed builds can only be installed on communities with fewer than 200 members. If r/EastbourneBoroFC is bigger than that, run `npx devvit publish` first. It goes through Reddit's unlisted-app review, which takes about a week. Then install.
8. **First run:** on the subreddit, open the mod menu and choose **EBFC Bot: check for updates now**. The first run only records what's already on the site, so there's no backlog dump. From then on it posts anything new, checking every 30 minutes.

## Day to day

- Logs: `npm run logs`
- Change settings (post types, preview timing): the app's settings page for the subreddit, via the mod tools / installed apps screen.
- After changing code: `npm test`, then `npm run upload`, then `npm run install-app` to move the subreddit onto the new version.

## Code map

- `src/server/ebfc.ts`: fetches and parses the club website (RSS feed, fixtures, results, table).
- `src/server/bot.ts`: decides what's new, posts it, and remembers what's been posted (Redis).
- `src/server/format.ts`: post titles and bodies.
- `src/server/time.ts`: UK time zone handling (GMT/BST).
- `src/server/ebfc.test.ts`: tests for the parsers and formatting.
