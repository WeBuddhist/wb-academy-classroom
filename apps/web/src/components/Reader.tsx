import { useEffect, useRef } from 'react'
import type { Segment } from '@wbac/shared'

interface ReaderProps {
  segments: Segment[]
  currentSegmentId: string | null
  /** Whether this client holds the host token and may move the room. */
  canTeach: boolean
  follow: boolean
  onSelect: (segmentId: string) => void
}

export function Reader({ segments, currentSegmentId, canTeach, follow, onSelect }: ReaderProps) {
  const refs = useRef(new Map<string, HTMLDivElement>())

  useEffect(() => {
    if (!follow || !currentSegmentId) return
    refs.current.get(currentSegmentId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentSegmentId, follow])

  if (segments.length === 0) {
    return <p className="placeholder">Loading the text…</p>
  }

  return (
    <div className="reader" lang="bo">
      {segments.map((segment) => {
        const isCurrent = segment.id === currentSegmentId
        return (
          <div
            key={segment.id}
            ref={(node) => {
              if (node) refs.current.set(segment.id, node)
              else refs.current.delete(segment.id)
            }}
            data-segment-id={segment.id}
            className={[
              'segment',
              `kind-${segment.kind}`,
              segment.breakAfter === 'major' ? 'break-major' : '',
              isCurrent ? 'current' : '',
              canTeach ? 'teachable' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            {...(canTeach
              ? {
                  role: 'button',
                  tabIndex: 0,
                  onClick: () => onSelect(segment.id),
                  onKeyDown: (event: React.KeyboardEvent) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelect(segment.id)
                    }
                  },
                }
              : {})}
          >
            {segment.bo}
          </div>
        )
      })}
    </div>
  )
}
