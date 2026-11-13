import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type {
  ClientToServerEvents,
  RoomState,
  Segment,
  ServerToClientEvents,
} from '@wbac/shared'
import { API_BASE, getText } from './api.js'

// Note the reversed order: what the server sends is what this client listens for.
type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export interface Room {
  connected: boolean
  state: RoomState | null
  segments: Segment[]
  error: string | null
  /** Ask the server to move the room. Rejected unless this client holds the host token. */
  goto: (segmentId: string) => void
}

export function useRoom(code: string, displayName: string, hostToken?: string): Room {
  const [connected, setConnected] = useState(false)
  const [state, setState] = useState<RoomState | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [error, setError] = useState<string | null>(null)
  const socketRef = useRef<ClientSocket | null>(null)

  useEffect(() => {
    const socket: ClientSocket = io(API_BASE, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    // Fires on first connect and again after every reconnect, so re-joining here is all
    // the resume logic this needs: the ack carries the room's authoritative state.
    const join = () => {
      socket.emit('room:join', { code, displayName }, (result) => {
        if (!result.ok) {
          setError(result.error)
          return
        }
        setError(null)
        setState(result.state)
      })
    }

    socket.on('connect', () => {
      setConnected(true)
      join()
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', () => setError('Cannot reach the classroom server.'))

    socket.on('teach:goto', ({ segmentId }) => {
      setState((previous) => (previous ? { ...previous, currentSegmentId: segmentId } : previous))
    })
    socket.on('presence', ({ count }) => {
      setState((previous) => (previous ? { ...previous, participantCount: count } : previous))
    })
    socket.on('room:closed', () => setError('The teacher ended this class.'))

    return () => {
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
    }
  }, [code, displayName])

  // The text is fetched once per room and does not change for the life of the class.
  const slug = state?.textSlug
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    getText(slug)
      .then((text) => {
        if (!cancelled) setSegments(text.segments)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load the text.')
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  const goto = useCallback(
    (segmentId: string) => {
      if (!hostToken) return
      socketRef.current?.emit('teach:goto', { segmentId, hostToken }, (result) => {
        if (!result.ok) setError(result.error)
      })
    },
    [hostToken],
  )

  return { connected, state, segments, error, goto }
}
