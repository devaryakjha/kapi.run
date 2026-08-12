import { describe, expect, it } from 'bun:test'

import {
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
})
