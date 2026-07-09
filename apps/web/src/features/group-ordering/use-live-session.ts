import { useEffect, useRef } from 'react'
import type { RelaySessionRecord } from '@kapi/spec'

import type { LoadedSessionRecord } from './shared'
import { API_URL, loadSessionFromRecord } from './shared'

type LiveSessionOptions = {
  sessionId: string | undefined
  /** Skip applying updates while a local write is in flight. */
  pending: boolean
  getSessionKey: () => string
  getRelayUpdatedAt: () => string | null
  onLoaded: (loaded: LoadedSessionRecord) => void
  /** Fallback refresh used while the event stream is down. */
  onPoll: () => Promise<unknown>
}

const FALLBACK_POLL_MS = 60_000

/**
 * Keeps a session in sync with the relay: subscribes to the SSE stream
 * (`/relay/sessions/:id/events`) and falls back to slow polling whenever the
 * stream is not open. Records are deduped by `updatedAt`.
 */
export function useLiveSessionRecord(options: LiveSessionOptions) {
  const { sessionId } = options
  const optionsRef = useRef(options)

  useEffect(() => {
    optionsRef.current = options
  })

  useEffect(() => {
    if (!sessionId) return

    let closed = false
    let streamOpen = false
    const source = new EventSource(
      `${API_URL}/relay/sessions/${sessionId}/events`,
      { withCredentials: true },
    )

    const handleRecord = (event: MessageEvent<string>) => {
      const current = optionsRef.current
      if (current.pending) return
      const key = current.getSessionKey()
      if (!key) return
      let record: RelaySessionRecord
      try {
        record = JSON.parse(event.data) as RelaySessionRecord
      } catch {
        return
      }
      if (!record.ciphertext || !record.updatedAt) return
      if (record.updatedAt === current.getRelayUpdatedAt()) return
      loadSessionFromRecord(sessionId, record, key)
        .then((loaded) => {
          if (!closed && !optionsRef.current.pending) {
            optionsRef.current.onLoaded(loaded)
          }
        })
        .catch(() => {
          // Ignore records we cannot decrypt; the next poll or event retries.
        })
    }

    source.addEventListener('record', handleRecord as EventListener)
    source.addEventListener('open', () => {
      streamOpen = true
    })
    source.addEventListener('error', () => {
      streamOpen = false
    })
    source.addEventListener('gone', () => {
      streamOpen = false
      source.close()
    })

    const timer = window.setInterval(() => {
      if (streamOpen || document.hidden || optionsRef.current.pending) return
      optionsRef.current.onPoll().catch(() => {
        // Keep showing the last loaded session when a background poll fails.
      })
    }, FALLBACK_POLL_MS)

    return () => {
      closed = true
      window.clearInterval(timer)
      source.close()
    }
  }, [sessionId])
}
