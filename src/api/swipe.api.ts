import http from './http'
import type { ApiResponse } from '@/types/api'
import type { PreferenceSummary } from '@/types/swipe'

export const swipeApi = {
  /** 취향 요약 조회 */
  getPreferenceSummary: async (tripId: string): Promise<ApiResponse<PreferenceSummary>> => {
    // TODO: return http.get(`/trips/${tripId}/preference-summary`)
    return {
      status: 200, message: 'ok',
      data: {
        topTags: [
          { tagCode: 'cafe', displayName: '카페', weight: 0.85 },
          { tagCode: 'nature', displayName: '자연', weight: 0.72 },
          { tagCode: 'healing', displayName: '힐링', weight: 0.60 },
        ],
        likedPlaces: [],
        matchRate: 78,
      },
    }
  },
}
