import { describe, expect, it } from 'bun:test'

import { orderRestaurantsByAvailability } from './restaurant-order.ts'

describe('restaurant ordering', () => {
  it('places open restaurants first without changing either group order', () => {
    const restaurants = [
      { id: 'closed-1', availabilityStatus: 'CLOSED' as const },
      { id: 'open-1', availabilityStatus: 'OPEN' as const },
      { id: 'closed-2', availabilityStatus: 'CLOSED' as const },
      { id: 'open-2', availabilityStatus: 'OPEN' as const },
    ]

    expect(orderRestaurantsByAvailability(restaurants).map(({ id }) => id)).toEqual([
      'open-1',
      'open-2',
      'closed-1',
      'closed-2',
    ])
    expect(restaurants.map(({ id }) => id)).toEqual([
      'closed-1',
      'open-1',
      'closed-2',
      'open-2',
    ])
  })
})
