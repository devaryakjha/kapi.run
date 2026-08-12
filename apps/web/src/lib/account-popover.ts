export function renderAccountPopover({
  addressDetail,
  addressLabel,
  connected,
  name,
  popover,
}: {
  addressDetail: string
  addressLabel: string
  connected: boolean
  name: string
  popover: HTMLElement
}) {
  const initial = name.trim().charAt(0).toUpperCase() || 'A'
  const detail = addressDetail.startsWith(`${name}:`)
    ? addressDetail.slice(name.length + 1).trim()
    : addressDetail

  setText(popover, '[data-account-avatar]', initial)
  setText(popover, '[data-account-name]', name)
  setText(popover, '[data-account-status]', connected ? 'Swiggy connected' : 'Guest participant')
  setText(popover, '[data-account-address-label]', addressLabel)
  setText(popover, '[data-account-address-detail]', detail)
  popover.dataset.connected = String(connected)
}

function setText(root: HTMLElement, selector: string, value: string) {
  const element = root.querySelector<HTMLElement>(selector)
  if (element) element.textContent = value
}
