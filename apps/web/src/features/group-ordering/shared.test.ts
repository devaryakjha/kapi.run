import type { KapiSession, SessionStatus } from '@kapi/spec'
import { describe, expect, it } from 'vitest'

import { isSessionLockedForParticipants } from './shared'

function session(status: SessionStatus, cutoffAt?: string): KapiSession {
  return {
    id: 'session-1',
    organiserName: 'Organiser',
    address: { id: 'address-1', label: 'Home', detail: 'Indiranagar' },
    restaurant: {
      id: 'restaurant-1',
      name: 'Cafe',
      area: 'Indiranagar',
      rating: 4.5,
      availabilityStatus: 'OPEN',
    },
    cutoffTime: '12:45 PM',
    cutoffAt,
    shareUrl: 'https://kapi.run/menu?session=session-1',
    status,
    participants: [],
    items: [],
    audit: [],
  }
}

describe('isSessionLockedForParticipants', () => {
  const now = new Date('2026-06-19T12:00:00.000Z')

  it('keeps an open session editable before cutoff', () => {
    expect(
      isSessionLockedForParticipants(
        session('open', '2026-06-19T12:01:00.000Z'),
        now,
      ),
    ).toBe(false)
  })

  it('locks an open session after cutoff', () => {
    expect(
      isSessionLockedForParticipants(
        session('open', '2026-06-19T11:59:00.000Z'),
        now,
      ),
    ).toBe(true)
  })

  it('locks a non-open session before cutoff', () => {
    expect(
      isSessionLockedForParticipants(
        session('locked', '2026-06-19T12:01:00.000Z'),
        now,
      ),
    ).toBe(true)
  })

  it('keeps an open session without cutoffAt editable', () => {
    expect(isSessionLockedForParticipants(session('open'), now)).toBe(false)
  })

  it('keeps an open session with invalid cutoffAt editable', () => {
    expect(isSessionLockedForParticipants(session('open', 'not-a-date'), now)).toBe(
      false,
    )
  })
})
