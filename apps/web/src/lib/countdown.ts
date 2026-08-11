type CountdownSource = {
  cutoffAt?: string
  cutoffTime: string
  status?: string
}

export function countdownShouldRun(source: CountdownSource | null) {
  return !source || !source.status || source.status === 'open'
}

export function countdownLabel(source: CountdownSource, now = new Date()) {
  if (source.status === 'locked') return 'Order locked'
  if (source.status === 'synced') return 'Cart synced'
  if (source.status === 'sync_failed') return 'Sync failed'

  const target = source.cutoffAt ? new Date(source.cutoffAt).getTime() : NaN
  if (!Number.isFinite(target)) return source.cutoffTime

  const remaining = Math.max(0, target - now.getTime())
  const days = Math.floor(remaining / 86_400_000)
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000)
  const minutes = Math.floor((remaining % 3_600_000) / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1_000)
  return `${days ? `${days}d ` : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function startLiveCountdown(
  element: HTMLElement,
  getSource: () => CountdownSource | null,
) {
  let timeout: number | undefined
  const value = document.createElement('span')
  value.className = 'timer-pill__value'
  element.replaceChildren(value)

  function paint() {
    const source = getSource()
    if (!source) return countdownShouldRun(source)
    element.dataset.status = source.status ?? 'open'
    value.textContent = countdownLabel(source)
    return countdownShouldRun(source)
  }

  function schedule() {
    window.clearTimeout(timeout)
    const live = paint()
    if (document.hidden || !live) return
    const untilNextSecond = 1000 - (Date.now() % 1000) + 16
    timeout = window.setTimeout(schedule, untilNextSecond)
  }

  function onVisibilityChange() {
    if (document.hidden) window.clearTimeout(timeout)
    else schedule()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', () => {
    window.clearTimeout(timeout)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }, { once: true })
  schedule()
  return paint
}
