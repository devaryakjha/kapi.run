import type { CartCustomization } from '@kapi/spec'

type CustomizationSource = {
  customization?: CartCustomization
  customizationSummary?: string
}

export function cartCustomizationDetails({
  customization,
  customizationSummary,
}: CustomizationSource) {
  const selections = [
    ...(customization?.variantsV2 ?? []),
    ...(customization?.addons ?? []),
  ]
  const named = selections.filter(({ name }) => name?.trim())
  const savedSummary = customizationSummary?.trim()
  if (named.length !== selections.length && savedSummary) return [savedSummary]

  const groups = new Map<string, string[]>()
  const ungrouped: string[] = []
  for (const selection of named) {
    const name = selection.name!.trim()
    const groupName = selection.groupName?.trim()
    if (!groupName) {
      ungrouped.push(name)
      continue
    }
    groups.set(groupName, [...(groups.get(groupName) ?? []), name])
  }

  const details = [
    ...[...groups].map(([groupName, choices]) =>
      `${groupName}: ${choices.join(', ')}`,
    ),
    ...ungrouped,
  ]
  return details.length ? details : savedSummary ? [savedSummary] : []
}
