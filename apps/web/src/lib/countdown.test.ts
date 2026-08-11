import { describe, expect, it } from 'bun:test'

import { countdownLabel, countdownShouldRun } from './countdown.ts'

describe('countdown label', () => {
  it('keeps scheduling while session data loads', () => {
    expect(countdownShouldRun(null)).toBe(true)
  })

  it('shows the locked state instead of a countdown', () => {
    expect(
      countdownLabel(
        {
          cutoffAt: '2026-08-11T17:50:00.000Z',
          cutoffTime: '11:20 PM',
          status: 'locked',
        },
        new Date('2026-08-11T17:25:00.000Z'),
      ),
    ).toBe('Order locked')
  })
})
