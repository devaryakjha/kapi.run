import { describe, expect, it } from 'bun:test'

import { subscribeToRelaySession } from './relay-events.ts'

class FakeEventSource {
  listener: EventListener | null = null
  closed = false

  addEventListener(type: string, listener: EventListener) {
    if (type === 'record') this.listener = listener
  }

  emit(revision: string) {
    this.listener?.({ lastEventId: revision } as MessageEvent<string>)
  }

  close() {
    this.closed = true
  }
}

describe('relay session events', () => {
  it('subscribes with credentials and emits only newer record revisions', () => {
    const source = new FakeEventSource()
    const revisions: string[] = []
    let request: { url: string; options: EventSourceInit } | null = null

    const close = subscribeToRelaySession(
      'session/one',
      'revision-1',
      (revision) => revisions.push(revision),
      (url, options) => {
        request = { url, options }
        return source
      },
    )

    expect(request).toEqual({
      url: '/relay/sessions/session%2Fone/events',
      options: { withCredentials: true },
    })
    source.emit('revision-1')
    source.emit('revision-2')
    source.emit('revision-2')
    source.emit('')
    expect(revisions).toEqual(['revision-2'])

    close()
    expect(source.closed).toBe(true)
    source.emit('revision-3')
    expect(revisions).toEqual(['revision-2'])
  })
})
