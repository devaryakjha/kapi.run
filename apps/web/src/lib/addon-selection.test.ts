import { describe, expect, it } from 'bun:test'

import {
  addonSelectionStatus,
  initialAddonSelections,
  toggleAddonSelection,
} from './addon-selection.ts'

describe('add-on selection', () => {
  it('does not preselect an arbitrary required choice', () => {
    expect(initialAddonSelections([{ groupId: 'sauces' }])).toEqual({
      sauces: [],
    })
  })

  it('replaces the selected choice when the maximum is one', () => {
    expect(toggleAddonSelection(['mild'], 'hot', 1)).toEqual({
      limitReached: false,
      selection: ['hot'],
    })
  })

  it('reports a reached limit without changing the selection', () => {
    expect(toggleAddonSelection(['a', 'b'], 'c', 2)).toEqual({
      limitReached: true,
      selection: ['a', 'b'],
    })
  })

  it('always allows a selected choice to be removed', () => {
    expect(toggleAddonSelection(['a', 'b'], 'a', 2)).toEqual({
      limitReached: false,
      selection: ['b'],
    })
  })

  it('shows selection progress without repeating the choice rule', () => {
    expect(addonSelectionStatus({ minAddons: 1, maxAddons: 1 }, 0)).toBe(
      '0 of 1 selected.',
    )
    expect(addonSelectionStatus({ maxAddons: 4 }, 2)).toBe(
      '2 of 4 selected.',
    )
  })

  it('shows a count when an add-on group has no maximum', () => {
    expect(addonSelectionStatus({}, 2)).toBe('2 selected.')
  })

  it('shows a distinct minimum when the maximum does not explain it', () => {
    expect(addonSelectionStatus({ minAddons: 2, maxAddons: 4 }, 0)).toBe(
      '0 of 4 selected. 2 required.',
    )
    expect(addonSelectionStatus({ minAddons: 2 }, 0)).toBe(
      '0 selected. 2 required.',
    )
  })
})
