type AddonGroup = {
  groupId: string
}

export function initialAddonSelections(groups: readonly AddonGroup[]) {
  return Object.fromEntries(groups.map(({ groupId }) => [groupId, []])) as Record<
    string,
    string[]
  >
}

export function toggleAddonSelection(
  current: readonly string[],
  choiceId: string,
  maxAddons?: number,
) {
  if (current.includes(choiceId)) {
    return {
      limitReached: false,
      selection: current.filter((id) => id !== choiceId),
    }
  }

  const maximum = maxAddons && maxAddons > 0 ? maxAddons : Infinity
  if (maximum === 1) {
    return { limitReached: false, selection: [choiceId] }
  }
  if (current.length >= maximum) {
    return { limitReached: true, selection: [...current] }
  }
  return { limitReached: false, selection: [...current, choiceId] }
}
