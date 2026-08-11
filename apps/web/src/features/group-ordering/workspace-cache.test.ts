import type { KapiSession, MenuItem } from '@kapi/spec'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearWorkspaceCache,
  readWorkspaceCache,
  writeWorkspaceCache,
} from './workspace-cache'

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

describe('workspace cache', () => {
  beforeEach(clearWorkspaceCache)

  it('finds one workspace from either an invite or session link', () => {
    writeWorkspaceCache({
      parts: {
        inviteId: 'invite-1',
        key: 'key-1',
        organizerSecret: 'owner-1',
        owner: true,
        sessionId: 'session-1',
      },
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
    ).toMatchObject({ loaded: { session }, isOrganizer: true, menu })
    expect(
      readWorkspaceCache({
        inviteId: null,
        key: 'key-1',
        organizerSecret: 'owner-1',
        owner: true,
        sessionId: 'session-1',
      }),
    ).toMatchObject({ loaded: { session }, isOrganizer: true, menu })
  })

  it('merges fresher session data without dropping the cached menu', () => {
    writeWorkspaceCache({
      parts: {
        inviteId: 'invite-1',
        key: 'key-1',
        organizerSecret: 'owner-1',
        owner: true,
        sessionId: 'session-1',
      },
      loaded: { session, relayUpdatedAt: null },
      isOrganizer: true,
      menu,
    })
    writeWorkspaceCache({
      parts: {
        inviteId: 'invite-1',
        key: 'key-1',
        organizerSecret: 'owner-1',
        owner: true,
        sessionId: 'session-1',
      },
      loaded: {
        session: { ...session, status: 'locked' },
        relayUpdatedAt: '2026-08-11T10:01:00.000Z',
      },
    })

    expect(
      readWorkspaceCache({
        inviteId: 'invite-1',
        key: null,
        organizerSecret: null,
        owner: true,
        sessionId: null,
      }),
    ).toMatchObject({
      loaded: { session: { status: 'locked' } },
      isOrganizer: true,
      menu,
    })
  })
})
