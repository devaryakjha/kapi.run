import { describe, expect, it } from 'bun:test'

import { cartCustomizationDetails } from './cart-customization.ts'

describe('cart customization details', () => {
  it('groups exact variant and add-on choices by their labels', () => {
    expect(
      cartCustomizationDetails({
        customization: {
          variantsV2: [{
            group_id: 'size',
            variation_id: 'large',
            groupName: 'Size',
            name: 'Large',
            price: 20,
          }],
          addons: [
            {
              group_id: 'dip',
              choice_id: 'hummus',
              groupName: 'Dips',
              name: 'Hummus',
              price: 40,
            },
            {
              group_id: 'dip',
              choice_id: 'salsa',
              groupName: 'Dips',
              name: 'Salsa',
              price: 30,
            },
          ],
        },
      }),
    ).toEqual(['Size: Large', 'Dips: Hummus, Salsa'])
  })

  it('uses the saved summary for legacy items without named choices', () => {
    expect(
      cartCustomizationDetails({
        customization: {
          addons: [{ group_id: 'bread', choice_id: 'milk-bread' }],
        },
        customizationSummary: 'Bread: Milk bread',
      }),
    ).toEqual(['Bread: Milk bread'])
  })
})
