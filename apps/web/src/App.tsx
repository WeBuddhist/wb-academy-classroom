import { useState } from 'react'
import { recallHostToken } from './api.js'
import { JoinScreen } from './components/JoinScreen.js'
import { Reader } from './components/Reader.js'
import { useRoom } from './useRoom.js'

interface Session {
  code: string
  displayName: string
}

export function App() {
  const initialCode = new URLSearchParams(window.location.search).get('room') ?? ''
  const [session, setSession] = useState<Session | null>(null)

  if (!session) {
    return (
      <main className="shell centred">
        <header className="masthead">
          <h1>WB Academy Classroom</h1>
        </header>
        <JoinScreen
          initialCode={initialCode.toUpperCase()}
          onEnter={(code, displayName) => setSession({ code, displayName })}
        />
      </main>
    )
  }

  return <Classroom session={session} onLeave={() => setSession(null)} />
}

function Classroom({ session, onLeave }: { session: Session; onLeave: () => void }) {
  // Holding the token is what makes this client a teacher. It is checked again on the
  // server for every move; this only decides what the interface offers.
  const hostToken = recallHostToken(session.code)
  const [follow, setFollow] = useState(true)
  const [confirmingEnd, setConfirmingEnd] = useState(false)
  const { connected, state, segments, error, closed, joinRejected, goto, endClass } = useRoom(
    session.code,
    session.displayName,
    hostToken,
  )

  if (closed || joinRejected) {
    return (
      <main className="shell centred">
        <div className="panel">
          <h2>{closed ? 'This class has ended' : 'Could not join'}</h2>
          <p className="lede">
            {closed
              ? hostToken
                ? 'You ended the class. The room code no longer accepts anyone.'
                : 'The teacher ended the class.'
              : (error ?? 'That room is not available.')}
          </p>
          <button className="primary" onClick={onLeave}>
            Back
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="shell">
      <header className="bar">
        <button className="link" onClick={onLeave}>
          ← Leave
        </button>
        <span className="code-chip">{session.code}</span>
        {hostToken && <span className="role">Teaching</span>}
        <span className={connected ? 'status ok' : 'status off'}>
          {connected ? `${state?.participantCount ?? 1} here` : 'Reconnecting…'}
        </span>
        <label className="follow">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          Follow
        </label>
        {hostToken &&
          // Two steps, because ending a class turns off everyone's screen at once and
          // the button sits next to controls the teacher uses constantly.
          (confirmingEnd ? (
            <span className="confirm">
              <button className="danger" onClick={endClass}>
                End for everyone
              </button>
              <button className="link" onClick={() => setConfirmingEnd(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button className="link" onClick={() => setConfirmingEnd(true)}>
              End class
            </button>
          ))}
      </header>

      {error && <p className="error">{error}</p>}
      {hostToken && segments.length > 0 && (
        <p className="hint">Tap a line to move everyone to it.</p>
      )}

      <Reader
        segments={segments}
        currentSegmentId={state?.currentSegmentId ?? null}
        canTeach={Boolean(hostToken)}
        follow={follow}
        onSelect={goto}
      />
    </main>
  )
}
