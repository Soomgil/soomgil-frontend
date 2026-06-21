import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { geoApi } from '@/api/geo.api'
import type { ViewportSummary } from '@/types/geo'
import { useMapViewport } from './useMapViewport'

vi.mock('@/api/geo.api', () => ({
  geoApi: { summarizeViewport: vi.fn() },
}))

describe('useMapViewport', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => vi.useRealTimers())

  it('연속된 viewport 변경은 마지막 요청만 전송한다', async () => {
    const viewport = { minLng: 126.9, minLat: 37.4, maxLng: 127.2, maxLat: 37.7 }
    const result = {
      viewport,
      center: { lng: 127.05, lat: 37.55 },
      widthMeters: 100,
      heightMeters: 200,
    }
    vi.mocked(geoApi.summarizeViewport).mockResolvedValue(result)
    const state = useMapViewport()

    state.updateViewport({ minLng: 126, minLat: 37, maxLng: 127, maxLat: 38 })
    state.updateViewport(viewport)
    expect(geoApi.summarizeViewport).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(250)

    expect(geoApi.summarizeViewport).toHaveBeenCalledOnce()
    expect(geoApi.summarizeViewport).toHaveBeenCalledWith(viewport, expect.any(AbortSignal))
    expect(state.viewport.value).toEqual(viewport)
    expect(state.summary.value).toEqual(result)
    expect(state.center.value).toEqual(result.center)
    expect(state.loading.value).toBe(false)
  })

  it('새 viewport가 들어오면 진행 중 요청을 취소하고 이전 요약을 비운다', async () => {
    let resolveFirst!: (value: ViewportSummary) => void
    const firstResult = new Promise<ViewportSummary>((resolve) => { resolveFirst = resolve })
    const first = { minLng: 126, minLat: 36, maxLng: 127, maxLat: 37 }
    const second = { minLng: 127, minLat: 37, maxLng: 128, maxLat: 38 }
    const secondResult = { viewport: second, center: { lng: 127.5, lat: 37.5 }, widthMeters: 1, heightMeters: 1 }
    vi.mocked(geoApi.summarizeViewport)
      .mockReturnValueOnce(firstResult)
      .mockResolvedValueOnce(secondResult)
    const state = useMapViewport()

    state.updateViewport(first)
    await vi.advanceTimersByTimeAsync(250)
    const firstSignal = vi.mocked(geoApi.summarizeViewport).mock.calls[0]?.[1]

    state.updateViewport(second)
    expect(firstSignal?.aborted).toBe(true)
    expect(state.summary.value).toBeNull()
    await vi.advanceTimersByTimeAsync(250)

    resolveFirst({ viewport: first, center: { lng: 126.5, lat: 36.5 }, widthMeters: 1, heightMeters: 1 })
    await Promise.resolve()

    expect(state.viewport.value).toEqual(second)
    expect(state.summary.value).toEqual(secondResult)
  })

  it('실패 상태를 노출하고 현재 viewport를 즉시 재시도한다', async () => {
    const viewport = { minLng: 126.9, minLat: 37.4, maxLng: 127.2, maxLat: 37.7 }
    const result = {
      viewport,
      center: { lng: 127.05, lat: 37.55 },
      widthMeters: 100,
      heightMeters: 200,
    }
    vi.mocked(geoApi.summarizeViewport)
      .mockRejectedValueOnce(new Error('network details'))
      .mockResolvedValueOnce(result)
    const state = useMapViewport()

    state.updateViewport(viewport)
    await vi.advanceTimersByTimeAsync(250)

    expect(state.error.value).toBe('지도 범위를 동기화하지 못했습니다.')
    expect(state.loading.value).toBe(false)

    state.retry()
    await Promise.resolve()

    expect(geoApi.summarizeViewport).toHaveBeenCalledTimes(2)
    expect(state.summary.value).toEqual(result)
    expect(state.error.value).toBeNull()
  })
})
