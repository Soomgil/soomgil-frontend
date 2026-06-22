import http from './http'
import type { UnifiedSearchResponse } from '@/types/search'

/**
 * 통합 검색 API.
 * GET /api/v1/search?q=&size= — trips/places/posts/users 각 4개씩(기본) 반환.
 */
export const searchApi = {
  async unified(query: string, size = 4): Promise<UnifiedSearchResponse> {
    const params: Record<string, string | number> = { size }
    const trimmed = query.trim()
    if (trimmed) params.q = trimmed
    const response = await http.get<UnifiedSearchResponse>('/search', { params })
    return response.data
  },
}
