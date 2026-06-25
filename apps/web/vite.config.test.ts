import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Vite dev server plugins', () => {
  it('does not enable the TanStack devtools install event bus', async () => {
    const [viteConfig, packageJson] = await Promise.all([
      readFile(new URL('./vite.config.ts', import.meta.url), 'utf8'),
      readFile(new URL('./package.json', import.meta.url), 'utf8'),
    ])
    const packageManifest = JSON.parse(packageJson) as {
      devDependencies?: Record<string, string>
    }

    expect(viteConfig).not.toContain('@tanstack/devtools-vite')
    expect(viteConfig).not.toMatch(/\bdevtools\s*\(/)
    expect(packageManifest.devDependencies ?? {}).not.toHaveProperty(
      '@tanstack/devtools-vite',
    )
  })
})
