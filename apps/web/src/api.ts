import type { SegmentedText, TextMeta } from '@wbac/shared'

/**
 * Where the API lives.
 *
 * In development the client (5173) and server (3000) are different origins, so this is
 * absolute. In production Caddy serves the client and proxies `/api` and `/socket.io` to
 * the server, so everything is same-origin and this is built as an empty string —
 * meaning requests go to whatever host the page was loaded from. That is what lets the
 * same build work on a laptop, a phone on the classroom LAN, and the real domain.
 */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Request failed (${response.status}).`)
  }
  return response.json() as Promise<T>
}

export const listTexts = () => request<TextMeta[]>('/api/texts')

export const getText = (slug: string) => request<SegmentedText>(`/api/texts/${slug}`)

/**
 * Check a recovery code against a room before relying on it, so a mismatch surfaces
 * while the teacher can still do something about it rather than mid-class.
 */
export const verifyHost = (code: string, hostToken: string) =>
  request<{ ok: true; textSlug: string }>(`/api/rooms/${code}/verify-host`, {
    method: 'POST',
    body: JSON.stringify({ hostToken }),
  })

export const createRoom = (hostPassword: string, textSlug: string) =>
  request<{ code: string; hostToken: string; textSlug: string }>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ hostPassword, textSlug }),
  })

// ---------------------------------------------------------------------------
// Host token storage
// ---------------------------------------------------------------------------

/**
 * The host token is shown once by the server and kept here. Anyone holding it can drive
 * the room, so it stays in this browser and is never put in the URL, where it would end
 * up in history and in anything the teacher shares.
 */
const hostKey = (code: string) => `wbac:host:${code.toUpperCase()}`

export function rememberHostToken(code: string, token: string): void {
  try {
    localStorage.setItem(hostKey(code), token)
  } catch {
    // Private browsing or blocked storage. The teacher keeps the recovery code instead.
  }
}

export function recallHostToken(code: string): string | undefined {
  try {
    return localStorage.getItem(hostKey(code)) ?? undefined
  } catch {
    return undefined
  }
}
