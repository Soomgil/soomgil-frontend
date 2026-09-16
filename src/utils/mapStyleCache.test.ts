import { afterEach, expect, it, vi } from 'vitest'
import { cachedMapStyle, loadMapStyle, prefetchMapStyles } from './mapStyleCache'
const url = 'mapbox://styles/mapbox/light-v11'
const document = { version: 8, sources: {}, layers: [] }
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it('deduplicates prefetch and returns isolated cached documents', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => document })
  vi.stubGlobal('fetch', fetcher)
  await Promise.all([loadMapStyle(url, 'one'), loadMapStyle(url, 'one')])
  expect(fetcher).toHaveBeenCalledTimes(1)
  const first = cachedMapStyle(url, 'one')!
  first.name = 'changed'
  expect(cachedMapStyle(url, 'one')!.name).toBeUndefined()
  await loadMapStyle(url, 'one')
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('prefetches five themes once and retries failed requests', async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, json: async () => document })
  vi.stubGlobal('fetch', fetcher)
  await prefetchMapStyles('two')
  expect(fetcher).toHaveBeenCalledTimes(5)
  await loadMapStyle(url, 'two')
  expect(fetcher).toHaveBeenCalledTimes(6)
})
it('expires styles and isolates token scopes', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => document }))
  await loadMapStyle(url, 'three')
  expect(cachedMapStyle(url, 'other')).toBeUndefined()
  vi.advanceTimersByTime(15 * 60 * 1000)
  expect(cachedMapStyle(url, 'three')).toBeUndefined()
})
