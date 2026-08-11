import type { MenuCustomization } from '@kapi/spec'

type StorageReader = Pick<Storage, 'getItem' | 'setItem'>
type CacheEntry = { cachedAt: number; detail: MenuCustomization }

const cachePrefix = 'kapi:customization:'
export const customizationFreshFor = 30 * 60 * 1000

export function customizationCacheKey(
  sessionId: string,
  restaurantId: string,
  itemId: string,
) {
  return `${cachePrefix}${sessionId}:${restaurantId}:${itemId}`
}

export function readCustomizationCache(
  storage: StorageReader,
  key: string,
  now = Date.now(),
) {
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    if (
      !entry.detail?.menuItemId ||
      !Number.isFinite(entry.cachedAt) ||
      now - entry.cachedAt >= customizationFreshFor
    ) {
      return null
    }
    return entry.detail
  } catch {
    return null
  }
}

export function writeCustomizationCache(
  storage: StorageReader,
  key: string,
  detail: MenuCustomization,
  now = Date.now(),
) {
  try {
    storage.setItem(key, JSON.stringify({ cachedAt: now, detail } satisfies CacheEntry))
  } catch {
    // Browser storage remains best-effort.
  }
}
