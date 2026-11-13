import { useEffect, useState } from 'react'
import type { TextMeta } from '@wbac/shared'
import { createRoom, listTexts, rememberHostToken } from '../api.js'

interface JoinScreenProps {
  initialCode?: string
  onEnter: (code: string, displayName: string) => void
}

export function JoinScreen({ initialCode = '', onEnter }: JoinScreenProps) {
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState('')
  const [texts, setTexts] = useState<TextMeta[]>([])
  const [hostPassword, setHostPassword] = useState('')
  const [textSlug, setTextSlug] = useState('')
  const [created, setCreated] = useState<{ code: string; hostToken: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listTexts()
      .then((available) => {
        setTexts(available)
        setTextSlug((current) => current || (available[0]?.slug ?? ''))
      })
      .catch(() => setError('Cannot reach the classroom server.'))
  }, [])

  const start = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const room = await createRoom(hostPassword, textSlug)
      rememberHostToken(room.code, room.hostToken)
      setCreated({ code: room.code, hostToken: room.hostToken })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start the class.')
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <div className="panel">
        <h2>Class ready</h2>
        <p className="lede">Write this code on the board:</p>
        <p className="room-code">{created.code}</p>
        <label className="field">
          <span>
            Recovery code — keep this. It is shown once, and it is what lets you take back
            control if this browser forgets the room.
          </span>
          <input readOnly value={created.hostToken} onFocus={(e) => e.currentTarget.select()} />
        </label>
        <label className="field">
          <span>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Teacher" />
        </label>
        <button className="primary" onClick={() => onEnter(created.code, name || 'Teacher')}>
          Open the text
        </button>
      </div>
    )
  }

  return (
    <div className="panels">
      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault()
          if (code.trim()) onEnter(code.trim().toUpperCase(), name.trim() || 'Student')
        }}
      >
        <h2>Join a class</h2>
        <label className="field">
          <span>Room code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC234"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={6}
          />
        </label>
        <label className="field">
          <span>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
        </label>
        <button className="primary" type="submit" disabled={code.trim().length === 0}>
          Join
        </button>
      </form>

      <form className="panel secondary" onSubmit={start}>
        <h2>Start a class</h2>
        <label className="field">
          <span>Text</span>
          <select value={textSlug} onChange={(e) => setTextSlug(e.target.value)}>
            {texts.length === 0 && <option value="">No texts imported yet</option>}
            {texts.map((text) => (
              <option key={text.slug} value={text.slug}>
                {text.titleEn ?? text.titleBo}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Host password</span>
          <input
            type="password"
            value={hostPassword}
            onChange={(e) => setHostPassword(e.target.value)}
            autoComplete="off"
          />
        </label>
        <button type="submit" disabled={busy || !textSlug || !hostPassword}>
          {busy ? 'Starting…' : 'Start'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
    </div>
  )
}
