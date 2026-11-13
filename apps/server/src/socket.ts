import type { Server, Socket } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '@wbac/shared'
import { getRoomByCode, setCurrentSegment, verifyHostToken } from './rooms.js'

export interface SocketData {
  /** The room code this socket joined, so presence can be updated on disconnect. */
  code?: string
}

type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>
export type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>

async function broadcastPresence(io: AppServer, code: string): Promise<void> {
  const sockets = await io.in(code).fetchSockets()
  io.to(code).emit('presence', { count: sockets.length })
}

export function attachSockets(io: AppServer, log: (message: string) => void): void {
  io.on('connection', (socket: AppSocket) => {
    socket.on('room:join', async ({ code, displayName }, ack) => {
      try {
        const room = await getRoomByCode(code)
        if (!room) return ack({ ok: false, error: 'No room with that code.' })
        if (!room.is_live) return ack({ ok: false, error: 'That class has ended.' })

        await socket.join(room.code)
        socket.data.code = room.code

        const sockets = await io.in(room.code).fetchSockets()
        ack({
          ok: true,
          state: {
            code: room.code,
            textSlug: room.text_slug,
            currentSegmentId: room.current_segment_id,
            participantCount: sockets.length,
          },
        })
        await broadcastPresence(io, room.code)
        log(`${displayName || 'someone'} joined ${room.code} (${sockets.length} present)`)
      } catch (error) {
        log(`room:join failed: ${String(error)}`)
        ack({ ok: false, error: 'Could not join the room.' })
      }
    })

    socket.on('teach:goto', async ({ segmentId, hostToken }, ack) => {
      try {
        const code = socket.data.code
        if (!code) return ack({ ok: false, error: 'Join a room first.' })

        const room = await getRoomByCode(code)
        if (!room) return ack({ ok: false, error: 'No room with that code.' })

        // The authority check. A student can emit this event; it gets no further.
        if (!verifyHostToken(room, hostToken)) {
          return ack({ ok: false, error: 'Not the host of this room.' })
        }

        const moved = await setCurrentSegment(room, segmentId)
        if (!moved) return ack({ ok: false, error: 'That segment is not part of this text.' })

        // Broadcast to everyone including the sender, so the teacher's own view is
        // driven by the same path as the students' and cannot silently diverge.
        io.to(room.code).emit('teach:goto', { segmentId })
        ack({ ok: true })
      } catch (error) {
        log(`teach:goto failed: ${String(error)}`)
        ack({ ok: false, error: 'Could not move the room.' })
      }
    })

    socket.on('disconnect', () => {
      const code = socket.data.code
      if (code) void broadcastPresence(io, code)
    })
  })
}
