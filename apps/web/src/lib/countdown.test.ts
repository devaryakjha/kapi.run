import { describe, expect, it } from 'bun:test'

import {
  countdownLabel,
  countdownShouldRun,
  countdownStatus,
  startLiveCountdown,
} from './countdown.ts'

function withCountdownEnvironment(run: (activeTimers: Map<number, () => void>) => void) {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const activeTimers = new Map<number, () => void>()
  let nextTimerId = 1

  class TestElement {
    className = ''
    dataset: Record<string, string> = {}
    textContent = ''
    children: TestElement[] = []

    replaceChildren(...children: TestElement[]) {
      this.children = children
    }
  }

  const testDocument = {
    hidden: false,
    createElement: () => new TestElement(),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }
  const testWindow = {
    addEventListener: () => undefined,
    clearTimeout: (id?: number) => {
      if (id) activeTimers.delete(id)
    },
    setTimeout: (callback: () => void) => {
      const id = nextTimerId
      nextTimerId += 1
      activeTimers.set(id, callback)
      return id
    },
  }

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: testDocument,
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: testWindow,
  })

  try {
    run(activeTimers)
  } finally {
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor)
    else Reflect.deleteProperty(globalThis, 'document')
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor)
    else Reflect.deleteProperty(globalThis, 'window')
  }
}

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
    ).toBe('Session locked')
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

  it('shows a session label for the closed state', () => {
    expect(
      countdownLabel(
        {
          cutoffAt: '2026-08-11T17:50:00.000Z',
          cutoffTime: '11:20 PM',
          status: 'closed',
        },
        new Date('2026-08-11T17:25:00.000Z'),
      ),
    ).toBe('Session closed')
  })

  it('shows progress instead of a frozen countdown while syncing', () => {
    expect(
      countdownLabel(
        {
          cutoffAt: '2026-08-11T17:50:00.000Z',
          cutoffTime: '11:20 PM',
          status: 'syncing',
        },
        new Date('2026-08-11T17:25:00.000Z'),
      ),
    ).toBe('Syncing cart')
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

  it('restarts scheduling after a terminal session reopens', () => {
    withCountdownEnvironment((activeTimers) => {
      let source = {
        cutoffAt: new Date(Date.now() + 60_000).toISOString(),
        cutoffTime: '11:20 PM',
        status: 'locked',
      }
      const element = document.createElement('span')
      const refresh = startLiveCountdown(element, () => source)

      expect(activeTimers.size).toBe(0)

      source = { ...source, status: 'open' }
      refresh()

      expect(activeTimers.size).toBe(1)
      expect(element.dataset.status).toBe('open')
    })
  })

  it('announces a status change when the cutoff expires', () => {
    withCountdownEnvironment((activeTimers) => {
      const statuses: string[] = []
      const source = {
        cutoffAt: new Date(Date.now() + 60_000).toISOString(),
        cutoffTime: '11:20 PM',
        status: 'open',
      }
      const element = document.createElement('span')
      startLiveCountdown(element, () => source, (status) => statuses.push(status))
      const timer = [...activeTimers.values()][0]

      source.cutoffAt = new Date(Date.now() - 1).toISOString()
      timer?.()

      expect(statuses).toEqual(['expired'])
    })
  })
})
