import { describe, expect, it } from 'bun:test'

import { isOutsideDialog } from './dialog.ts'

const rect = { top: 100, right: 500, bottom: 400, left: 200 }

describe('dismissible dialog hit testing', () => {
  it('detects backdrop clicks outside the dialog box', () => {
    expect(isOutsideDialog(rect, 100, 200)).toBe(true)
    expect(isOutsideDialog(rect, 300, 450)).toBe(true)
  })

  it('keeps clicks inside the dialog box', () => {
    expect(isOutsideDialog(rect, 300, 200)).toBe(false)
  })
})
