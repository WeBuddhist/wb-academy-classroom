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
      <JoinScreen
        initialCode={initialCode.toUpperCase()}
        onEnter={(code, displayName) => setSession({ code, displayName })}
      />
    )
  }

  return <Classroom session={session} onLeave={() => setSession(null)} />
}

function Classroom({ session, onLeave }: { session: Session; onLeave: () => void }) {
  // Holding the token is what makes this client a teacher. It is checked again on the
  // server for every move; this only decides what the interface offers.
  const hostToken = recallHostToken(session.code)
  const teaching = Boolean(hostToken)
  const [follow, setFollow] = useState(true)
  const [confirmingEnd, setConfirmingEnd] = useState(false)
  const { connected, state, segments, error, closed, joinRejected, goto, endClass } = useRoom(
    session.code,
    session.displayName,
    hostToken,
  )

  if (closed || joinRejected) {
    return (
      <main className="notice">
        <h1>{closed ? 'This class has ended' : 'Could not join'}</h1>
        <p>
          {closed
            ? teaching
              ? 'You ended the class. The room code no longer accepts anyone.'
              : 'The teacher ended the class.'
            : (error ?? 'That room is not available.')}
        </p>
        <button className="btn btn-secondary" onClick={onLeave}>
          Back
        </button>
      </main>
    )
  }

  const count = state?.participantCount ?? 1

  return (
    <main className="room">
      <header className={teaching ? 'topbar teaching' : 'topbar'}>
        <button className="link leave" onClick={onLeave} aria-label="Leave the class">
          ←
        </button>
        <span className="code">{session.code}</span>
        <span className={connected ? 'meta' : 'meta off'}>
          {connected ? (
            <>
              {count} {count === 1 ? 'person' : 'people'}
              {teaching && <span className="teaching-label"> · teaching</span>}
            </>
          ) : (
            'Reconnecting…'
          )}
        </span>
        <span className="spacer" />
        <button
          className="pill"
          aria-pressed={follow}
          onClick={() => setFollow((value) => !value)}
          title={follow ? 'Your screen follows the teacher' : 'Scroll freely'}
        >
          <span className="dot" />
          {follow ? 'Following' : 'Follow'}
        </button>
      </header>

      {error && !joinRejected && <p className="error">{error}</p>}
      {teaching && segments.length > 0 && (
        <p className="teach-hint">Tap a line to bring everyone to it.</p>
      )}

      <Reader
        segments={segments}
        currentSegmentId={state?.currentSegmentId ?? null}
        canTeach={teaching}
        follow={follow}
        onSelect={goto}
      />

      {/* At the end of the document, not in the toolbar: ending a class blanks every
          screen at once, and it should not sit beside the controls the teacher uses
          all lesson. Two steps, for the same reason. */}
      {teaching && segments.length > 0 && (
        <footer className="end-class">
          {confirmingEnd ? (
            <span className="confirm">
              <button className="btn btn-danger" onClick={endClass}>
                End for everyone
              </button>
              <button className="link" onClick={() => setConfirmingEnd(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button className="link" onClick={() => setConfirmingEnd(true)}>
              End this class
            </button>
          )}
        </footer>
      )}
    </main>
  )
}
