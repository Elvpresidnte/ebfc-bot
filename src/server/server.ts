import {once} from 'node:events'
import type {IncomingMessage, ServerResponse} from 'node:http'
import type {TaskResponse} from '@devvit/web/server'
import type {UiResponse} from '@devvit/web/shared'
import {postTableNow, type RunSummary, runBot} from './bot.ts'

type Json = Record<string, unknown>

export async function onReq(req: IncomingMessage, rsp: ServerResponse): Promise<void> {
  try {
    await drain(req)
    const path = (req.url ?? '').split('?')[0]
    if (req.method !== 'POST') return writeJson(404, {error: 'not found'}, rsp)

    switch (path) {
      case '/internal/scheduler/tick': {
        const summary = await runBot()
        logSummary('scheduled run', summary)
        return writeJson<TaskResponse>(200, {}, rsp)
      }
      case '/internal/menu/run-now': {
        const summary = await runBot()
        logSummary('manual run', summary)
        return writeJson<UiResponse>(200, {showToast: toastFor(summary)}, rsp)
      }
      case '/internal/menu/post-table': {
        try {
          const title = await postTableNow()
          return writeJson<UiResponse>(
            200,
            {showToast: {text: `Posted: ${title}`, appearance: 'success'}},
            rsp,
          )
        } catch (err) {
          console.error(err)
          const msg = err instanceof Error ? err.message : String(err)
          return writeJson<UiResponse>(200, {showToast: `Table post failed: ${msg}`}, rsp)
        }
      }
      default:
        return writeJson(404, {error: 'not found'}, rsp)
    }
  } catch (err) {
    const msg = `server error; ${err instanceof Error ? err.stack : err}`
    console.error(msg)
    writeJson(500, {error: msg}, rsp)
  }
}

function logSummary(label: string, s: RunSummary): void {
  console.log(
    `${label}: seeded=${s.seeded} posted=${s.posted.length}` +
      (s.posted.length ? ` [${s.posted.join(' || ')}]` : '') +
      (s.errors.length ? ` errors=[${s.errors.join(' || ')}]` : ''),
  )
}

function toastFor(s: RunSummary): UiResponse['showToast'] {
  if (s.seeded) {
    return {
      text: 'First run: remembered what is already on ebfc.co.uk. New items will be posted from now on.',
      appearance: 'success',
    }
  }
  if (s.errors.length && !s.posted.length) return `Nothing posted. Problem: ${s.errors[0]}`
  if (!s.posted.length) return 'All up to date - nothing new to post.'
  return {text: `Posted ${s.posted.length}: ${s.posted.join(' / ')}`.slice(0, 250), appearance: 'success'}
}

async function drain(req: IncomingMessage): Promise<void> {
  // The request body isn't needed for any route; consume it so the socket frees up.
  req.resume()
  if (!req.readableEnded) await once(req, 'end')
}

function writeJson<T extends Json | object>(status: number, json: T, rsp: ServerResponse): void {
  const body = JSON.stringify(json)
  rsp.writeHead(status, {
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json',
  })
  rsp.end(body)
}
