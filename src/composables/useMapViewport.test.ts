import { beforeEach, describe, expect, it, vi } from 'vitest'
import { geoApi } from '@/api/geo.api'
import type { ViewportSummary } from '@/types/geo'
import { useMapViewport } from './useMapViewport'

vi.mock('@/api/geo.api', () => ({
  geoApi: { summarizeViewport: vi.fn() },
}))

describe('useMapViewport', () => {
  beforeEach(() => vi.clearAllMocks())

  it('최신 viewport 요약과 center를 유지한다', async () => {
    const viewport = { minLng: 126.9, minLat: 37.4, maxLng: 127.2, maxLat: 37.7 }
    const result = {
      viewport,
      center: { lng: 127.05, lat: 37.55 },
      widthMeters: 100,
      heightMeters: 200,
    }
    vi.mocked(geoApi.summarizeViewport).mockResolvedValue(result)
    const state = useMapViewport()

    await state.updateViewport(viewport)

    expect(state.viewport.value).toEqual(viewport)
    expect(state.summary.value).toEqual(result)
    expect(state.center.value).toEqual(result.center)
    expect(state.loading.value).toBe(false)
  })

  it('늦게 끝난 이전 요청으로 최신 viewport를 덮어쓰지 않는다', async () => {
    let resolveFirst!: (value: ViewportSummary) => void
    const firstResult = new Promise<ViewportSummary>((resolve) => { resolveFirst = resolve })
    const first = { minLng: 126, minLat: 36, maxLng: 127, maxLat: 37 }
    const second = { minLng: 127, minLat: 37, maxLng: 128, maxLat: 38 }
    const secondResult = { viewport: second, center: { lng: 127.5, lat: 37.5 }, widthMeters: 1, heightMeters: 1 }
    vi.mocked(geoApi.summarizeViewport)
      .mockReturnValueOnce(firstResult)
      .mockResolvedValueOnce(secondResult)
    const state = useMapViewport()

    const firstRequest = state.updateViewport(first)
    await state.updateViewport(second)
    resolveFirst({ viewport: first, center: { lng: 126.5, lat: 36.5 }, widthMeters: 1, heightMeters: 1 })
    await firstRequest

    expect(state.viewport.value).toEqual(second)
    expect(state.summary.value).toEqual(secondResult)
  })
})
