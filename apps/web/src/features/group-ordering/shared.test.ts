import type { KapiSession, SessionStatus } from '@kapi/spec'
import { describe, expect, it } from 'vitest'

import {
  hasOrganizerCapability,
  hashOrganizerSecret,
  isSessionLockedForParticipants,
  makeCartPayload,
} from './shared'

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

function cartItem(
  swiggyItemId: string,
  quantity: number,
  available = true,
): KapiSession['items'][number] {
  return {
    id: `${swiggyItemId}-${quantity}`,
    participantName: 'Asha',
    menuItemId: `menu-${swiggyItemId}`,
    name: 'Dosa',
    quantity,
    price: 120,
    available,
    swiggyItemId,
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
    expect(
      isSessionLockedForParticipants(session('open', 'not-a-date'), now),
    ).toBe(false)
  })
})

describe('hasOrganizerCapability', () => {
  it('accepts a matching organizer secret', async () => {
    const organizerSecret = 'organizer-secret'
    const current = {
      ...session('open'),
      organizerSecretHash: await hashOrganizerSecret(organizerSecret),
    }

    await expect(
      hasOrganizerCapability(current, organizerSecret),
    ).resolves.toBe(true)
  })

  it('rejects a wrong organizer secret', async () => {
    const current = {
      ...session('open'),
      organizerSecretHash: await hashOrganizerSecret('organizer-secret'),
    }

    await expect(hasOrganizerCapability(current, 'wrong-secret')).resolves.toBe(
      false,
    )
  })

  it('rejects a missing organizer secret', async () => {
    const current = {
      ...session('open'),
      organizerSecretHash: await hashOrganizerSecret('organizer-secret'),
    }

    await expect(hasOrganizerCapability(current, null)).resolves.toBe(false)
  })
})

describe('makeCartPayload', () => {
  it('groups duplicate available Swiggy item ids by quantity', () => {
    expect(
      makeCartPayload({
        ...session('open'),
        items: [cartItem('swiggy-1', 2), cartItem('swiggy-1', 3)],
      }),
    ).toEqual({
      restaurantId: 'restaurant-1',
      addressId: 'address-1',
      cartItems: [{ itemId: 'swiggy-1', quantity: 5 }],
    })
  })

  it('excludes unavailable items', () => {
    expect(
      makeCartPayload({
        ...session('open'),
        items: [cartItem('swiggy-1', 2), cartItem('swiggy-2', 3, false)],
      }).cartItems,
    ).toEqual([{ itemId: 'swiggy-1', quantity: 2 }])
  })
})
