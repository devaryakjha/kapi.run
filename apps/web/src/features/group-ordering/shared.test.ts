import type { KapiSession, RelayWritePayload, SessionStatus } from '@kapi/spec'
import { describe, expect, it } from 'vitest'
import type { RelayRecord } from '../../../../api/src/index'
import {
  app,
  applyRelayWrite,
  authorizeCartSync,
  decideRelayWrite,
} from '../../../../api/src/index'

import {
  addPlainDraftItem,
  applyParticipantSubmission,
  applyRelayParticipantSubmission,
  changeDraftLineQuantity,
  draftCartFromSubmittedItems,
  groupCartLinesByParticipant,
  hasOrganizerCapability,
  hashOrganizerSecret,
  getOrderQuantity,
  getOrderSubtotal,
  isSessionLockedForParticipants,
  makeCartPayload,
  makeManualFallback,
  resolveSetupCutoffAt,
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

describe('resolveSetupCutoffAt', () => {
  const now = new Date(2026, 5, 19, 12, 0, 0, 0)

  it('accepts a future same-day cutoff', () => {
    expect(resolveSetupCutoffAt('12:45', now)).toEqual({
      cutoffAt: new Date(2026, 5, 19, 12, 45, 0, 0).toISOString(),
    })
  })

  it('rejects the current minute', () => {
    expect(resolveSetupCutoffAt('12:00', now)).toEqual({
      error: 'Choose a cutoff later than now.',
    })
  })

  it('rejects a past time instead of rolling to tomorrow', () => {
    expect(resolveSetupCutoffAt('11:59', now)).toEqual({
      error: 'Choose a cutoff later than now.',
    })
  })

  it('rejects invalid time input', () => {
    expect(resolveSetupCutoffAt('bad', now)).toEqual({
      error: 'Choose a valid cutoff time.',
    })
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

describe('decideRelayWrite', () => {
  async function currentRecord(
    cutoffAt: string,
    status: SessionStatus = 'open',
  ): Promise<RelayRecord> {
    return {
      ciphertext: 'old-ciphertext',
      updatedAt: 'version-1',
      metadata: {
        cutoffAt,
        status,
        organizerSecretHash: await hashOrganizerSecret('organizer-secret'),
      },
    }
  }

  function write(patch: Partial<RelayWritePayload> = {}): RelayWritePayload {
    return {
      ciphertext: 'new-ciphertext',
      expectedUpdatedAt: 'version-1',
      metadata: {
        cutoffAt: '2026-06-19T12:01:00.000Z',
        status: 'open',
        organizerSecretHash: 'hash',
      },
      participantId: 'participant-1',
      role: 'participant',
      ...patch,
    }
  }

  it('allows a participant write before cutoff', async () => {
    const decision = await decideRelayWrite(
      await currentRecord('2999-06-19T12:01:00.000Z'),
      write({ metadata: { status: 'locked' } }),
      null,
      'participant-secret',
    )

    expect(decision.ok).toBe(true)
    if (decision.ok) {
      expect(decision.role).toBe('participant')
      expect(decision.metadata?.status).toBe('open')
    }
  })

  it('rejects a participant write after cutoff', async () => {
    const decision = await decideRelayWrite(
      await currentRecord('2000-06-19T12:01:00.000Z'),
      write(),
      null,
      'participant-secret',
    )

    expect(decision).toMatchObject({ ok: false, status: 423 })
  })

  it('rejects a participant write without participant proof', async () => {
    const decision = await decideRelayWrite(
      await currentRecord('2999-06-19T12:01:00.000Z'),
      write(),
      null,
    )

    expect(decision).toMatchObject({ ok: false, status: 403 })
  })

  it('keeps participant writes from replacing the organizer session ciphertext', async () => {
    const current = await currentRecord('2999-06-19T12:01:00.000Z')
    const body = write({ ciphertext: 'participant-crafted-full-session' })
    const decision = await decideRelayWrite(
      current,
      body,
      null,
      'participant-secret',
    )

    expect(decision.ok).toBe(true)
    if (!decision.ok) return
    const updated = applyRelayWrite(current, body, decision, 'version-2')

    expect(updated.ciphertext).toBe('old-ciphertext')
    expect(updated.participantSubmissions?.['participant-1']).toMatchObject({
      ciphertext: 'participant-crafted-full-session',
      updatedAt: 'version-2',
    })
    expect(updated.participantSecretHashes).toEqual({
      'participant-1': await hashOrganizerSecret('participant-secret'),
    })
  })

  it("rejects writes to another participant's existing slot", async () => {
    const current = await currentRecord('2999-06-19T12:01:00.000Z')
    current.participantSecretHashes = {
      'participant-2': await hashOrganizerSecret('victim-secret'),
    }
    current.participantSubmissions = {
      'participant-2': {
        ciphertext: 'victim-submission',
        updatedAt: 'version-1',
      },
    }

    const decision = await decideRelayWrite(
      current,
      write({ participantId: 'participant-2' }),
      null,
      'attacker-secret',
    )

    expect(decision).toMatchObject({ ok: false, status: 403 })
  })

  it('allows an organizer write with the correct secret after cutoff', async () => {
    const decision = await decideRelayWrite(
      await currentRecord('2000-06-19T12:01:00.000Z'),
      write({
        role: 'organizer',
        metadata: {
          cutoffAt: '2000-06-19T12:01:00.000Z',
          status: 'locked',
          organizerSecretHash: await hashOrganizerSecret('organizer-secret'),
        },
      }),
      'organizer-secret',
    )

    expect(decision.ok).toBe(true)
    if (decision.ok) expect(decision.metadata?.status).toBe('locked')
  })

  it('rejects an organizer write with a wrong or missing secret', async () => {
    await expect(
      decideRelayWrite(
        await currentRecord('2000-06-19T12:01:00.000Z'),
        write({ role: 'organizer' }),
        'wrong-secret',
      ),
    ).resolves.toMatchObject({ ok: false, status: 403 })

    await expect(
      decideRelayWrite(
        await currentRecord('2000-06-19T12:01:00.000Z'),
        write({ role: 'organizer' }),
        null,
      ),
    ).resolves.toMatchObject({ ok: false, status: 403 })
  })

  it('keeps stale writes as conflicts before checking organizer proof', async () => {
    const current = await currentRecord('2000-06-19T12:01:00.000Z')
    current.updatedAt = 'version-2'

    await expect(
      decideRelayWrite(current, write({ role: 'organizer' }), 'wrong-secret'),
    ).resolves.toMatchObject({
      ok: false,
      status: 409,
      body: { updatedAt: 'version-2' },
    })
  })

  it('sanitizes relay metadata to allowed fields', async () => {
    const organizerSecretHash = await hashOrganizerSecret('organizer-secret')
    const decision = await decideRelayWrite(
      undefined,
      write({
        role: 'organizer',
        metadata: {
          cutoffAt: '2026-06-19T12:01:00.000Z',
          status: 'open',
          organizerSecretHash,
          address: 'forbidden',
          cartItems: [],
          participantName: 'forbidden',
        } as RelayWritePayload['metadata'],
      }),
      'organizer-secret',
    )

    expect(decision.ok).toBe(true)
    if (decision.ok) {
      expect(decision.metadata).toEqual({
        cutoffAt: '2026-06-19T12:01:00.000Z',
        status: 'open',
        organizerSecretHash,
      })
    }
  })

  it('clears staged participant submissions after an organizer write', async () => {
    const current = await currentRecord('2999-06-19T12:01:00.000Z')
    current.participantSecretHashes = {
      'participant-1': await hashOrganizerSecret('participant-secret'),
    }
    current.participantSubmissions = {
      'participant-1': {
        ciphertext: 'participant-submission',
        updatedAt: 'version-1',
      },
    }
    const body = write({
      ciphertext: 'organizer-session',
      role: 'organizer',
      metadata: {
        cutoffAt: '2026-06-19T12:01:00.000Z',
        status: 'locked',
        organizerSecretHash: await hashOrganizerSecret('organizer-secret'),
      },
    })
    const decision = await decideRelayWrite(current, body, 'organizer-secret')

    expect(decision.ok).toBe(true)
    if (!decision.ok) return
    const updated = applyRelayWrite(current, body, decision, 'version-2')

    expect(updated.ciphertext).toBe('organizer-session')
    expect(updated.participantSubmissions).toBeUndefined()
    expect(updated.participantSecretHashes).toEqual({
      'participant-1': await hashOrganizerSecret('participant-secret'),
    })
  })
})

describe('authorizeCartSync', () => {
  async function relayRecord(
    secret = 'organizer-secret',
  ): Promise<RelayRecord> {
    return {
      ciphertext: 'ciphertext',
      updatedAt: 'version-1',
      metadata: {
        status: 'locked',
        organizerSecretHash: await hashOrganizerSecret(secret),
      },
    }
  }

  it('accepts a matching organizer secret for the session', async () => {
    await expect(
      authorizeCartSync(
        { 'session-1': await relayRecord() },
        'session-1',
        'organizer-secret',
      ),
    ).resolves.toBe(true)
  })

  it('rejects missing or wrong organizer proof', async () => {
    const sessions = { 'session-1': await relayRecord() }

    await expect(authorizeCartSync(sessions, 'session-1', null)).resolves.toBe(
      false,
    )
    await expect(
      authorizeCartSync(sessions, 'session-1', 'wrong-secret'),
    ).resolves.toBe(false)
    await expect(
      authorizeCartSync(sessions, 'other-session', 'organizer-secret'),
    ).resolves.toBe(false)
  })
})

describe('/food/cart/sync', () => {
  it('rejects missing organizer proof before using the Swiggy token', async () => {
    const response = await app.handle(
      new Request('http://localhost/food/cart/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...makeCartPayload({
            ...session('locked'),
            items: [cartItem('swiggy-1', 1)],
          }),
          replaceExistingCart: true,
        }),
      }),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Only the organiser can sync the Swiggy cart.',
    })
  })
})

describe('makeCartPayload', () => {
  it('keeps available Swiggy cart lines separate', () => {
    expect(
      makeCartPayload({
        ...session('open'),
        items: [cartItem('swiggy-1', 2), cartItem('swiggy-1', 3)],
      }),
    ).toEqual({
      sessionId: 'session-1',
      restaurantId: 'restaurant-1',
      restaurantName: 'Cafe',
      addressId: 'address-1',
      cartItems: [
        { menu_item_id: 'swiggy-1', quantity: 2 },
        { menu_item_id: 'swiggy-1', quantity: 3 },
      ],
    })
  })

  it('excludes unavailable items', () => {
    expect(
      makeCartPayload({
        ...session('open'),
        items: [cartItem('swiggy-1', 2), cartItem('swiggy-2', 3, false)],
      }).cartItems,
    ).toEqual([{ menu_item_id: 'swiggy-1', quantity: 2 }])
  })

  it('includes variant and addon selections for customized lines', () => {
    expect(
      makeCartPayload({
        ...session('open'),
        items: [
          {
            ...cartItem('swiggy-1', 1),
            customization: {
              variantsV2: [
                {
                  group_id: 'size',
                  variation_id: 'large',
                  groupName: 'Size',
                  name: 'Large',
                },
              ],
              addons: [
                {
                  group_id: 'bun',
                  choice_id: 'brioche',
                  groupName: 'Bun',
                  name: 'Brioche',
                  price: 19,
                },
              ],
            },
          },
        ],
      }).cartItems,
    ).toEqual([
      {
        menu_item_id: 'swiggy-1',
        quantity: 1,
        variantsV2: [{ group_id: 'size', variation_id: 'large' }],
        addons: [{ group_id: 'bun', choice_id: 'brioche' }],
      },
    ])
  })
})

describe('order totals', () => {
  it('sums item subtotals with quantities and custom prices', () => {
    expect(
      getOrderSubtotal({
        ...session('open'),
        items: [
          cartItem('swiggy-1', 2),
          { ...cartItem('swiggy-2', 3), price: 95 },
        ],
      }),
    ).toBe(525)
  })

  it('sums item quantities', () => {
    expect(
      getOrderQuantity({
        ...session('open'),
        items: [cartItem('swiggy-1', 2), cartItem('swiggy-2', 3)],
      }),
    ).toBe(5)
  })
})

describe('applyParticipantSubmission', () => {
  it('keeps same-name participants separate', () => {
    const first = applyParticipantSubmission({
      latest: session('open'),
      menu,
      participantId: 'participant-1',
      participantName: 'Alex',
      draftItems: [{ id: 'line-1', menuItemId: 'menu-swiggy-1', quantity: 1 }],
    })
    const second = applyParticipantSubmission({
      latest: first,
      menu,
      participantId: 'participant-2',
      participantName: 'Alex',
      draftItems: [{ id: 'line-2', menuItemId: 'menu-swiggy-2', quantity: 2 }],
    })

    expect(second.participants).toMatchObject([
      { id: 'participant-1', displayName: 'Alex' },
      { id: 'participant-2', displayName: 'Alex' },
    ])
    expect(second.items.map((item) => [item.participantId, item.name])).toEqual(
      [
        ['participant-1', 'Dosa'],
        ['participant-2', 'Idli'],
      ],
    )
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
      draftItems: [{ id: 'line-3', menuItemId: 'menu-swiggy-2', quantity: 3 }],
    })

    expect(
      next.items.map((item) => [item.participantId, item.quantity]),
    ).toEqual([
      ['participant-2', 1],
      ['participant-1', 3],
    ])
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
      draftItems: [{ id: 'line-4', menuItemId: 'menu-swiggy-1', quantity: 1 }],
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

  it('stores customization details on submitted cart lines', () => {
    const next = applyParticipantSubmission({
      latest: session('open'),
      menu,
      participantId: 'participant-1',
      participantName: 'Alex',
      draftItems: [
        {
          id: 'line-5',
          menuItemId: 'menu-swiggy-1',
          quantity: 1,
          customization: {
            variantsV2: [{ group_id: 'size', variation_id: 'large' }],
            addons: [{ group_id: 'bun', choice_id: 'brioche', price: 19 }],
          },
          customizationSummary: 'Size: Large, Bun: Brioche',
          unitPrice: 139,
        },
      ],
    })

    expect(next.items[0]).toMatchObject({
      customization: {
        variantsV2: [{ group_id: 'size', variation_id: 'large' }],
        addons: [{ group_id: 'bun', choice_id: 'brioche', price: 19 }],
      },
      customizationSummary: 'Size: Large, Bun: Brioche',
      price: 139,
    })
  })
})

describe('applyRelayParticipantSubmission', () => {
  it("replaces only the relay-owned participant's lines", () => {
    const current = {
      ...session('open'),
      items: [
        cartItem('swiggy-1', 1, true, 'participant-1', 'Alex'),
        cartItem('swiggy-2', 2, true, 'participant-2', 'Blair'),
      ],
    }

    const next = applyRelayParticipantSubmission(
      current,
      'participant-1',
      {
        participantName: 'Mallory',
        items: [
          {
            ...cartItem('swiggy-2', 3, true, 'participant-2', 'Blair'),
            id: 'crafted-line',
          },
        ],
      },
      '2026-06-19T12:02:00.000Z',
    )

    expect(
      next.items.map((item) => [item.participantId, item.quantity]),
    ).toEqual([
      ['participant-2', 2],
      ['participant-1', 3],
    ])
    expect(next.participants).toContainEqual({
      id: 'participant-1',
      displayName: 'Mallory',
      status: 'submitted',
      joinedAt: '2026-06-19T12:02:00.000Z',
      submittedAt: '2026-06-19T12:02:00.000Z',
    })
  })
})

describe('draft cart helpers', () => {
  it('adds a plain item as a stable draft line', () => {
    expect(addPlainDraftItem({}, 'menu-swiggy-1')).toEqual({
      'menu-swiggy-1': {
        id: 'menu-swiggy-1',
        menuItemId: 'menu-swiggy-1',
        quantity: 1,
      },
    })
  })

  it('increments an existing plain draft line', () => {
    const draft = addPlainDraftItem({}, 'menu-swiggy-1')

    expect(addPlainDraftItem(draft, 'menu-swiggy-1')).toEqual({
      'menu-swiggy-1': {
        id: 'menu-swiggy-1',
        menuItemId: 'menu-swiggy-1',
        quantity: 2,
      },
    })
  })

  it('removes a draft line when quantity reaches zero', () => {
    const draft = addPlainDraftItem({}, 'menu-swiggy-1')

    expect(changeDraftLineQuantity(draft, 'menu-swiggy-1', -1)).toEqual({})
  })

  it('converts submitted cart lines back into editable draft lines', () => {
    expect(
      draftCartFromSubmittedItems([
        {
          ...cartItem('swiggy-1', 2),
          id: 'cart-line-1',
          menuItemId: 'menu-swiggy-1',
          customizationSummary: 'Size: Large',
          price: 139,
        },
      ]),
    ).toEqual({
      'cart-line-1': {
        id: 'cart-line-1',
        menuItemId: 'menu-swiggy-1',
        quantity: 2,
        customization: undefined,
        customizationSummary: 'Size: Large',
        unitPrice: 139,
      },
    })
  })
})

describe('groupCartLinesByParticipant', () => {
  it('preserves first-seen group order and latest participant names', () => {
    const groups = groupCartLinesByParticipant([
      cartItem('swiggy-1', 1, true, 'participant-1', 'Alex'),
      cartItem('swiggy-2', 1, true, 'participant-2', 'Sam'),
      cartItem('swiggy-3', 1, true, 'participant-1', 'Alec'),
    ])

    expect(
      groups.map((group) => ({
        key: group.key,
        name: group.name,
        itemIds: group.items.map((item) => item.id),
      })),
    ).toEqual([
      {
        key: 'participant-1',
        name: 'Alec',
        itemIds: ['swiggy-1-1', 'swiggy-3-1'],
      },
      { key: 'participant-2', name: 'Sam', itemIds: ['swiggy-2-1'] },
    ])
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
