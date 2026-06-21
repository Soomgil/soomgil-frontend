import http from './http'
import type {
  LegalRegionPage,
  LegalRegionSearchParams,
  SimplifiedCoordinates,
  SimplifyCoordinatesRequest,
  Viewport,
  ViewportSummary,
} from '@/types/geo'

export function formatViewportBbox(viewport: Viewport) {
  return [viewport.minLng, viewport.minLat, viewport.maxLng, viewport.maxLat].join(',')
}

export const geoApi = {
  searchLegalRegions: async (params: LegalRegionSearchParams = {}, signal?: AbortSignal): Promise<LegalRegionPage> => {
    const response = await http.get<LegalRegionPage>('/legal-regions', {
      params,
      paramsSerializer: { indexes: null },
      ...(signal ? { signal } : {}),
    })
    return response.data
  },

  summarizeViewport: async (viewport: Viewport, signal?: AbortSignal): Promise<ViewportSummary> => {
    const response = await http.get<ViewportSummary>('/viewport', {
      params: { bbox: formatViewportBbox(viewport) },
      ...(signal ? { signal } : {}),
    })
    return response.data
  },

  simplifyCoordinates: async (request: SimplifyCoordinatesRequest): Promise<SimplifiedCoordinates> => {
    const response = await http.post<SimplifiedCoordinates>('/coordinates/simplify', request)
    return response.data
  },
}
