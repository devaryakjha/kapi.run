export function renderAccountPopover({
  addressDetail,
  addressLabel,
  connected,
  name,
  popover,
  trigger,
}: {
  addressDetail: string
  addressLabel: string
  connected: boolean
  name: string
  popover: HTMLElement
  trigger: HTMLElement
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

  if (popover.dataset.bound === 'true') return
  popover.dataset.bound = 'true'
  popover.addEventListener('toggle', () => {
    if (!popover.matches(':popover-open')) return
    const triggerRect = trigger.getBoundingClientRect()
    const width = 256
    const left = Math.max(8, Math.min(innerWidth - width - 8, triggerRect.right - width))
    popover.style.left = `${left}px`
    popover.style.top = `${triggerRect.bottom + 8}px`
  })
}

function setText(root: HTMLElement, selector: string, value: string) {
  const element = root.querySelector<HTMLElement>(selector)
  if (element) element.textContent = value
}
