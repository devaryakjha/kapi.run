import { API_URL } from './api.ts'

type RelayEventSource = {
  addEventListener(type: string, listener: EventListener): void
  close(): void
}

type RelayEventSourceFactory = (
  url: string,
  options: EventSourceInit,
) => RelayEventSource

function defaultEventSourceFactory(url: string, options: EventSourceInit) {
  return new EventSource(url, options)
}

export function subscribeToRelaySession(
  sessionId: string,
  afterRevision: string | null,
  onRevision: (revision: string) => void,
  createEventSource: RelayEventSourceFactory = defaultEventSourceFactory,
) {
  let currentRevision = afterRevision
  let closed = false
  const source = createEventSource(
    `${API_URL}/relay/sessions/${encodeURIComponent(sessionId)}/events`,
    { withCredentials: true },
  )

  source.addEventListener('record', ((event: MessageEvent<string>) => {
    if (closed) return
    const revision = event.lastEventId.trim()
    if (!revision || revision === currentRevision) return
    currentRevision = revision
    onRevision(revision)
  }) as EventListener)

  return () => {
    closed = true
    source.close()
  }
}
