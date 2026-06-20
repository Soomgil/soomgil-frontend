import { beforeEach, describe, expect, it, vi } from 'vitest'
import http from './http'
import { formatViewportBbox, geoApi } from './geo.api'

vi.mock('./http', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

describe('geoApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('법정동 검색 조건을 전달한다', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: { items: [], page: {} } })
    const params = { q: '종로구', level: 'SIGUNGU' as const, isActive: true, page: 0, size: 20 }
    const controller = new AbortController()

    await geoApi.searchLegalRegions(params, controller.signal)

    expect(http.get).toHaveBeenCalledWith('/legal-regions', {
      params,
      paramsSerializer: { indexes: null },
      signal: controller.signal,
    })
  })

  it('viewport를 bbox 순서로 직렬화한다', async () => {
    const viewport = { minLng: 126.9, minLat: 37.4, maxLng: 127.2, maxLat: 37.7 }
    const controller = new AbortController()
    vi.mocked(http.get).mockResolvedValue({ data: { viewport } })

    await geoApi.summarizeViewport(viewport, controller.signal)

    expect(formatViewportBbox(viewport)).toBe('126.9,37.4,127.2,37.7')
    expect(http.get).toHaveBeenCalledWith('/viewport', {
      params: { bbox: '126.9,37.4,127.2,37.7' },
      signal: controller.signal,
    })
  })

  it('좌표 단순화 제한을 전달한다', async () => {
    const request = {
      coordinates: [{ lng: 127, lat: 36 }, { lng: 128, lat: 37 }],
      maxPoints: 100,
    }
    vi.mocked(http.post).mockResolvedValue({ data: { coordinates: request.coordinates } })

    await geoApi.simplifyCoordinates(request)

    expect(http.post).toHaveBeenCalledWith('/coordinates/simplify', request)
  })
})
