type AddonGroup = {
  groupId: string
}

type AddonSelectionRule = {
  minAddons?: number
  maxAddons?: number
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

export function addonSelectionStatus(
  group: AddonSelectionRule,
  selected: number,
) {
  const progress = group.maxAddons
    ? `${selected} of ${group.maxAddons} selected.`
    : `${selected} selected.`
  const minimum = group.minAddons ?? 0

  return minimum > 0 && minimum !== group.maxAddons
    ? `${progress} ${minimum} required.`
    : progress
}
