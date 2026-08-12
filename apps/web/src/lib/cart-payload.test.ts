import { describe, expect, it } from 'bun:test'
import type { CartLine } from '@kapi/spec'

import { toSwiggyCartItem } from './cart-payload.ts'

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    id: 'line-1',
    participantId: 'participant-1',
    participantName: 'Arya',
    menuItemId: 'item-1',
    name: 'Sandwich',
    quantity: 2,
    price: 415,
    available: true,
    swiggyItemId: '95911521',
    ...overrides,
  }
}

describe('Swiggy cart payload', () => {
  it('preserves the selected variants and addons', () => {
    expect(
      toSwiggyCartItem(
        line({
          customization: {
            variantsV2: [
              {
                group_id: 'size',
                variation_id: 'large',
                groupName: 'Size',
                name: 'Large',
                price: 20,
              },
            ],
            addons: [
              {
                group_id: 'bread',
                choice_id: 'milk-bread',
                groupName: 'Bread',
                name: 'Milk Bread',
                price: 0,
              },
            ],
          },
        }),
      ),
    ).toEqual({
      menu_item_id: '95911521',
      quantity: 2,
      variantsV2: [{ group_id: 'size', variation_id: 'large' }],
      addons: [{ group_id: 'bread', choice_id: 'milk-bread' }],
    })
  })

  it('omits empty customization arrays', () => {
    expect(toSwiggyCartItem(line({ customization: {} }))).toEqual({
      menu_item_id: '95911521',
      quantity: 2,
    })
  })
})
