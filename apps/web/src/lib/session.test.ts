import { describe, expect, it } from 'bun:test'

import {
  defaultSetupCutoffTime,
  formatAddressOption,
  formatRestaurantLocationMeta,
  formatRestaurantValueMeta,
  formatTimeLabel,
  resolveSetupCutoffAt,
} from './session.ts'

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
