import type { KapiSession, MenuItem } from '@kapi/spec'
import { beforeEach, describe, expect, it } from 'bun:test'

import { readWorkspaceCache, writeWorkspaceCache } from './workspace-cache.ts'

const session = {
  id: 'session-1',
  organiserName: 'Organizer',
  address: { id: 'address-1', label: 'Home', detail: 'Indiranagar' },
  restaurant: {
    id: 'restaurant-1',
    name: 'Cafe',
    area: 'Indiranagar',
    rating: 4.5,
    availabilityStatus: 'OPEN',
  },
  cutoffTime: '9:30 PM',
  shareUrl: 'https://kapi.run/join?i=invite-1',
  status: 'open',
  participants: [],
  items: [],
  audit: [],
} satisfies KapiSession

const menu = [
  {
    id: 'menu-1',
    restaurantId: 'restaurant-1',
    name: 'Dosa',
    category: 'Breakfast',
    description: 'Plain dosa',
    price: 120,
    available: true,
    swiggyItemId: 'swiggy-1',
  },
] satisfies MenuItem[]

const parts = {
  inviteId: 'invite-1',
  key: 'key-1',
  organizerSecret: 'owner-1',
  owner: true,
  sessionId: 'session-1',
}

describe('workspace cache', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    })
  })

  it('restores a cached workspace from an invite link', () => {
    writeWorkspaceCache({
      parts,
      loaded: { session, relayUpdatedAt: '2026-08-11T10:00:00.000Z' },
      isOrganizer: true,
      menu,
    })

    expect(
      readWorkspaceCache({
        inviteId: 'invite-1',
        key: null,
        organizerSecret: null,
        owner: true,
        sessionId: null,
      }),
    ).toMatchObject({ loaded: { session }, menu })
  })

  it('keeps the menu while newer session state is stored', () => {
    writeWorkspaceCache({
      parts,
      loaded: { session, relayUpdatedAt: '2026-08-11T10:00:00.000Z' },
      menu,
    })
    writeWorkspaceCache({
      parts,
      loaded: {
        session: { ...session, status: 'locked' },
        relayUpdatedAt: '2026-08-11T10:01:00.000Z',
      },
    })

    expect(readWorkspaceCache(parts)).toMatchObject({
      loaded: { session: { status: 'locked' } },
      menu,
    })
  })
})
