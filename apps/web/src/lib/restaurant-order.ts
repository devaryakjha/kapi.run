type RestaurantAvailability = {
  availabilityStatus: 'OPEN' | 'CLOSED'
}

export function orderRestaurantsByAvailability<T extends RestaurantAvailability>(
  restaurants: readonly T[],
) {
  return [...restaurants].sort(
    (left, right) =>
      Number(right.availabilityStatus === 'OPEN') -
      Number(left.availabilityStatus === 'OPEN'),
  )
}
