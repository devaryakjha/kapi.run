import { describe, expect, it } from 'bun:test'
import type { KapiSession, MenuItem } from '@kapi/spec'

import {
  applyParticipantCartUpdate,
  participantCartExpectedRevision,
  participantCartLinesForDisplay,
  reconcileParticipantCartRefresh,
} from './participant-cart.ts'

const menu = [{
  id: 'item-1',
  restaurantId: 'restaurant-1',
  swiggyItemId: 'swiggy-1',
  name: 'Paprika sandwich',
  description: '',
  category: 'Sandwiches',
  price: 415,
  available: true,
  hasAddons: true,
}] satisfies MenuItem[]

const session = {
  id: 'session-1',
  organiserName: 'Arya',
  address: { id: 'address-1', label: 'Home', detail: 'BTM' },
  restaurant: {
    id: 'restaurant-1',
    name: 'Blue Tokai',
    area: 'BTM',
    availabilityStatus: 'OPEN',
  },
  cutoffTime: '10:30 AM',
  shareUrl: 'https://kapi.run/join?i=invite-1',
  status: 'open',
  participants: [{
    id: 'participant-1',
    displayName: 'Sam',
    status: 'submitted',
    joinedAt: '2026-08-12T04:00:00.000Z',
  }],
  items: [{
    id: 'old-line',
    participantId: 'participant-1',
    participantName: 'Sam',
    menuItemId: 'item-1',
    name: 'Paprika sandwich',
    quantity: 1,
    price: 415,
    available: true,
    swiggyItemId: 'swiggy-1',
  }],
  audit: [],
} satisfies KapiSession

describe('participant cart updates', () => {
  it('moves submitted edits and new draft lines into the visible submitted cart', () => {
    const updated = applyParticipantCartUpdate(
      session,
      menu,
      'participant-1',
      'Sam',
      {
        'old-line': {
          id: 'old-line',
          menuItemId: 'item-1',
          quantity: 2,
          unitPrice: 415,
        },
      },
      {
        'new-line': {
          id: 'new-line',
          menuItemId: 'item-1',
          quantity: 1,
          unitPrice: 415,
        },
      },
    )

    expect(Object.values(updated.submitted).map(({ quantity }) => quantity))
      .toEqual([2, 1])
    expect(updated.draft).toEqual({})
    expect(updated.session.items).toHaveLength(2)
  })

  it('keeps a submitted item visible when it is absent from the current menu', () => {
    const submitted = {
      'old-line': {
        id: 'old-line',
        menuItemId: 'item-1',
        quantity: 1,
        unitPrice: 415,
      },
    }

    expect(
      participantCartLinesForDisplay(
        submitted,
        [],
        session.items,
        'participant-1',
      ),
    ).toEqual([{
      item: { name: 'Paprika sandwich', price: 415 },
      line: submitted['old-line'],
    }])
  })

  it('preserves a local submitted edit and its base revision during refresh', () => {
    const current = {
      local: { id: 'local', menuItemId: 'item-1', quantity: 2 },
    }
    const incoming = {
      remote: { id: 'remote', menuItemId: 'item-1', quantity: 4 },
    }

    expect(reconcileParticipantCartRefresh({
      current,
      incoming,
      dirty: true,
      editBaseRevision: '2026-08-12T05:00:00.000Z',
      incomingRevision: '2026-08-12T05:01:00.000Z',
    })).toEqual({
      submitted: current,
      editBaseRevision: '2026-08-12T05:00:00.000Z',
    })
    expect(participantCartExpectedRevision(
      true,
      '2026-08-12T05:00:00.000Z',
      '2026-08-12T05:01:00.000Z',
    )).toBe('2026-08-12T05:00:00.000Z')
  })

  it('adopts the live cart and revision when there is no local edit', () => {
    const incoming = {
      remote: { id: 'remote', menuItemId: 'item-1', quantity: 4 },
    }

    expect(reconcileParticipantCartRefresh({
      current: {},
      incoming,
      dirty: false,
      editBaseRevision: null,
      incomingRevision: '2026-08-12T05:01:00.000Z',
    })).toEqual({
      submitted: incoming,
      editBaseRevision: '2026-08-12T05:01:00.000Z',
    })
  })
})
