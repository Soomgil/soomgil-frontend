import type { TripSummary } from './trip'
import type { CommunityPostSummary } from './community'
import type { PlaceProvider, PlaceSourceStatus } from './place'

/**
 * 통합 검색용 장소 요약.
 * 백엔드 PlaceSummary 레코드와 필드를 맞춘다.
 */
export interface PlaceSearchSummary {
  provider: PlaceProvider
  externalPlaceId: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  thumbnailUrl: string | null
  category: string | null
  sourceStatus: PlaceSourceStatus
}

/**
 * 통합 검색용 사용자 결과.
 */
export interface UserSearchResult {
  id: string
  displayName: string
  profileImageUrl: string | null
  followerCount: number
}

/**
 * GET /api/v1/search 응답.
 * trips / places / posts / users 각 섹션을 한 번에 반환한다.
 */
export interface UnifiedSearchResponse {
  query: string
  trips: TripSummary[]
  places: PlaceSearchSummary[]
  posts: CommunityPostSummary[]
  users: UserSearchResult[]
}
