import { describe, expect, it } from 'bun:test'

import {
  customizationCacheKey,
  customizationFreshFor,
  readCustomizationCache,
  writeCustomizationCache,
} from './customization-cache.ts'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('customization cache', () => {
  it('reuses fresh item customization data', () => {
    const storage = memoryStorage()
    const key = customizationCacheKey('session', 'restaurant', 'item')
    const detail = { menuItemId: 'item', addons: [] }
    writeCustomizationCache(storage, key, detail, 100)
    expect(readCustomizationCache(storage, key, 200)).toEqual(detail)
  })

  it('expires stale item customization data', () => {
    const storage = memoryStorage()
    const key = customizationCacheKey('session', 'restaurant', 'item')
    writeCustomizationCache(storage, key, { menuItemId: 'item' }, 100)
    expect(readCustomizationCache(storage, key, 100 + customizationFreshFor)).toBeNull()
  })
})
