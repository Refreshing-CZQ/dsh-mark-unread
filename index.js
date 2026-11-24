/**
 * Host half of the mark-unread bundle.
 *
 * The unread marks are personal UI state, not Session data, so they cannot ride
 * the session log. The Host owns them in one small JSON file and serves them to
 * the browser half on a private same-origin route: the Web GUI is bound to a
 * loopback address and gets an OS-assigned port, so a browser-only store
 * (localStorage) would be lost on every restart while this file survives.
 *
 * Route contract (`/_dsh/mark-unread`):
 *   GET  -> { unread: string[] }
 *   POST { sessionId, unread } -> { unread: string[] }
 *   the POST carries the private `x-dsh-mark-unread` header, so a cross-site
 *   form or a simple no-preflight request cannot write here.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const ROUTE_PATH = '/_dsh/mark-unread'
const SENTINEL_HEADER = 'x-dsh-mark-unread'
const MAX_IDS = 400
const MAX_BODY_BYTES = 8192

export const inject = ['webServer']

/** Directory owned by this bundle: the profile directory, or the shared default home. */
function stateFile() {
  const profile = process.env.DSH_PROFILE_DIR
  const base = profile !== undefined && profile !== '' ? profile : join(homedir(), '.dsh')
  return join(base, 'mark-unread', 'state.json')
}

/** Read the stored ids; a missing or unreadable file is simply "nothing is unread". */
function readIds() {
  try {
    const parsed = JSON.parse(readFileSync(stateFile(), 'utf8'))
    const list = Array.isArray(parsed?.unread) ? parsed.unread : []
    return list.filter((id) => typeof id === 'string' && id !== '').slice(-MAX_IDS)
  } catch {
    return []
  }
}

/** Atomically replace the stored ids so an interrupted write cannot truncate the file. */
function writeIds(ids) {
  const file = stateFile()
  mkdirSync(dirname(file), { recursive: true })
  const scratch = `${file}.writing`
  writeFileSync(scratch, JSON.stringify({ version: 1, unread: ids }, null, 2), 'utf8')
  renameSync(scratch, file)
}

/** Answer one JSON response. */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/** Buffer one small request body. */
async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('body too large')
    chunks.push(chunk)
  }
  if (size === 0) return undefined
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function apply(ctx) {
  const handler = async (req, res) => {
    try {
      if (req.method === 'GET') {
        sendJson(res, 200, { unread: readIds() })
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method not allowed' })
        return
      }
      if (req.headers[SENTINEL_HEADER] !== '1') {
        sendJson(res, 403, { error: 'missing plugin header' })
        return
      }
      const body = await readJsonBody(req)
      const sessionId = body?.sessionId
      const unread = body?.unread
      if (typeof sessionId !== 'string' || sessionId === '' || sessionId.length > 128) {
        sendJson(res, 400, { error: 'invalid sessionId' })
        return
      }
      if (typeof unread !== 'boolean') {
        sendJson(res, 400, { error: 'invalid unread flag' })
        return
      }
      const current = readIds().filter((id) => id !== sessionId)
      if (unread) current.push(sessionId)
      writeIds(current.slice(-MAX_IDS))
      sendJson(res, 200, { unread: readIds() })
    } catch (error) {
      ctx.logger?.warn?.(error instanceof Error ? error : new Error(String(error)))
      if (!res.headersSent) sendJson(res, 400, { error: 'bad request' })
      else res.destroy()
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: ROUTE_PATH, handler }))
}
