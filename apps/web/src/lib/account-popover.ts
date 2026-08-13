export function renderAccountPopover({
  addressDetail,
  addressLabel,
  connected,
  role = 'member',
  name,
  popover,
}: {
  addressDetail: string
  addressLabel: string
  connected: boolean
  role?: 'owner' | 'admin' | 'member'
  name: string
  popover: HTMLElement
}) {
  const initial = name.trim().charAt(0).toUpperCase() || 'A'
  const detail = addressDetail.startsWith(`${name}:`)
    ? addressDetail.slice(name.length + 1).trim()
    : addressDetail

  setText(popover, '[data-account-avatar]', initial)
  setText(popover, '[data-account-name]', name)
  setText(
    popover,
    '[data-account-status]',
    connected
      ? `Swiggy connected · ${role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : 'Member'}`
      : role === 'admin'
        ? 'Admin · Swiggy not connected'
        : role === 'owner'
          ? 'Owner'
          : 'Member',
  )
  setText(popover, '[data-account-address-label]', addressLabel)
  setText(popover, '[data-account-address-detail]', detail)
  popover.dataset.connected = String(connected)
}

function setText(root: HTMLElement, selector: string, value: string) {
  const element = root.querySelector<HTMLElement>(selector)
  if (element) element.textContent = value
}
