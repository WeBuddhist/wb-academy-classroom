import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@wbac/shared'
import { query, queryOne, withTransaction } from './db.js'

export interface RoomRow {
  id: string
  code: string
  text_id: string
  text_slug: string
  host_token_hash: string
  current_segment_id: string | null
  is_live: boolean
}

/**
 * A code the teacher writes on a whiteboard. `randomInt` is used rather than `Math.random`
 * so codes are not predictable from one another — a guessable code lets a stranger watch
 * a class.
 */
export function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]
  }
  return code
}

/** 96 bits, URL-safe, short enough for a teacher to copy somewhere safe. */
export function generateHostToken(): string {
  return randomBytes(12).toString('base64url')
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

const UNIQUE_VIOLATION = '23505'

export async function createRoom(
  textSlug: string,
): Promise<{ roomId: string; code: string; hostToken: string }> {
  const text = await queryOne<{ id: string }>('select id from texts where slug = $1', [textSlug])
  if (!text) throw new Error(`No text imported with slug "${textSlug}".`)

  const hostToken = generateHostToken()

  // Codes are short, so collisions are possible rather than merely theoretical. Let the
  // unique index be the arbiter and retry, instead of checking first and racing.
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRoomCode()
    try {
      const row = await queryOne<{ id: string }>(
        `insert into rooms (id, code, text_id, host_token_hash)
         values (gen_random_uuid()::text, $1, $2, $3)
         returning id`,
        [code, text.id, hashToken(hostToken)],
      )
      return { roomId: row!.id, code, hostToken }
    } catch (error) {
      const code_ = (error as { code?: string }).code
      if (code_ !== UNIQUE_VIOLATION) throw error
    }
  }
  throw new Error('Could not allocate an unused room code.')
}

export async function getRoomByCode(code: string): Promise<RoomRow | undefined> {
  return queryOne<RoomRow>(
    `select r.id, r.code, r.text_id, t.slug as text_slug, r.host_token_hash,
            r.current_segment_id, r.is_live
     from rooms r join texts t on t.id = r.text_id
     where r.code = $1`,
    [code.toUpperCase()],
  )
}

/**
 * Constant-time comparison of the presented token against the stored hash.
 *
 * This is the actual authority boundary for driving a class. The teacher-only controls
 * in the client are a convenience; this is what stops a student moving the room.
 */
export function verifyHostToken(room: RoomRow, token: string | undefined): boolean {
  if (!token) return false
  const presented = Buffer.from(hashToken(token), 'hex')
  const stored = Buffer.from(room.host_token_hash, 'hex')
  if (presented.length !== stored.length) return false
  return timingSafeEqual(presented, stored)
}

/**
 * Move the room to a segment, recording it in the log.
 *
 * Returns false if the segment does not belong to this room's text — which would
 * otherwise surface as a foreign-key error mid-class.
 */
export async function setCurrentSegment(room: RoomRow, segmentId: string): Promise<boolean> {
  const segment = await queryOne<{ id: string }>(
    'select id from segments where text_id = $1 and id = $2',
    [room.text_id, segmentId],
  )
  if (!segment) return false

  await withTransaction(async (client) => {
    await client.query('update rooms set current_segment_id = $1 where id = $2', [
      segmentId,
      room.id,
    ])
    await client.query('insert into room_log (room_id, segment_id) values ($1, $2)', [
      room.id,
      segmentId,
    ])
  })
  return true
}

export async function listTextSlugs(): Promise<string[]> {
  const rows = await query<{ slug: string }>('select slug from texts order by slug')
  return rows.map((row) => row.slug)
}
