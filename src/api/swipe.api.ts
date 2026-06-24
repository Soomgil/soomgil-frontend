import http from './http'
import { mapPlace } from './place.api'
import type { PageMeta, PagedItems } from '@/types/api'
import type { PlaceAccessibilityDto } from './place.api'
import type { PlaceProvider, PlaceRecommendation, SavedPlace, TagPreparationStatus, UserSummary } from '@/types/place'
import type { RecommendationTab, SwipeAction, SwipeFeed, SwipeReactionResult, SwipeTagStatus } from '@/types/swipe'

interface PlaceSummaryDto {
  provider: PlaceProvider
  externalPlaceId: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  thumbnailUrl: string | null
  category: string | null
  sourceStatus: 'AVAILABLE' | 'DELETED' | 'UNKNOWN'
  description?: string | null
  photos?: string[] | null
  tags?: string[] | null
  tagStatus?: TagPreparationStatus | null
  accessibility?: PlaceAccessibilityDto | null
}

interface SwipeFeedDto {
  items: Array<{
    place: PlaceSummaryDto
    myReaction: SwipeAction | null
    likedByFollowees: UserSummary[]
  }>
  nextSeed: string | null
}

interface SavedPlaceDto {
  id: string
  place: PlaceSummaryDto
  createdAt: string
}

interface RecommendationDto {
  place: PlaceSummaryDto
  matchedMembers: UserSummary[]
  rank: number | null
  distanceMeters: number | null
  recommendationReason: string | null
  matchPercentage: number | null
}

export interface SwipeFeedParams {
  legalRegionCode?: string
  category?: string
  limit?: number
  excludeRecent?: boolean
  seed?: string
}

export interface RecommendationParams {
  bbox: string
  centerLat?: number
  centerLng?: number
  tab?: RecommendationTab
  page?: number
  size?: number
}

export const swipeApi = {
  async getFeed(params: SwipeFeedParams = {}): Promise<SwipeFeed> {
    const response = await http.get<SwipeFeedDto>('/swipe/feed', { params })
    return {
      items: response.data.items.map((item) => ({ ...item, place: mapPlace(item.place) })),
      nextSeed: response.data.nextSeed,
    }
  },

  async react(
    provider: PlaceProvider,
    externalPlaceId: string,
    reaction: SwipeAction,
  ): Promise<SwipeReactionResult> {
    const response = await http.put<SwipeReactionResult>(
      `/places/${provider}/${externalPlaceId}/swipe-reaction`,
      { reaction, source: 'swipe-feed' },
    )
    return response.data
  },

  async getTagStatuses(externalPlaceIds: string[]): Promise<SwipeTagStatus[]> {
    const response = await http.get<SwipeTagStatus[]>('/swipe/tags', {
      params: { externalPlaceIds: externalPlaceIds.join(',') },
    })
    return response.data
  },

  async listSaved(page = 0, size = 20): Promise<PagedItems<SavedPlace>> {
    const response = await http.get<{ items: SavedPlaceDto[]; page: PageMeta }>('/me/saved-places', {
      params: { page, size },
    })
    return {
      items: response.data.items.map((item) => ({ ...item, place: mapPlace(item.place) })),
      page: response.data.page,
    }
  },

  async savePlace(provider: PlaceProvider, externalPlaceId: string): Promise<SavedPlace> {
    const response = await http.put<SavedPlaceDto>(`/places/${provider}/${externalPlaceId}/save`)
    return { ...response.data, place: mapPlace(response.data.place) }
  },

  async unsavePlace(provider: PlaceProvider, externalPlaceId: string): Promise<void> {
    await http.delete(`/places/${provider}/${externalPlaceId}/save`)
  },

  async getRecommendations(
    tripId: string,
    params: RecommendationParams,
  ): Promise<PagedItems<PlaceRecommendation>> {
    const response = await http.get<{ items: RecommendationDto[]; page: PageMeta }>(
      `/trips/${tripId}/place-recommendations`,
      { params },
    )
    return {
      items: response.data.items.map((item) => ({ ...item, place: mapPlace(item.place) })),
      page: response.data.page,
    }
  },
}
