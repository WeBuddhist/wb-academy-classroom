import { useEffect, useState } from 'react'
import type { TextMeta } from '@wbac/shared'
import { ROOM_CODE_LENGTH } from '@wbac/shared'
import { createRoom, listTexts, rememberHostToken, verifyHost } from '../api.js'

interface JoinScreenProps {
  initialCode?: string
  onEnter: (code: string, displayName: string) => void
}

type Mode = 'join' | 'start' | 'resume' | 'created'

/**
 * One screen, one action. A student arrives with a code and should need nothing else;
 * the teacher's path is a quiet link underneath, because there is one teacher and
 * thirty students.
 */
export function JoinScreen({ initialCode = '', onEnter }: JoinScreenProps) {
  const [mode, setMode] = useState<Mode>('join')
  const [code, setCode] = useState(initialCode)
  const [texts, setTexts] = useState<TextMeta[]>([])
  const [textSlug, setTextSlug] = useState('')
  const [hostPassword, setHostPassword] = useState('')
  const [resumeCode, setResumeCode] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [created, setCreated] = useState<{ code: string; hostToken: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (mode !== 'start') return
    listTexts()
      .then((available) => {
        setTexts(available)
        setTextSlug((current) => current || (available[0]?.slug ?? ''))
      })
      .catch(() => setError('Cannot reach the classroom server.'))
  }, [mode])

  const go = (next: Mode) => {
    setMode(next)
    setError(null)
  }

  const join = (value: string) => {
    const clean = value.trim().toUpperCase()
    if (clean.length === ROOM_CODE_LENGTH) onEnter(clean, 'Student')
  }

  const start = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const room = await createRoom(hostPassword, textSlug)
      rememberHostToken(room.code, room.hostToken)
      setCreated({ code: room.code, hostToken: room.hostToken })
      setMode('created')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start the class.')
    } finally {
      setBusy(false)
    }
  }

  const resume = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const roomCode = resumeCode.trim().toUpperCase()
    try {
      // Checked against the server before it is trusted, so a wrong code fails here
      // rather than as silently refused taps once the class has started.
      await verifyHost(roomCode, recoveryCode.trim())
      rememberHostToken(roomCode, recoveryCode.trim())
      onEnter(roomCode, 'Teacher')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not restore control.')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'created' && created) {
    return (
      <main className="entry">
        <p className="wordmark">WeBuddhist Academy</p>
        <h1>Your class is ready</h1>
        <p className="sub">Write this code on the board.</p>
        <p className="big-code">{created.code}</p>

        <div className="recovery">
          <p className="label">Recovery code</p>
          <code>{created.hostToken}</code>
          <p className="help">
            Shown once. If this browser forgets the room, or you switch device, this is what
            gets you back in control.
          </p>
        </div>

        <div className="stack" style={{ marginTop: '2rem' }}>
          <button className="btn btn-primary" onClick={() => onEnter(created.code, 'Teacher')}>
            Open the text
          </button>
        </div>
      </main>
    )
  }

  if (mode === 'start') {
    return (
      <main className="entry">
        <button className="link back" onClick={() => go('join')}>
          ← Back
        </button>
        <h1>Start a class</h1>
        <p className="sub">Students will join with the code you get next.</p>

        <form onSubmit={start} className="stack">
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
              autoComplete="current-password"
            />
          </label>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy || !textSlug || !hostPassword}
          >
            {busy ? 'Starting…' : 'Start'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>

        <p className="switch">
          Already running a class?{' '}
          <button className="link" onClick={() => go('resume')}>
            Take back control
          </button>
        </p>
      </main>
    )
  }

  if (mode === 'resume') {
    return (
      <main className="entry">
        <button className="link back" onClick={() => go('start')}>
          ← Back
        </button>
        <h1>Take back control</h1>
        <p className="sub">Use the recovery code you were shown when the class was created.</p>

        <form onSubmit={resume} className="stack">
          <label className="field">
            <span>Room code</span>
            <input
              value={resumeCode}
              onChange={(e) => setResumeCode(e.target.value.toUpperCase())}
              placeholder="ABC234"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={ROOM_CODE_LENGTH}
            />
          </label>
          <label className="field">
            <span>Recovery code</span>
            <input
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy || !resumeCode.trim() || !recoveryCode.trim()}
          >
            {busy ? 'Checking…' : 'Resume teaching'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    )
  }

  return (
    <main className="entry">
      <p className="wordmark">WeBuddhist Academy</p>
      <h1>Enter the code on the board</h1>
      <p className="sub">Your screen will follow the teacher's.</p>

      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault()
          join(code)
        }}
      >
        <input
          className="code-input"
          value={code}
          onChange={(e) => {
            const next = e.target.value.toUpperCase().slice(0, ROOM_CODE_LENGTH)
            setCode(next)
            // Six characters is a complete code, so go — the same way a verification
            // code submits itself once it is full.
            if (next.length === ROOM_CODE_LENGTH) join(next)
          }}
          placeholder="ABC234"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={ROOM_CODE_LENGTH}
          aria-label="Room code"
          autoFocus
        />
        <button
          className="btn btn-primary"
          type="submit"
          disabled={code.trim().length !== ROOM_CODE_LENGTH}
        >
          Join
        </button>
        {error && <p className="error">{error}</p>}
      </form>

      <p className="switch">
        Teaching?{' '}
        <button className="link" onClick={() => go('start')}>
          Start a class
        </button>
      </p>
    </main>
  )
}
