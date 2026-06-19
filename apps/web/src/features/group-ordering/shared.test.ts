import type { KapiSession, SessionStatus } from '@kapi/spec'
import { describe, expect, it } from 'vitest'

import {
  applyParticipantSubmission,
  hasOrganizerCapability,
  hashOrganizerSecret,
  isSessionLockedForParticipants,
  makeCartPayload,
  makeManualFallback,
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
  participantId = 'participant-1',
  participantName = 'Asha',
): KapiSession['items'][number] {
  return {
    id: `${swiggyItemId}-${quantity}`,
    participantId,
    participantName,
    menuItemId: `menu-${swiggyItemId}`,
    name: 'Dosa',
    quantity,
    price: 120,
    available,
    swiggyItemId,
  }
}

const menu = [
  {
    id: 'menu-swiggy-1',
    restaurantId: 'restaurant-1',
    name: 'Dosa',
    category: 'Breakfast',
    description: 'Plain dosa',
    price: 120,
    available: true,
    swiggyItemId: 'swiggy-1',
  },
  {
    id: 'menu-swiggy-2',
    restaurantId: 'restaurant-1',
    name: 'Idli',
    category: 'Breakfast',
    description: 'Steamed idli',
    price: 80,
    available: true,
    swiggyItemId: 'swiggy-2',
  },
]

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

describe('applyParticipantSubmission', () => {
  it('keeps same-name participants separate', () => {
    const first = applyParticipantSubmission({
      latest: session('open'),
      menu,
      participantId: 'participant-1',
      participantName: 'Alex',
      draftItems: [{ menuItemId: 'menu-swiggy-1', quantity: 1 }],
    })
    const second = applyParticipantSubmission({
      latest: first,
      menu,
      participantId: 'participant-2',
      participantName: 'Alex',
      draftItems: [{ menuItemId: 'menu-swiggy-2', quantity: 2 }],
    })

    expect(second.participants).toMatchObject([
      { id: 'participant-1', displayName: 'Alex' },
      { id: 'participant-2', displayName: 'Alex' },
    ])
    expect(second.items.map((item) => [item.participantId, item.name])).toEqual([
      ['participant-1', 'Dosa'],
      ['participant-2', 'Idli'],
    ])
  })

  it("replaces only the submitting participant's old lines", () => {
    const current = {
      ...session('open'),
      items: [
        cartItem('swiggy-1', 1, true, 'participant-1', 'Alex'),
        cartItem('swiggy-2', 1, true, 'participant-2', 'Alex'),
      ],
    }

    const next = applyParticipantSubmission({
      latest: current,
      menu,
      participantId: 'participant-1',
      participantName: 'Alex',
      draftItems: [{ menuItemId: 'menu-swiggy-2', quantity: 3 }],
    })

    expect(next.items.map((item) => [item.participantId, item.quantity])).toEqual(
      [
        ['participant-2', 1],
        ['participant-1', 3],
      ],
    )
  })

  it('updates display name for the same id', () => {
    const current = {
      ...session('open'),
      participants: [
        {
          id: 'participant-1',
          displayName: 'Alex',
          status: 'submitted' as const,
          joinedAt: '2026-06-19T12:00:00.000Z',
        },
      ],
    }

    const next = applyParticipantSubmission({
      latest: current,
      menu,
      participantId: 'participant-1',
      participantName: 'Alec',
      draftItems: [{ menuItemId: 'menu-swiggy-1', quantity: 1 }],
    })

    expect(next.participants[0]).toMatchObject({
      id: 'participant-1',
      displayName: 'Alec',
      status: 'submitted',
    })
    expect(next.items[0]).toMatchObject({
      participantId: 'participant-1',
      participantName: 'Alec',
    })
  })
})

describe('makeManualFallback', () => {
  it('does not merge same-name participants', () => {
    const fallback = makeManualFallback({
      ...session('open'),
      items: [
        cartItem('swiggy-1', 1, true, 'participant-1', 'Alex'),
        cartItem('swiggy-2', 2, true, 'participant-2', 'Alex'),
      ],
    })

    expect(fallback.byParticipant).toHaveLength(2)
    expect(fallback.byParticipant.map((group) => group.total)).toEqual([
      120, 240,
    ])
  })
})
