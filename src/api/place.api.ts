import http from './http'
import type { ApiResponse } from '@/types/api'
import type { Place, PlaceReactionType, SavedPlace } from '@/types/place'
import { mockPlaces } from '@/mocks/mockPlaces'

export const placeApi = {
  /** 스와이프 후보 장소 목록 */
  getSwipeCandidates: async (tripId: string): Promise<ApiResponse<Place[]>> => {
    // TODO: return http.get(`/trips/${tripId}/places/candidates`)
    return { status: 200, message: 'ok', data: mockPlaces }
  },

  /** 장소 반응 (LIKE/NOPE/SUPER_LIKE) 저장 */
  saveReaction: async (tripId: string, provider: string, externalPlaceId: string, reaction: PlaceReactionType): Promise<ApiResponse<void>> => {
    // TODO: return http.post(`/trips/${tripId}/places/${provider}/${externalPlaceId}/reactions`, { reaction })
    return { status: 200, message: 'ok', data: undefined as unknown as void }
  },

  /** 장소 검색 */
  getPlaces: async (params?: { query?: string; lat?: number; lng?: number; radius?: number }): Promise<ApiResponse<Place[]>> => {
    // TODO: return http.get('/places', { params })
    return { status: 200, message: 'ok', data: mockPlaces }
  },

  /** 장소 상세 */
  getPlace: async (provider: string, externalPlaceId: string): Promise<ApiResponse<Place>> => {
    return http.get(`/places/${provider}/${externalPlaceId}`)
  },

  /** 찜한 장소 목록 */
  getSavedPlaces: async (): Promise<ApiResponse<SavedPlace[]>> => {
    // TODO: return http.get('/saved-places')
    return { status: 200, message: 'ok', data: [] }
  },
}
