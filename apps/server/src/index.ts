import { createHash, timingSafeEqual } from 'node:crypto'
import cors from '@fastify/cors'
import Fastify from 'fastify'
import { Server } from 'socket.io'
import type {
  ClientToServerEvents,
  Segment,
  SegmentedText,
  ServerToClientEvents,
  TextMeta,
} from '@wbac/shared'
import { config, warnOnInsecureDefaults } from './config.js'
import { query, queryOne } from './db.js'
import { migrate } from './migrate.js'
import { createRoom, getRoomByCode, verifyHostToken } from './rooms.js'
import { attachSockets, type SocketData } from './socket.js'

interface SegmentRow {
  id: string
  idx: number
  kind: Segment['kind']
  bo: string
  break_after: Segment['breakAfter']
  cite: string | null
  wylie: string | null
  en: string | null
  note: string | null
}

interface TextRow {
  id: string
  slug: string
  title_bo: string
  title_en: string | null
  source: TextMeta['source']
}

const toMeta = (row: TextRow): TextMeta => ({
  id: row.id,
  slug: row.slug,
  titleBo: row.title_bo,
  ...(row.title_en ? { titleEn: row.title_en } : {}),
  source: row.source,
})

const toSegment = (row: SegmentRow): Segment => ({
  id: row.id,
  idx: row.idx,
  kind: row.kind,
  bo: row.bo,
  breakAfter: row.break_after,
  ...(row.cite ? { cite: row.cite } : {}),
  ...(row.wylie ? { wylie: row.wylie } : {}),
  ...(row.en ? { en: row.en } : {}),
  ...(row.note ? { note: row.note } : {}),
})

/** Constant-time check of the shared room-creation secret. */
function verifyHostPassword(presented: unknown): boolean {
  if (typeof presented !== 'string') return false
  const a = createHash('sha256').update(presented).digest()
  const b = createHash('sha256').update(config.hostPassword).digest()
  return timingSafeEqual(a, b)
}

// pino-pretty is a development convenience and a real cost under load; in production
// the logger emits plain JSON for whatever collects it.
const app = Fastify({
  logger: config.isProduction ? true : { transport: { target: 'pino-pretty' } },
})

await app.register(cors, { origin: config.webOrigins })

/**
 * Check a recovery code before the client acts on it.
 *
 * Without this, a teacher restoring a room on a new device would be told they are
 * teaching, then have every tap silently refused — the failure would surface mid-class
 * rather than at the moment they can still do something about it.
 */
app.post<{ Params: { code: string }; Body: { hostToken?: string } }>(
  '/api/rooms/:code/verify-host',
  async (request, reply) => {
    const room = await getRoomByCode(request.params.code)
    if (!room) return reply.code(404).send({ error: 'No room with that code.' })
    if (!room.is_live) return reply.code(410).send({ error: 'That class has ended.' })
    if (!verifyHostToken(room, request.body?.hostToken)) {
      return reply.code(401).send({ error: 'That recovery code does not match this room.' })
    }
    return { ok: true, textSlug: room.text_slug }
  },
)

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>(app.server, {
  cors: { origin: config.webOrigins },
  // Prefer a real WebSocket. Long-polling stays as a fallback for restrictive networks,
  // but on it the teacher would see the highlight lag behind their own voice.
  transports: ['websocket', 'polling'],
})

app.get('/api/health', async () => ({ ok: true }))

app.get('/api/texts', async () => {
  const rows = await query<TextRow>(
    'select id, slug, title_bo, title_en, source from texts order by slug',
  )
  return rows.map(toMeta)
})

app.get<{ Params: { slug: string } }>('/api/texts/:slug', async (request, reply) => {
  const text = await queryOne<TextRow>(
    'select id, slug, title_bo, title_en, source from texts where slug = $1',
    [request.params.slug],
  )
  if (!text) return reply.code(404).send({ error: 'No such text.' })

  const segments = await query<SegmentRow>(
    `select id, idx, kind, bo, break_after, cite, wylie, en, note
     from segments where text_id = $1 order by idx`,
    [text.id],
  )
  return { meta: toMeta(text), segments: segments.map(toSegment) } satisfies SegmentedText
})

app.post<{ Body: { hostPassword?: string; textSlug?: string } }>(
  '/api/rooms',
  async (request, reply) => {
    const { hostPassword, textSlug } = request.body ?? {}
    if (!verifyHostPassword(hostPassword)) {
      return reply.code(401).send({ error: 'Wrong host password.' })
    }
    if (!textSlug) return reply.code(400).send({ error: 'textSlug is required.' })

    try {
      const { code, hostToken } = await createRoom(textSlug)
      // The token is returned exactly once. Only its hash is stored.
      return { code, hostToken, textSlug }
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Failed.' })
    }
  },
)

app.get<{ Params: { code: string } }>('/api/rooms/:code', async (request, reply) => {
  const room = await getRoomByCode(request.params.code)
  if (!room) return reply.code(404).send({ error: 'No room with that code.' })
  const sockets = await io.in(room.code).fetchSockets()
  return {
    code: room.code,
    textSlug: room.text_slug,
    currentSegmentId: room.current_segment_id,
    participantCount: sockets.length,
  }
})

attachSockets(io, (message) => app.log.info(message))

await migrate((message) => app.log.info(message))
warnOnInsecureDefaults((message) => app.log.warn(message))

// 0.0.0.0 so a phone on the same network can reach the dev server for real testing.
await app.listen({ port: config.port, host: '0.0.0.0' })
