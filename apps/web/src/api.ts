import type { SegmentedText, TextMeta } from '@wbac/shared'

export const API_BASE: string = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'

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
