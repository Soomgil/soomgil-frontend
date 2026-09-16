import type { StyleSpecification } from 'mapbox-gl'
import { MAP_THEMES } from '@/types/map-theme'

// Match the Styles API freshness window; cache only style documents, never tiles.
const TTL = 15 * 60 * 1000
const cache = new Map<string, { style: StyleSpecification; expires: number }>()
const pending = new Map<string, Promise<StyleSpecification | undefined>>()
const keyFor = (url: string, token: string) => `${token}:${url}`

export function cachedMapStyle(url: string, token: string): StyleSpecification | undefined {
  const key = keyFor(url, token)
  const entry = cache.get(key)
  if (!entry) return undefined
  if (entry.expires <= Date.now()) { cache.delete(key); return undefined }
  return structuredClone(entry.style)
}

export function loadMapStyle(url: string, token: string): Promise<StyleSpecification | undefined> {
  if (!token || !MAP_THEMES.some(theme => theme.style === url)) return Promise.resolve(undefined)
  const cached = cachedMapStyle(url, token)
  if (cached) return Promise.resolve(cached)
  const key = keyFor(url, token)
  const existing = pending.get(key)
  if (existing) return existing.then(style => style && structuredClone(style))
  const request = (async () => {
    try {
      const endpoint = `https://api.mapbox.com/styles/v1/${url.replace('mapbox://styles/', '')}?access_token=${encodeURIComponent(token)}`
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) })
      if (!response.ok) return undefined
      const style = await response.json() as StyleSpecification
      if (style.version !== 8 || !Array.isArray(style.layers) || !style.sources) return undefined
      cache.set(key, { style: structuredClone(style), expires: Date.now() + TTL })
      return style
    } catch { return undefined }
    finally { pending.delete(key) }
  })()
  pending.set(key, request)
  return request
}

export async function prefetchMapStyles(token: string) {
  await Promise.all(MAP_THEMES.map(theme => loadMapStyle(theme.style, token)))
}
