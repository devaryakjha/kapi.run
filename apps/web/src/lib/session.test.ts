import { describe, expect, it } from 'bun:test'
import type { CartLine, KapiSession } from '@kapi/spec'

import {
  applyParticipantSubmission,
  applySessionWindowChange,
  defaultSetupCutoffTime,
  draftCartFromParticipantItems,
  formatAddressOption,
  formatRestaurantLocationMeta,
  formatRestaurantValueMeta,
  participantRole,
  sessionAdminParticipantIds,
  setParticipantRole,
  formatTimeLabel,
  resolveSetupCutoffAt,
  sessionWindowAction,
} from './session.ts'

const session = {
  id: 'session-1',
  organiserName: 'Arya',
  address: { id: 'address-1', label: 'Home', detail: 'BTM' },
  restaurant: {
    id: 'restaurant-1',
    name: 'Meghana Foods',
    area: 'BTM',
    rating: 4.5,
    availabilityStatus: 'OPEN',
  },
  cutoffTime: '10:30 AM',
  cutoffAt: '2026-08-12T05:00:00.000Z',
  shareUrl: 'https://kapi.run/join?i=invite-1',
  status: 'open',
  participants: [{
    id: 'participant-1',
    displayName: 'Sam',
    status: 'submitted',
    joinedAt: '2026-08-12T04:00:00.000Z',
  }],
  items: [],
  audit: [],
} satisfies KapiSession

describe('setup cutoff helpers', () => {
  const now = new Date(2026, 7, 11, 10, 2)

  it('rounds the default cutoff to the next five-minute boundary', () => {
    expect(defaultSetupCutoffTime(now)).toBe('10:50')
  })

  it('moves an elapsed local time to the next day', () => {
    expect(resolveSetupCutoffAt('09:30', now)).toEqual({
      cutoffAt: new Date(2026, 7, 12, 9, 30).toISOString(),
    })
  })

  it('rejects malformed times', () => {
    expect(resolveSetupCutoffAt('25:00', now)).toEqual({
      error: 'Choose a valid cutoff time.',
    })
  })

  it('formats a time label', () => {
    expect(formatTimeLabel('20:05')).toBe('8:05 PM')
  })
})

describe('setup option labels', () => {
  it('formats address and restaurant metadata', () => {
    expect(
      formatAddressOption({ id: 'address-1', label: 'Home', detail: 'Tower A' }),
    ).toBe('Home - Tower A')
    expect(
      formatRestaurantLocationMeta({
        id: 'restaurant-1',
        name: 'Meghana Foods',
        area: 'Indiranagar',
        rating: 4.6,
        distanceKm: 2.1,
        deliveryTimeRange: '25-30 mins',
        availabilityStatus: 'OPEN',
      }),
    ).toBe('Indiranagar · 2.1 km · 25-30 mins')
    expect(
      formatRestaurantValueMeta({
        id: 'restaurant-1',
        name: 'Meghana Foods',
        area: 'Indiranagar',
        rating: 4.6,
        costForTwo: '₹500 for two',
        totalRatings: '10K+',
        availabilityStatus: 'OPEN',
      }),
    ).toBe('₹500 for two · 10K+ ratings')
  })
})

describe('owner session window changes', () => {
  const now = new Date('2026-08-12T04:30:00.000Z')

  it('extends an active session to a later cutoff', () => {
    const result = applySessionWindowChange(
      session,
      new Date('2026-08-12T05:30:00.000Z'),
      now,
    )

    expect(result).toMatchObject({ action: 'extend' })
    if ('error' in result) return
    expect(result.session).toMatchObject({
      id: session.id,
      status: 'open',
      cutoffAt: '2026-08-12T05:30:00.000Z',
      participants: session.participants,
      items: session.items,
    })
    expect(result.session.audit.at(-1)?.action).toBe('extended session')
  })

  it('requires an extension to exceed the current cutoff', () => {
    expect(
      applySessionWindowChange(
        session,
        new Date('2026-08-12T05:00:00.000Z'),
        now,
      ),
    ).toEqual({ error: 'Choose a cutoff later than the current cutoff.' })
  })

  it('reopens every inactive session and clears the stale sync result', () => {
    for (const status of ['locked', 'syncing', 'synced', 'sync_failed', 'closed'] as const) {
      const result = applySessionWindowChange(
        {
          ...session,
          status,
          sync: { status: 'synced', message: 'Previous cart sync' },
        },
        new Date('2026-08-12T05:15:00.000Z'),
        now,
      )

      expect(result).toMatchObject({ action: 'reopen' })
      if ('error' in result) continue
      expect(result.session.status).toBe('open')
      expect(result.session.sync).toBeUndefined()
      expect(result.session.participants).toEqual(session.participants)
      expect(result.session.audit.at(-1)?.action).toBe('re-opened session')
    }
  })

  it('treats an elapsed open session as a reopen', () => {
    expect(
      sessionWindowAction(session, new Date('2026-08-12T05:00:00.000Z')),
    ).toBe('reopen')
  })

  it('rejects an invalid or elapsed replacement cutoff', () => {
    expect(
      applySessionWindowChange(session, new Date('invalid'), now),
    ).toEqual({ error: 'Choose a valid future cutoff.' })
    expect(
      applySessionWindowChange(
        { ...session, status: 'locked' },
        new Date('2026-08-12T04:30:00.000Z'),
        now,
      ),
    ).toEqual({ error: 'Choose a valid future cutoff.' })
  })
})

describe('participant submitted items', () => {
  const submittedItems = [
    {
      id: 'line-1',
      participantId: 'participant-1',
      participantName: 'Sam',
      menuItemId: 'item-1',
      name: 'Paprika sandwich',
      quantity: 2,
      price: 455,
      available: true,
      swiggyItemId: 'swiggy-1',
      customization: {
        addons: [{
          group_id: 'bread',
          choice_id: 'milk-bread',
          groupName: 'Bread',
          name: 'Milk bread',
          price: 40,
        }],
      },
      customizationSummary: 'Bread: Milk bread',
    },
    {
      id: 'line-2',
      participantId: 'participant-2',
      participantName: 'Sam',
      menuItemId: 'item-2',
      name: 'Cold coffee',
      quantity: 1,
      price: 210,
      available: true,
      swiggyItemId: 'swiggy-2',
    },
  ] satisfies CartLine[]

  it('restores only the current participant items with customization intact', () => {
    expect(
      draftCartFromParticipantItems(submittedItems, 'participant-1'),
    ).toEqual({
      'line-1': {
        id: 'line-1',
        menuItemId: 'item-1',
        quantity: 2,
        unitPrice: 455,
        customization: submittedItems[0]?.customization,
        customizationSummary: 'Bread: Milk bread',
      },
    })
  })

  it('lets a participant remove their final item without changing another order', () => {
    const updated = applyParticipantSubmission({
      latest: {
        ...session,
        participants: [
          ...session.participants,
          {
            id: 'participant-2',
            displayName: 'Alex',
            status: 'submitted',
            joinedAt: '2026-08-12T04:01:00.000Z',
          },
        ],
        items: submittedItems,
      },
      menu: [],
      participantId: 'participant-1',
      participantName: 'Sam',
      draftItems: [],
    })

    expect(updated.items).toEqual([submittedItems[1]])
    expect(
      updated.participants.find(({ id }) => id === 'participant-1')?.status,
    ).toBe('submitted')
  })

  it('preserves an existing submitted item when it leaves the current menu', () => {
    const existing = submittedItems[0]!
    const updated = applyParticipantSubmission({
      latest: { ...session, items: [existing] },
      menu: [],
      participantId: 'participant-1',
      participantName: 'Sam',
      draftItems: [{
        id: existing.id,
        menuItemId: existing.menuItemId,
        quantity: 3,
        unitPrice: existing.price,
        customization: existing.customization,
        customizationSummary: existing.customizationSummary,
      }],
    })

    expect(updated.items).toEqual([
      expect.objectContaining({
        participantId: 'participant-1',
        menuItemId: existing.menuItemId,
        name: existing.name,
        quantity: 3,
        customization: existing.customization,
        customizationSummary: existing.customizationSummary,
      }),
    ])
  })
})

describe('session roles', () => {
  it('treats participants from existing sessions as members', () => {
    expect(participantRole({
      id: 'participant-1',
      displayName: 'Sam',
      status: 'joined',
      joinedAt: '2026-08-12T04:00:00.000Z',
    })).toBe('member')
  })

  it('lets the owner promote and demote a session participant', () => {
    const promoted = setParticipantRole(session, 'participant-1', 'admin')
    expect(promoted.participants[0]?.role).toBe('admin')
    expect(promoted.audit.at(-1)?.action).toBe('promoted Sam to admin')
    expect(sessionAdminParticipantIds(promoted)).toEqual(['participant-1'])

    const demoted = setParticipantRole(promoted, 'participant-1', 'member')
    expect(demoted.participants[0]?.role).toBe('member')
    expect(demoted.audit.at(-1)?.action).toBe('removed Sam as admin')
  })

  it('keeps an admin role when that participant submits again', () => {
    const promoted = setParticipantRole(session, 'participant-1', 'admin')
    const updated = applyParticipantSubmission({
      latest: promoted,
      menu: [],
      participantId: 'participant-1',
      participantName: 'Sam',
      draftItems: [],
    })

    expect(updated.participants[0]?.role).toBe('admin')
  })

  it('does not change a session for an unknown participant', () => {
    expect(setParticipantRole(session, 'missing', 'admin')).toBe(session)
  })
})
