import type { CartLine, SwiggyCartToolPayload } from '@kapi/spec'

type SwiggyCartItem = SwiggyCartToolPayload['cartItems'][number]

export function toSwiggyCartItem(item: CartLine): SwiggyCartItem {
  const variantsV2 = item.customization?.variantsV2?.map(
    ({ group_id, variation_id }) => ({ group_id, variation_id }),
  )
  const addons = item.customization?.addons?.map(
    ({ group_id, choice_id }) => ({ group_id, choice_id }),
  )

  return {
    menu_item_id: item.swiggyItemId,
    quantity: item.quantity,
    ...(variantsV2?.length ? { variantsV2 } : {}),
    ...(addons?.length ? { addons } : {}),
  }
}
