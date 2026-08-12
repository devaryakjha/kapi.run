import { describe, expect, it } from 'bun:test'

import {
  countdownLabel,
  countdownShouldRun,
  countdownStatus,
} from './countdown.ts'

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

  it('marks the timer expired at the cutoff', () => {
    const source = {
      cutoffAt: '2026-08-11T17:50:00.000Z',
      cutoffTime: '11:20 PM',
      status: 'open',
    }

    expect(
      countdownStatus(source, new Date('2026-08-11T17:49:59.999Z')),
    ).toBe('open')
    expect(
      countdownStatus(source, new Date('2026-08-11T17:50:00.000Z')),
    ).toBe('expired')
    expect(
      countdownStatus(source, new Date('2026-08-11T17:50:01.000Z')),
    ).toBe('expired')
    expect(
      countdownShouldRun(source, new Date('2026-08-11T17:50:00.000Z')),
    ).toBe(false)
  })

  it('keeps a terminal status after the cutoff', () => {
    expect(
      countdownStatus(
        {
          cutoffAt: '2026-08-11T17:50:00.000Z',
          cutoffTime: '11:20 PM',
          status: 'locked',
        },
        new Date('2026-08-11T17:51:00.000Z'),
      ),
    ).toBe('locked')
  })

  it('keeps an open status without a valid cutoff timestamp', () => {
    expect(
      countdownStatus(
        { cutoffAt: 'invalid', cutoffTime: '11:20 PM', status: 'open' },
        new Date('2026-08-11T17:51:00.000Z'),
      ),
    ).toBe('open')
    expect(
      countdownStatus(
        { cutoffTime: '11:20 PM', status: 'open' },
        new Date('2026-08-11T17:51:00.000Z'),
      ),
    ).toBe('open')
  })
})
